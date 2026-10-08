import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { writeAudit } from '../middleware/audit.js';
import { isDay } from '../carMoney.js';

const router = Router();

router.use(authenticate, requireRole('DISPATCHER', 'ADMIN'));

function fail(res, status, code, message, field) {
  return res.status(status).json({ error: { code, message, ...(field ? { field } : {}) } });
}

function serverError(res, label, err) {
  console.error(label, err);
  return fail(res, 500, 'INTERNAL_ERROR', 'Внутренняя ошибка сервера');
}

function branchFilter(user, alias, params) {
  if (user.role === 'DISPATCHER' && user.branch_id) {
    params.push(user.branch_id);
    return ` AND ${alias}.branch_id = $${params.length}`;
  }
  return '';
}

function readMoney(value) {
  if (value === undefined || value === null || value === '') return 0;
  const n = Number(String(value).replace(/\s+/g, ''));
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : NaN;
}

const DRIVER_SELECT = `
  SELECT d.id, d.user_id, d.branch_id, d.passport, d.license_no, d.license_expires, d.status,
         d.deposit, d.archived_at, d.created_at,
         u.full_name, u.phone, u.login,
         b.name AS branch_name,
         (SELECT c.plate FROM car_assignments ca JOIN cars c ON c.id = ca.car_id
           WHERE ca.driver_id = d.id AND ca.end_at IS NULL LIMIT 1) AS car_plate,
         (SELECT ca.car_id FROM car_assignments ca
           WHERE ca.driver_id = d.id AND ca.end_at IS NULL LIMIT 1) AS car_id
  FROM drivers d
  JOIN users u ON d.user_id = u.id
  LEFT JOIN branches b ON d.branch_id = b.id`;

// GET / — Список водителей (?archived=1 — архив)
router.get('/', async (req, res) => {
  try {
    const params = [];
    let query = `${DRIVER_SELECT} WHERE ${req.query.archived === '1' ? 'd.archived_at IS NOT NULL' : 'd.archived_at IS NULL'}`;
    query += branchFilter(req.user, 'd', params);
    query += ' ORDER BY u.full_name';
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    serverError(res, 'Ошибка получения списка водителей:', err);
  }
});

async function loadDriver(req, res) {
  const params = [parseInt(req.params.id, 10)];
  const query = `${DRIVER_SELECT} WHERE d.id = $1${branchFilter(req.user, 'd', params)}`;
  const { rows } = await pool.query(query, params);
  if (!rows.length) {
    fail(res, 404, 'NOT_FOUND', 'Водитель не найден');
    return null;
  }
  return rows[0];
}

// GET /:id — Карточка водителя с историей депозита и машин
router.get('/:id', async (req, res) => {
  try {
    const driver = await loadDriver(req, res);
    if (!driver) return;
    const { rows: deposits } = await pool.query(
      `SELECT h.id, h.old_value, h.new_value, h.reason, h.created_at, u.full_name AS author_name
       FROM driver_deposit_history h LEFT JOIN users u ON u.id = h.changed_by
       WHERE h.driver_id = $1 ORDER BY h.id DESC LIMIT 50`,
      [driver.id]
    );
    const { rows: cars } = await pool.query(
      `SELECT ca.id, ca.car_id, ca.start_at, ca.end_at, ca.mileage_start, ca.mileage_end,
              c.plate, c.brand, c.model
       FROM car_assignments ca JOIN cars c ON c.id = ca.car_id
       WHERE ca.driver_id = $1 ORDER BY ca.start_at DESC LIMIT 30`,
      [driver.id]
    );
    res.json({ ...driver, deposit_history: deposits, assignments: cars });
  } catch (err) {
    serverError(res, 'Ошибка получения водителя:', err);
  }
});

