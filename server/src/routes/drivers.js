import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { writeAudit } from '../middleware/audit.js';

const router = Router();

router.use(authenticate, requireRole('DISPATCHER', 'ADMIN'));

// GET / — Список водителей
router.get('/', async (req, res) => {
  try {
    let query = `
      SELECT d.id, d.branch_id, d.passport, d.license_no, d.license_expires, d.status, d.archived_at,
             u.full_name, u.phone, u.login,
             b.name AS branch_name
      FROM drivers d
      JOIN users u ON d.user_id = u.id
      JOIN branches b ON d.branch_id = b.id
      WHERE d.archived_at IS NULL
    `;
    
    const params = [];
    if (req.user.role === 'DISPATCHER' && req.user.branch_id) {
      params.push(req.user.branch_id);
      query += ` AND d.branch_id = $${params.length}`;
    }
    
    query += ' ORDER BY u.full_name';
    
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error('Ошибка получения списка водителей:', err);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Внутренняя ошибка сервера' } });
  }
});

// POST / — Создание водителя (учётная запись + профиль)
router.post('/', async (req, res) => {
  const client = await pool.connect();
  try {
    const { user_id, branch_id, passport, license_no, license_expires, full_name, phone, login, password } = req.body;

    if (!branch_id) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Укажите филиал', field: 'branch_id' } });
    }

    await client.query('BEGIN');

    let uid = user_id;
    if (!uid) {
      if (!full_name || !phone || !login || !password) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Укажите ФИО, телефон, логин и пароль' } });
      }
      if (!/^\+998[0-9]{9}$/.test(phone)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Телефон в формате +998XXXXXXXXX', field: 'phone' } });
      }
      const hash = await bcrypt.hash(password, 10);
      const { rows: createdUsers } = await client.query(
        `INSERT INTO users (role, full_name, phone, login, password_hash, status, must_change_password)
         VALUES ('DRIVER', $1, $2, $3, $4, 'ACTIVE', 1)
         RETURNING id`,
        [full_name, phone, login, hash]
      );
      uid = createdUsers[0].id;
      await client.query(
        'INSERT INTO user_branches (user_id, branch_id) VALUES ($1, $2)',
        [uid, branch_id]
      );
    }

    const { rows } = await client.query(
      `INSERT INTO drivers (user_id, branch_id, passport, license_no, license_expires, status)
       VALUES ($1, $2, $3, $4, $5, 'FREE')
       RETURNING id, user_id, branch_id, status`,
      [uid, branch_id, passport || null, license_no || null, license_expires || null]
    );

    const driver = rows[0];
    await writeAudit(client, req.user.id, 'DRIVER_CREATED', 'driver', driver.id, null, driver, req.ip);
    await client.query('COMMIT');
    res.status(201).json(driver);
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* already closed */ }
    if (err.code === '23505') {
      return res.status(409).json({ error: { code: 'CONFLICT', message: 'Водитель с таким логином или телефоном уже существует' } });
    }
    console.error('Ошибка создания водителя:', err);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Внутренняя ошибка сервера' } });
  } finally {
    client.release();
  }
});

// PATCH /:id — Редактирование водителя
router.patch('/:id', async (req, res) => {
  try {
    const driverId = parseInt(req.params.id, 10);
    const { passport, license_no, license_expires, full_name, phone, branch_id } = req.body;
    
    const updates = [];
    const params = [];
    
    if (passport !== undefined) { params.push(passport); updates.push(`passport = $${params.length}`); }
    if (license_no !== undefined) { params.push(license_no); updates.push(`license_no = $${params.length}`); }
    if (license_expires !== undefined) { params.push(license_expires); updates.push(`license_expires = $${params.length}`); }
    
    if (branch_id !== undefined) { params.push(branch_id); updates.push(`branch_id = $${params.length}`); }

    if (full_name !== undefined || phone !== undefined) {
      await pool.query(
        `UPDATE users SET
           full_name = COALESCE($1, full_name),
           phone = COALESCE($2, phone)
         WHERE id = (SELECT user_id FROM drivers WHERE id = $3)`,
        [full_name ?? null, phone ?? null, driverId]
      );
    }

    if (updates.length === 0) {
      if (full_name === undefined && phone === undefined) {
        return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Нет данных для обновления' } });
      }
      await writeAudit(pool, req.user.id, 'DRIVER_UPDATED', 'driver', driverId, null, { full_name, phone }, req.ip);
      return res.json({ id: driverId, full_name, phone });
    }
    
    params.push(driverId);
    
    const { rows } = await pool.query(
      `UPDATE drivers SET ${updates.join(', ')} WHERE id = $${params.length} AND archived_at IS NULL
       RETURNING id, passport, license_no, license_expires`,
      params
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Водитель не найден' } });
    }
    
    await writeAudit(pool, req.user.id, 'DRIVER_UPDATED', 'driver', driverId, null, rows[0], req.ip);
    res.json(rows[0]);
  } catch (err) {
    console.error('Ошибка редактирования водителя:', err);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Внутренняя ошибка сервера' } });
  }
});

// POST /:id/archive — Архивация водителя
router.post('/:id/archive', requireRole('ADMIN'), async (req, res) => {
  try {
    const driverId = parseInt(req.params.id, 10);
    
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Проверяем активное назначение
      const { rows: assignments } = await client.query(
        'SELECT id FROM car_assignments WHERE driver_id = $1 AND end_at IS NULL',
        [driverId]
      );
      
      if (assignments.length > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({ 
          error: { code: 'CONFLICT', message: 'Нельзя архивировать водителя с активным назначением.' } 
        });
      }
      
      const { rows } = await client.query(
        `UPDATE drivers SET status = 'ARCHIVED', archived_at = now()
         WHERE id = $1 AND archived_at IS NULL
         RETURNING id, status`,
        [driverId]
      );
      
      if (rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Водитель не найден' } });
      }
      
      await writeAudit(client, req.user.id, 'DRIVER_ARCHIVED', 'driver', driverId, null, rows[0], req.ip);
      await client.query('COMMIT');
      
      res.json(rows[0]);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Ошибка архивации водителя:', err);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Внутренняя ошибка сервера' } });
  }
});

export default router;