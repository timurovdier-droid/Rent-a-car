import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { writeAudit } from '../middleware/audit.js';
import { isDay, localToday, localDay, addDays, daysBetween, dayStartUtc, defaultBranchId, driverLedgerRows, ledgerTotals, rentStatus } from '../carMoney.js';

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

function readPinfl(value) {
  if (value === undefined) return undefined;
  if (value === null || String(value).trim() === '') return null;
  const digits = String(value).replace(/\s+/g, '');
  return /^\d{14}$/.test(digits) ? digits : NaN;
}

const DRIVER_SELECT = `
  SELECT d.id, d.user_id, d.branch_id, d.passport, d.license_no, d.license_expires, d.pinfl, d.status,
         d.deposit, d.archived_at, d.created_at,
         u.full_name, u.phone, u.login,
         b.name AS branch_name,
         (SELECT c.plate FROM car_assignments ca JOIN cars c ON c.id = ca.car_id
           WHERE ca.driver_id = d.id AND ca.end_at IS NULL LIMIT 1) AS car_plate,
         (SELECT ca.car_id FROM car_assignments ca
           WHERE ca.driver_id = d.id AND ca.end_at IS NULL LIMIT 1) AS car_id,
         (SELECT COALESCE(SUM(ch.amount), 0) FROM driver_charges ch WHERE ch.driver_id = d.id)
           - (SELECT COALESCE(SUM(p.amount), 0) FROM driver_charge_payments p
              JOIN driver_charges ch ON ch.id = p.charge_id WHERE ch.driver_id = d.id) AS other_debt
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

function readPeriod(req, res) {
  const today = localToday();
  const to = isDay(req.query.to) && req.query.to <= today ? req.query.to : today;
  const from = isDay(req.query.from) ? req.query.from : addDays(to, -29);
  if (from > to) {
    fail(res, 400, 'BAD_REQUEST', 'Дата «с» позже даты «по»', 'from');
    return null;
  }
  if (daysBetween(from, to).length > 366) {
    fail(res, 400, 'BAD_REQUEST', 'Не больше года за раз', 'from');
    return null;
  }
  return { from, to };
}

// GET /debts?from&to — сводка по водителям: начислено, наличные, перевод, долг за период
router.get('/debts', async (req, res) => {
  try {
    const period = readPeriod(req, res);
    if (!period) return;
    const params = [];
    const { rows: drivers } = await pool.query(
      `SELECT d.id, u.full_name, u.phone, d.archived_at
       FROM drivers d JOIN users u ON u.id = d.user_id
       WHERE 1 = 1${branchFilter(req.user, 'd', params)}`,
      params
    );
    const rows = await driverLedgerRows(pool, drivers.map((d) => d.id), period.from, period.to);
    const list = drivers
      .map((d) => {
        const own = rows.filter((r) => r.driver_id === Number(d.id));
        if (!own.length) return null;
        const money = own.filter((r) => r.accrued || r.paid || r.pending);
        return {
          driver_id: Number(d.id),
          full_name: d.full_name,
          phone: d.phone,
          archived: Boolean(d.archived_at),
          cars: [...new Set((money.length ? money : own).map((r) => r.plate))],
          ...ledgerTotals(own),
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.debt - a.debt || a.full_name.localeCompare(b.full_name));
    res.json({ ...period, drivers: list });
  } catch (err) {
    serverError(res, 'Ошибка сводки по водителям:', err);
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

async function loadCharges(driverId) {
  const { rows: charges } = await pool.query(
    `SELECT ch.id, ch.car_id, ch.kind, ch.amount, ch.day, ch.comment, ch.created_at,
            c.plate, u.full_name AS author_name
     FROM driver_charges ch
     LEFT JOIN cars c ON c.id = ch.car_id
     LEFT JOIN users u ON u.id = ch.created_by
     WHERE ch.driver_id = $1 ORDER BY ch.day DESC, ch.id DESC`,
    [driverId]
  );
  const { rows: payments } = await pool.query(
    `SELECT p.id, p.charge_id, p.amount, p.method, p.day, p.created_at, u.full_name AS author_name
     FROM driver_charge_payments p
     JOIN driver_charges ch ON ch.id = p.charge_id
     LEFT JOIN users u ON u.id = p.created_by
     WHERE ch.driver_id = $1 ORDER BY p.day DESC, p.id DESC`,
    [driverId]
  );
  return charges.map((ch) => {
    const own = payments.filter((p) => Number(p.charge_id) === Number(ch.id));
    const paid = own.reduce((s, p) => s + Number(p.amount), 0);
    return { ...ch, paid, left: Math.max(Number(ch.amount) - paid, 0), payments: own };
  });
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
    res.json({ ...driver, deposit_history: deposits, assignments: cars, charges: await loadCharges(driver.id) });
  } catch (err) {
    serverError(res, 'Ошибка получения водителя:', err);
  }
});

// GET /:id/rent-status — по какое число закрыта аренда, с какого числа долг, календарь дней
router.get('/:id/rent-status', async (req, res) => {
  try {
    const driver = await loadDriver(req, res);
    if (!driver) return;
    const status = await rentStatus(pool, driver.id);
    res.json({ driver: { id: driver.id, full_name: driver.full_name, phone: driver.phone }, status });
  } catch (err) {
    serverError(res, 'Ошибка статуса аренды:', err);
  }
});

function coversDay(assignment, day, today) {
  const from = localDay(assignment.start_at);
  const to = assignment.end_at ? localDay(assignment.end_at) : today;
  return Boolean(from && from <= day && day <= to);
}

// POST /:id/day-report — отчёт (оплата аренды) за любую дату, в том числе задним числом
router.post('/:id/day-report', async (req, res) => {
  const client = await pool.connect();
  try {
    const driver = await loadDriver(req, res);
    if (!driver) return;
    const day = req.body.date;
    if (!isDay(day)) return fail(res, 400, 'BAD_REQUEST', 'Укажите дату отчёта', 'date');
    const today = localToday();
    if (day > today) return fail(res, 400, 'BAD_REQUEST', 'Нельзя писать отчёт на будущую дату', 'date');

    const parts = [
      ['CASH', readMoney(req.body.cash)],
      ['CARD', readMoney(req.body.card)],
      ['BALANCE', readMoney(req.body.balance)],
    ];
    if (parts.some(([, amount]) => Number.isNaN(amount))) {
      return fail(res, 400, 'BAD_REQUEST', 'Неверная сумма', 'amount');
    }
    const payments = parts.filter(([, amount]) => amount > 0);
    if (!payments.length) return fail(res, 400, 'BAD_REQUEST', 'Впишите сумму: наличными, картой или с баланса', 'amount');

    await client.query('BEGIN');
    const { rows: own } = await client.query(
      'SELECT id, car_id, start_at, end_at FROM car_assignments WHERE driver_id = $1 ORDER BY start_at',
      [driver.id]
    );
    let assignment = [...own].reverse().find((row) => coversDay(row, day, today));
    let backdated = false;

    if (!assignment) {
      const open = [...own].reverse().find((row) => !row.end_at);
      if (!open) {
        await client.query('ROLLBACK');
        return fail(res, 409, 'CONFLICT', 'Сначала выдайте водителю машину. Дату выдачи можно указать задним числом.');
      }
      const start = localDay(open.start_at);
      if (day < start) {
        const gapTo = addDays(start, -1);
        const { rows: others } = await client.query(
          'SELECT driver_id, start_at, end_at FROM car_assignments WHERE car_id = $1 AND id <> $2',
          [open.car_id, open.id]
        );
        const busy = others.some((row) => {
          const from = localDay(row.start_at);
          const to = row.end_at ? localDay(row.end_at) : today;
          return from && from <= gapTo && to >= day;
        });
        if (busy) {
          await client.query('ROLLBACK');
          return fail(res, 409, 'CONFLICT', 'В эти дни машина была у другого водителя');
        }
        await client.query('UPDATE car_assignments SET start_at = $1 WHERE id = $2', [dayStartUtc(day), open.id]);
        backdated = true;
      }
      assignment = open;
    }

    const note = [req.body.comment, `Отчёт за ${day}`].map((part) => String(part || '').trim()).filter(Boolean).join(' · ').slice(0, 500);
    const isAdmin = req.user.role === 'ADMIN';
    const ids = [];
    for (const [method, amount] of payments) {
      const { rows } = await client.query(
        `INSERT INTO car_transactions
           (car_id, kind, category, amount, method, tx_date, comment, status, created_by, confirmed_by, confirmed_at)
         VALUES ($1, 'INCOME', 'RENT', $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id`,
        [
          assignment.car_id, amount, method, day, note || null,
          isAdmin ? 'CONFIRMED' : 'PENDING', req.user.id,
          isAdmin ? req.user.id : null, isAdmin ? new Date() : null,
        ]
      );
      ids.push(rows[0].id);
    }
    await writeAudit(client, req.user.id, 'DAY_REPORT_CREATED', 'driver', driver.id, null,
      { date: day, car_id: assignment.car_id, payments, backdated }, req.ip);
    await client.query('COMMIT');
    res.status(201).json({ date: day, car_id: Number(assignment.car_id), backdated, ids });
  } catch (err) {
    await client.query('ROLLBACK');
    serverError(res, 'Ошибка записи отчёта за день:', err);
  } finally {
    client.release();
  }
});

// GET /:id/ledger?from&to — по дням: на какой машине, сколько начислено, оплачено и долг
router.get('/:id/ledger', async (req, res) => {
  try {
    const driver = await loadDriver(req, res);
    if (!driver) return;
    const period = readPeriod(req, res);
    if (!period) return;
    const rows = await driverLedgerRows(pool, [driver.id], period.from, period.to);
    res.json({
      driver: { id: driver.id, full_name: driver.full_name, phone: driver.phone },
      ...period,
      rows,
      totals: ledgerTotals(rows),
    });
  } catch (err) {
    serverError(res, 'Ошибка отчёта по водителю:', err);
  }
});

// POST / — Создание водителя (админ и диспетчер)
router.post('/', async (req, res) => {
  const { full_name, phone, login, password, passport, license_no, license_expires } = req.body;
  const pinfl = readPinfl(req.body.pinfl);
  const deposit = readMoney(req.body.deposit);

  if (!full_name || !String(full_name).trim()) return fail(res, 400, 'BAD_REQUEST', 'Укажите ФИО', 'full_name');
  if (!login || !String(login).trim()) return fail(res, 400, 'BAD_REQUEST', 'Укажите логин', 'login');
  if (!password || String(password).length < 6) return fail(res, 400, 'BAD_REQUEST', 'Пароль — минимум 6 символов', 'password');
  if (phone && !/^\+998[0-9]{9}$/.test(phone)) return fail(res, 400, 'BAD_REQUEST', 'Телефон в формате +998XXXXXXXXX', 'phone');
  if (license_expires && !isDay(license_expires)) return fail(res, 400, 'BAD_REQUEST', 'Неверная дата ВУ', 'license_expires');
  if (Number.isNaN(pinfl)) return fail(res, 400, 'BAD_REQUEST', 'ПИНФЛ — 14 цифр', 'pinfl');
  if (Number.isNaN(deposit)) return fail(res, 400, 'BAD_REQUEST', 'Неверная сумма депозита', 'deposit');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const branchId = await defaultBranchId(client);
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
      `INSERT INTO drivers (user_id, branch_id, passport, license_no, license_expires, pinfl, deposit, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'FREE') RETURNING id, user_id, branch_id, status, deposit`,
      [userId, branchId, passport || null, license_no || null, license_expires || null, pinfl, deposit]
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
    const pinfl = readPinfl(req.body.pinfl);

    if (full_name !== undefined && !String(full_name).trim()) return fail(res, 400, 'BAD_REQUEST', 'Укажите ФИО', 'full_name');
    if (phone && !/^\+998[0-9]{9}$/.test(phone)) return fail(res, 400, 'BAD_REQUEST', 'Телефон в формате +998XXXXXXXXX', 'phone');
    if (license_expires && !isDay(license_expires)) return fail(res, 400, 'BAD_REQUEST', 'Неверная дата ВУ', 'license_expires');
    if (Number.isNaN(pinfl)) return fail(res, 400, 'BAD_REQUEST', 'ПИНФЛ — 14 цифр', 'pinfl');
    if (login !== undefined && !String(login).trim()) return fail(res, 400, 'BAD_REQUEST', 'Укажите логин', 'login');
    if (password && String(password).length < 6) return fail(res, 400, 'BAD_REQUEST', 'Пароль — минимум 6 символов', 'password');

    const driverSets = [];
    const driverParams = [];
    const put = (list, params, column, value) => { params.push(value); list.push(`${column} = $${params.length}`); };
    if (passport !== undefined) put(driverSets, driverParams, 'passport', passport || null);
    if (license_no !== undefined) put(driverSets, driverParams, 'license_no', license_no || null);
    if (license_expires !== undefined) put(driverSets, driverParams, 'license_expires', license_expires || null);
    if (pinfl !== undefined) put(driverSets, driverParams, 'pinfl', pinfl);
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

// PUT /:id/password — задать водителю новый пароль для входа (старые сессии закрываются)
router.put('/:id/password', async (req, res) => {
  try {
    const driver = await loadDriver(req, res);
    if (!driver) return;
    const password = String(req.body?.password || '');
    const login = req.body?.login !== undefined ? String(req.body.login).trim() : null;
    if (password.length < 6) return fail(res, 400, 'BAD_REQUEST', 'Пароль — минимум 6 символов', 'password');
    if (login !== null && !login) return fail(res, 400, 'BAD_REQUEST', 'Укажите логин', 'login');

    const hash = await bcrypt.hash(password, 10);
    const sets = ['password_hash = $1', 'must_change_password = 1', 'token_version = token_version + 1',
      'failed_login_attempts = 0', 'locked_until = NULL'];
    const params = [hash];
    if (login !== null) {
      params.push(login);
      sets.push(`login = $${params.length}`);
    }
    params.push(driver.user_id);
    await pool.query(`UPDATE users SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
    await writeAudit(pool, req.user.id, 'DRIVER_PASSWORD_SET', 'driver', driver.id, null,
      { login: login ?? driver.login }, req.ip);
    res.json({ id: driver.id, login: login ?? driver.login });
  } catch (err) {
    if (err.code === '23505') return fail(res, 409, 'CONFLICT', 'Такой логин уже занят');
    serverError(res, 'Ошибка смены пароля водителя:', err);
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

const CHARGE_KINDS = ['REPAIR', 'DAMAGE', 'FINE', 'OTHER'];
const CHARGE_METHODS = ['CASH', 'CARD', 'BALANCE', 'DEPOSIT'];

async function loadCharge(driverId, chargeId) {
  const { rows } = await pool.query(
    `SELECT ch.*, COALESCE((SELECT SUM(p.amount) FROM driver_charge_payments p WHERE p.charge_id = ch.id), 0) AS paid
     FROM driver_charges ch WHERE ch.id = $1 AND ch.driver_id = $2`,
    [parseInt(chargeId, 10), driverId]
  );
  return rows[0] || null;
}

// POST /:id/charges — записать долг водителя помимо аренды: ремонт, повреждение, штраф и т. п.
router.post('/:id/charges', async (req, res) => {
  try {
    const driver = await loadDriver(req, res);
    if (!driver) return;
    const kind = req.body.kind;
    const amount = readMoney(req.body.amount);
    const day = req.body.date || localToday();
    const comment = req.body.comment ? String(req.body.comment).trim().slice(0, 300) : null;
    if (!CHARGE_KINDS.includes(kind)) return fail(res, 400, 'BAD_REQUEST', 'Выберите, за что долг', 'kind');
    if (!amount || Number.isNaN(amount)) return fail(res, 400, 'BAD_REQUEST', 'Укажите сумму', 'amount');
    if (!isDay(day) || day > localToday()) return fail(res, 400, 'BAD_REQUEST', 'Неверная дата', 'date');
    if (kind === 'OTHER' && !comment) return fail(res, 400, 'BAD_REQUEST', 'Напишите, за что долг', 'comment');
    let carId = null;
    if (req.body.car_id) {
      carId = parseInt(req.body.car_id, 10);
      const { rows } = await pool.query('SELECT id FROM cars WHERE id = $1', [carId]);
      if (!rows.length) return fail(res, 400, 'BAD_REQUEST', 'Машина не найдена', 'car_id');
    }
    const { rows } = await pool.query(
      `INSERT INTO driver_charges (driver_id, car_id, kind, amount, day, comment, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [driver.id, carId, kind, amount, day, comment, req.user.id]
    );
    await writeAudit(pool, req.user.id, 'DRIVER_CHARGE_ADDED', 'driver', driver.id, null,
      { charge_id: rows[0].id, kind, amount, day, car_id: carId, comment }, req.ip);
    res.status(201).json({ id: rows[0].id });
  } catch (err) {
    serverError(res, 'Ошибка записи долга:', err);
  }
});

// POST /:id/charges/:cid/payments — водитель погасил долг (можно частями). DEPOSIT — удержать из депозита (только админ).
router.post('/:id/charges/:cid/payments', async (req, res) => {
  try {
    const driver = await loadDriver(req, res);
    if (!driver) return;
    const charge = await loadCharge(driver.id, req.params.cid);
    if (!charge) return fail(res, 404, 'NOT_FOUND', 'Долг не найден');
    const amount = readMoney(req.body.amount);
    const method = req.body.method;
    const day = req.body.date || localToday();
    const left = Number(charge.amount) - Number(charge.paid);
    if (!CHARGE_METHODS.includes(method)) return fail(res, 400, 'BAD_REQUEST', 'Выберите способ оплаты', 'method');
    if (!amount || Number.isNaN(amount)) return fail(res, 400, 'BAD_REQUEST', 'Укажите сумму', 'amount');
    if (amount > left) return fail(res, 400, 'BAD_REQUEST', `Больше, чем осталось (${left.toLocaleString('ru-RU')})`, 'amount');
    if (!isDay(day) || day > localToday()) return fail(res, 400, 'BAD_REQUEST', 'Неверная дата', 'date');
    if (method === 'DEPOSIT') {
      if (req.user.role !== 'ADMIN') return fail(res, 403, 'FORBIDDEN', 'Удержать из депозита может только администратор');
      if (amount > Number(driver.deposit || 0)) return fail(res, 400, 'BAD_REQUEST', 'В депозите меньше этой суммы', 'amount');
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `INSERT INTO driver_charge_payments (charge_id, amount, method, day, created_by)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [charge.id, amount, method, day, req.user.id]
      );
      if (method === 'DEPOSIT') {
        const next = Number(driver.deposit || 0) - amount;
        await client.query('UPDATE drivers SET deposit = $1 WHERE id = $2', [next, driver.id]);
        await client.query(
          `INSERT INTO driver_deposit_history (driver_id, old_value, new_value, reason, changed_by)
           VALUES ($1, $2, $3, $4, $5)`,
          [driver.id, Number(driver.deposit || 0), next, `Удержано в счёт долга №${charge.id}`, req.user.id]
        );
      }
      await writeAudit(client, req.user.id, 'DRIVER_CHARGE_PAID', 'driver', driver.id, null,
        { charge_id: charge.id, payment_id: rows[0].id, amount, method, day }, req.ip);
      await client.query('COMMIT');
      res.status(201).json({ id: rows[0].id });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    serverError(res, 'Ошибка оплаты долга:', err);
  }
});

async function refundDeposit(client, driver, amount, reason, userId) {
  const { rows } = await client.query('SELECT deposit FROM drivers WHERE id = $1', [driver.id]);
  const old = Number(rows[0]?.deposit || 0);
  await client.query('UPDATE drivers SET deposit = $1 WHERE id = $2', [old + amount, driver.id]);
  await client.query(
    `INSERT INTO driver_deposit_history (driver_id, old_value, new_value, reason, changed_by)
     VALUES ($1, $2, $3, $4, $5)`,
    [driver.id, old, old + amount, reason, userId]
  );
}

// DELETE /:id/charges/:cid/payments/:pid — отменить оплату долга (только админ). Удержание из депозита возвращается.
router.delete('/:id/charges/:cid/payments/:pid', requireRole('ADMIN'), async (req, res) => {
  try {
    const driver = await loadDriver(req, res);
    if (!driver) return;
    const charge = await loadCharge(driver.id, req.params.cid);
    if (!charge) return fail(res, 404, 'NOT_FOUND', 'Долг не найден');
    const { rows } = await pool.query(
      'SELECT * FROM driver_charge_payments WHERE id = $1 AND charge_id = $2',
      [parseInt(req.params.pid, 10), charge.id]
    );
    const payment = rows[0];
    if (!payment) return fail(res, 404, 'NOT_FOUND', 'Оплата не найдена');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM driver_charge_payments WHERE id = $1', [payment.id]);
      if (payment.method === 'DEPOSIT') {
        await refundDeposit(client, driver, Number(payment.amount), `Отменено удержание по долгу №${charge.id}`, req.user.id);
      }
      await writeAudit(client, req.user.id, 'DRIVER_CHARGE_PAYMENT_DELETED', 'driver', driver.id,
        { charge_id: charge.id, payment_id: payment.id, amount: payment.amount, method: payment.method }, null, req.ip);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
    res.json({ id: payment.id, deleted: true });
  } catch (err) {
    serverError(res, 'Ошибка отмены оплаты долга:', err);
  }
});

// DELETE /:id/charges/:cid — удалить долг вместе с его оплатами (только админ).
router.delete('/:id/charges/:cid', requireRole('ADMIN'), async (req, res) => {
  try {
    const driver = await loadDriver(req, res);
    if (!driver) return;
    const charge = await loadCharge(driver.id, req.params.cid);
    if (!charge) return fail(res, 404, 'NOT_FOUND', 'Долг не найден');
    const { rows: held } = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM driver_charge_payments WHERE charge_id = $1 AND method = 'DEPOSIT'`,
      [charge.id]
    );
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM driver_charge_payments WHERE charge_id = $1', [charge.id]);
      await client.query('DELETE FROM driver_charges WHERE id = $1', [charge.id]);
      if (Number(held[0].total) > 0) {
        await refundDeposit(client, driver, Number(held[0].total), `Удалён долг №${charge.id}, удержание возвращено`, req.user.id);
      }
      await writeAudit(client, req.user.id, 'DRIVER_CHARGE_DELETED', 'driver', driver.id,
        { charge_id: charge.id, kind: charge.kind, amount: charge.amount, paid: charge.paid, day: charge.day, comment: charge.comment }, null, req.ip);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
    res.json({ id: charge.id, deleted: true });
  } catch (err) {
    serverError(res, 'Ошибка удаления долга:', err);
  }
});

function readMileage(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(String(value).replace(/\s+/g, ''));
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : NaN;
}

function stampFor(day) {
  return day === localToday() ? new Date() : dayStartUtc(day);
}

// POST /:id/change-car — пересадить водителя на другую машину (или выдать машину свободному водителю).
// День смены считается за новую машину, чтобы аренда не начислилась дважды.
router.post('/:id/change-car', async (req, res) => {
  let driver;
  try {
    driver = await loadDriver(req, res);
  } catch (err) {
    return serverError(res, 'Ошибка смены машины:', err);
  }
  if (!driver) return;
  if (driver.archived_at) return fail(res, 409, 'CONFLICT', 'Водитель в архиве');
  const carId = parseInt(req.body.car_id, 10);
  const day = req.body.date || localToday();
  const mileageOld = readMileage(req.body.mileage_old);
  const mileageNew = readMileage(req.body.mileage_new);
  if (!carId) return fail(res, 400, 'BAD_REQUEST', 'Выберите машину', 'car_id');
  if (!isDay(day) || day > localToday()) return fail(res, 400, 'BAD_REQUEST', 'Неверная дата', 'date');
  if (mileageNew === null || Number.isNaN(mileageNew)) {
    return fail(res, 400, 'BAD_REQUEST', 'Укажите пробег новой машины', 'mileage_new');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const carParams = [carId];
    const { rows: cars } = await client.query(
      `SELECT c.id, c.plate FROM cars c
       WHERE c.id = $1 AND c.archived_at IS NULL${branchFilter(req.user, 'c', carParams)}
         AND NOT EXISTS (SELECT 1 FROM car_assignments ca WHERE ca.car_id = c.id AND ca.end_at IS NULL)`,
      carParams
    );
    if (!cars.length) {
      await client.query('ROLLBACK');
      return fail(res, 409, 'CONFLICT', 'Эта машина уже выдана или не найдена', 'car_id');
    }
    const { rows: currentRows } = await client.query(
      'SELECT * FROM car_assignments WHERE driver_id = $1 AND end_at IS NULL ORDER BY start_at DESC LIMIT 1',
      [driver.id]
    );
    const current = currentRows[0];
    if (current) {
      if (mileageOld === null || Number.isNaN(mileageOld)) {
        await client.query('ROLLBACK');
        return fail(res, 400, 'BAD_REQUEST', 'Укажите пробег машины, которую водитель сдаёт', 'mileage_old');
      }
      if (current.mileage_start != null && mileageOld < Number(current.mileage_start)) {
        await client.query('ROLLBACK');
        return fail(res, 400, 'BAD_REQUEST', `Пробег не может быть меньше, чем при выдаче (${current.mileage_start})`, 'mileage_old');
      }
      const startDay = localDay(current.start_at);
      if (day < startDay) {
        await client.query('ROLLBACK');
        return fail(res, 400, 'BAD_REQUEST', 'Дата смены раньше, чем водитель получил текущую машину', 'date');
      }
      const endDay = day > startDay ? addDays(day, -1) : day;
      await client.query(
        'UPDATE car_assignments SET end_at = $1, mileage_end = $2 WHERE id = $3',
        [endDay === localToday() ? new Date() : dayStartUtc(endDay), mileageOld, current.id]
      );
      await client.query(`UPDATE cars SET status = 'FREE', mileage = $1 WHERE id = $2`, [mileageOld, current.car_id]);
    }
    const { rows } = await client.query(
      `INSERT INTO car_assignments (car_id, driver_id, start_at, mileage_start, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [carId, driver.id, stampFor(day), mileageNew, req.user.id]
    );
    await client.query(`UPDATE cars SET status = 'RENTED', mileage = $1 WHERE id = $2`, [mileageNew, carId]);
    await client.query(`UPDATE drivers SET status = 'RENTED' WHERE id = $1`, [driver.id]);
    await writeAudit(client, req.user.id, 'DRIVER_CAR_CHANGED', 'driver', driver.id,
      current ? { car_id: current.car_id, mileage_end: mileageOld } : null,
      { car_id: carId, date: day, mileage: mileageNew, assignment_id: rows[0].id }, req.ip);
    await client.query('COMMIT');
    res.status(201).json({ id: rows[0].id, car_id: carId });
  } catch (err) {
    await client.query('ROLLBACK');
    serverError(res, 'Ошибка смены машины:', err);
  } finally {
    client.release();
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
      await client.query(
        'DELETE FROM driver_charge_payments WHERE charge_id IN (SELECT id FROM driver_charges WHERE driver_id = $1)',
        [driver.id]
      );
      await client.query('DELETE FROM driver_charges WHERE driver_id = $1', [driver.id]);
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