// POST / — Создание водителя (админ и диспетчер)
router.post('/', async (req, res) => {
  const { full_name, phone, login, password, passport, license_no, license_expires } = req.body;
  const branchId = req.user.role === 'DISPATCHER' && req.user.branch_id
    ? req.user.branch_id
    : (req.body.branch_id ? Number(req.body.branch_id) : null);
  const deposit = readMoney(req.body.deposit);

  if (!full_name || !String(full_name).trim()) return fail(res, 400, 'BAD_REQUEST', 'Укажите ФИО', 'full_name');
  if (!login || !String(login).trim()) return fail(res, 400, 'BAD_REQUEST', 'Укажите логин', 'login');
  if (!password || String(password).length < 6) return fail(res, 400, 'BAD_REQUEST', 'Пароль — минимум 6 символов', 'password');
  if (phone && !/^\+998[0-9]{9}$/.test(phone)) return fail(res, 400, 'BAD_REQUEST', 'Телефон в формате +998XXXXXXXXX', 'phone');
  if (license_expires && !isDay(license_expires)) return fail(res, 400, 'BAD_REQUEST', 'Неверная дата ВУ', 'license_expires');
  if (Number.isNaN(deposit)) return fail(res, 400, 'BAD_REQUEST', 'Неверная сумма депозита', 'deposit');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const hash = await bcrypt.hash(String(password), 10);
    const { rows: users } = await client.query(
      `INSERT INTO users (role, full_name, phone, login, password_hash, status, must_change_password)
       VALUES ('DRIVER', $1, $2, $3, $4, 'ACTIVE', 1) RETURNING id`,
      [String(full_name).trim(), phone || null, String(login).trim(), hash]
    );
    const userId = users[0].id;
    if (branchId) {
      await client.query('INSERT INTO user_branches (user_id, branch_id) VALUES ($1, $2)', [userId, branchId]);
    }
    const { rows } = await client.query(
      `INSERT INTO drivers (user_id, branch_id, passport, license_no, license_expires, deposit, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'FREE') RETURNING id, user_id, branch_id, status, deposit`,
      [userId, branchId, passport || null, license_no || null, license_expires || null, deposit]
    );
    const driver = rows[0];
    if (deposit > 0) {
      await client.query(
        `INSERT INTO driver_deposit_history (driver_id, old_value, new_value, reason, changed_by)
         VALUES ($1, 0, $2, 'Депозит при создании', $3)`,
        [driver.id, deposit, req.user.id]
      );
    }
    await writeAudit(client, req.user.id, 'DRIVER_CREATED', 'driver', driver.id, null,
      { ...driver, full_name, login }, req.ip);
    await client.query('COMMIT');
    res.status(201).json(driver);
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') return fail(res, 409, 'CONFLICT', 'Такой логин или телефон уже занят');
    serverError(res, 'Ошибка создания водителя:', err);
  } finally {
    client.release();
  }
});

// PATCH /:id — Редактирование (админ и диспетчер). Депозит меняется отдельно.
router.patch('/:id', async (req, res) => {
  try {
    const driver = await loadDriver(req, res);
    if (!driver) return;
    const { passport, license_no, license_expires, full_name, phone, login, password } = req.body;

    if (full_name !== undefined && !String(full_name).trim()) return fail(res, 400, 'BAD_REQUEST', 'Укажите ФИО', 'full_name');
    if (phone && !/^\+998[0-9]{9}$/.test(phone)) return fail(res, 400, 'BAD_REQUEST', 'Телефон в формате +998XXXXXXXXX', 'phone');
    if (license_expires && !isDay(license_expires)) return fail(res, 400, 'BAD_REQUEST', 'Неверная дата ВУ', 'license_expires');
    if (login !== undefined && !String(login).trim()) return fail(res, 400, 'BAD_REQUEST', 'Укажите логин', 'login');
    if (password && String(password).length < 6) return fail(res, 400, 'BAD_REQUEST', 'Пароль — минимум 6 символов', 'password');

    const driverSets = [];
    const driverParams = [];
    const put = (list, params, column, value) => { params.push(value); list.push(`${column} = $${params.length}`); };
    if (passport !== undefined) put(driverSets, driverParams, 'passport', passport || null);
    if (license_no !== undefined) put(driverSets, driverParams, 'license_no', license_no || null);
    if (license_expires !== undefined) put(driverSets, driverParams, 'license_expires', license_expires || null);
    if (req.user.role === 'ADMIN' && req.body.branch_id !== undefined) {
      put(driverSets, driverParams, 'branch_id', req.body.branch_id ? Number(req.body.branch_id) : null);
    }

    const userSets = [];
    const userParams = [];
    if (full_name !== undefined) put(userSets, userParams, 'full_name', String(full_name).trim());
    if (phone !== undefined) put(userSets, userParams, 'phone', phone || null);
    if (login !== undefined) put(userSets, userParams, 'login', String(login).trim());
    if (password) put(userSets, userParams, 'password_hash', await bcrypt.hash(String(password), 10));

    if (!driverSets.length && !userSets.length) return fail(res, 400, 'BAD_REQUEST', 'Нет данных для обновления');

    if (driverSets.length) {
      driverParams.push(driver.id);
      await pool.query(`UPDATE drivers SET ${driverSets.join(', ')} WHERE id = $${driverParams.length}`, driverParams);
    }
    if (userSets.length) {
      userParams.push(driver.user_id);
      await pool.query(`UPDATE users SET ${userSets.join(', ')} WHERE id = $${userParams.length}`, userParams);
    }
    if (req.user.role === 'ADMIN' && req.body.branch_id !== undefined) {
      await pool.query('DELETE FROM user_branches WHERE user_id = $1', [driver.user_id]);
      if (req.body.branch_id) {
        await pool.query('INSERT INTO user_branches (user_id, branch_id) VALUES ($1, $2)',
          [driver.user_id, Number(req.body.branch_id)]);
      }
    }
    const changes = { ...req.body };
    if (changes.password) changes.password = '***';
    await writeAudit(pool, req.user.id, 'DRIVER_UPDATED', 'driver', driver.id, null, changes, req.ip);
    res.json({ id: driver.id, updated: true });
  } catch (err) {
    if (err.code === '23505') return fail(res, 409, 'CONFLICT', 'Такой логин или телефон уже занят');
    serverError(res, 'Ошибка редактирования водителя:', err);
  }
});

// POST /:id/deposit — Изменение депозита (только админ, с историей)
router.post('/:id/deposit', requireRole('ADMIN'), async (req, res) => {
  try {
    const driver = await loadDriver(req, res);
    if (!driver) return;
    const value = readMoney(req.body.deposit);
    if (req.body.deposit === undefined || req.body.deposit === '' || Number.isNaN(value)) {
      return fail(res, 400, 'BAD_REQUEST', 'Укажите сумму депозита', 'deposit');
    }
    const reason = req.body.reason ? String(req.body.reason).trim().slice(0, 300) : null;
    await pool.query('UPDATE drivers SET deposit = $1 WHERE id = $2', [value, driver.id]);
    await pool.query(
      `INSERT INTO driver_deposit_history (driver_id, old_value, new_value, reason, changed_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [driver.id, Number(driver.deposit || 0), value, reason, req.user.id]
    );
    await writeAudit(pool, req.user.id, 'DRIVER_DEPOSIT_CHANGED', 'driver', driver.id,
      { deposit: driver.deposit }, { deposit: value, reason }, req.ip);
    res.json({ id: driver.id, deposit: value });
  } catch (err) {
    serverError(res, 'Ошибка изменения депозита:', err);
  }
});

async function hasActiveCar(driverId) {
  const { rows } = await pool.query(
    'SELECT id FROM car_assignments WHERE driver_id = $1 AND end_at IS NULL', [driverId]
  );
  return rows.length > 0;
}

// POST /:id/archive — В архив (админ и диспетчер)
router.post('/:id/archive', async (req, res) => {
  try {
    const driver = await loadDriver(req, res);
    if (!driver) return;
    if (driver.archived_at) return fail(res, 409, 'CONFLICT', 'Водитель уже в архиве');
    if (await hasActiveCar(driver.id)) {
      return fail(res, 409, 'CONFLICT', 'Сначала примите у водителя машину');
    }
    await pool.query(`UPDATE drivers SET status = 'ARCHIVED', archived_at = datetime('now') WHERE id = $1`, [driver.id]);
    await pool.query(`UPDATE users SET status = 'ARCHIVED', archived_at = datetime('now'), archived_by = $1 WHERE id = $2`,
      [req.user.id, driver.user_id]);
    await writeAudit(pool, req.user.id, 'DRIVER_ARCHIVED', 'driver', driver.id, null, { full_name: driver.full_name }, req.ip);
    res.json({ id: driver.id, status: 'ARCHIVED' });
  } catch (err) {
    serverError(res, 'Ошибка архивации водителя:', err);
  }
});

// POST /:id/restore — Вернуть из архива
router.post('/:id/restore', async (req, res) => {
  try {
    const driver = await loadDriver(req, res);
    if (!driver) return;
    if (!driver.archived_at) return fail(res, 409, 'CONFLICT', 'Водитель не в архиве');
    await pool.query(`UPDATE drivers SET status = 'FREE', archived_at = NULL WHERE id = $1`, [driver.id]);
    await pool.query(`UPDATE users SET status = 'ACTIVE', archived_at = NULL, archived_by = NULL WHERE id = $1`, [driver.user_id]);
    await writeAudit(pool, req.user.id, 'DRIVER_RESTORED', 'driver', driver.id, null, { full_name: driver.full_name }, req.ip);
    res.json({ id: driver.id, status: 'FREE' });
  } catch (err) {
    serverError(res, 'Ошибка восстановления водителя:', err);
  }
});

// DELETE /:id — Полное удаление (только админ). История машин остаётся без имени.
router.delete('/:id', requireRole('ADMIN'), async (req, res) => {
  try {
    const driver = await loadDriver(req, res);
    if (!driver) return;
    if (await hasActiveCar(driver.id)) {
      return fail(res, 409, 'CONFLICT', 'Сначала примите у водителя машину');
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM driver_deposit_history WHERE driver_id = $1', [driver.id]);
      await client.query('DELETE FROM drivers WHERE id = $1', [driver.id]);
      await client.query('DELETE FROM user_branches WHERE user_id = $1', [driver.user_id]);
      await client.query('DELETE FROM users WHERE id = $1', [driver.user_id]);
      await writeAudit(client, req.user.id, 'DRIVER_DELETED', 'driver', driver.id, {
        full_name: driver.full_name, login: driver.login, passport: driver.passport, deposit: driver.deposit,
      }, null, req.ip);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
    res.json({ id: driver.id, deleted: true });
  } catch (err) {
    serverError(res, 'Ошибка удаления водителя:', err);
  }
});

export default router;
