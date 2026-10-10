import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { pool } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { writeAudit } from '../middleware/audit.js';

const router = Router();

// Все маршруты требуют авторизации и роли ADMIN
router.use(authenticate, requireRole('ADMIN'));

// GET / — Список диспетчеров
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT u.id, u.full_name, u.phone, u.login, u.status, u.created_at, u.last_login_at,
             b.name AS branch_name
      FROM users u
      LEFT JOIN user_branches ub ON u.id = ub.user_id
      LEFT JOIN branches b ON ub.branch_id = b.id
      WHERE u.role = 'DISPATCHER' AND u.status != 'ARCHIVED'
      ORDER BY u.full_name
    `);
    res.json(rows);
  } catch (err) {
    console.error('Ошибка получения списка диспетчеров:', err);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Внутренняя ошибка сервера' } });
  }
});

// POST / — Создание диспетчера (статус INVITED)
router.post('/', async (req, res) => {
  try {
    const { full_name, phone, login, branch_id } = req.body;
    
    // Валидация телефона (+998XXXXXXXXX)
    if (!phone || !/^\+998[0-9]{9}$/.test(phone)) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Неверный формат телефона. Используйте +998XXXXXXXXX', field: 'phone' } });
    }
    // Валидация логина
    if (!login || !/^[A-Za-z0-9_.-]+$/.test(login)) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Логин может содержать только буквы, цифры, _, . и -', field: 'login' } });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const tempPassword = crypto.randomBytes(6).toString('hex');
      const tempHash = await bcrypt.hash(tempPassword, 10);

      const { rows: users } = await client.query(
        `INSERT INTO users (role, full_name, phone, login, password_hash, status, must_change_password)
         VALUES ('DISPATCHER', $1, $2, $3, $4, 'INVITED', 1)
         RETURNING id, full_name, login`,
        [full_name, phone, login, tempHash]
      );
      const user = users[0];
      user.tempPassword = tempPassword;

      // Привязываем к филиалу
      if (branch_id) {
        await client.query(
          'INSERT INTO user_branches (user_id, branch_id) VALUES ($1, $2)',
          [user.id, branch_id]
        );
      }

      await writeAudit(client, req.user.id, 'DISPATCHER_CREATED', 'user', user.id, null, { id: user.id, full_name: user.full_name, login: user.login }, req.ip);
      await client.query('COMMIT');

      res.status(201).json(user);
    } catch (e) {
      await client.query('ROLLBACK');
      if (e.code === '23505') { // unique_violation
        return res.status(409).json({ error: { code: 'CONFLICT', message: 'Пользователь с таким телефоном или логином уже существует' } });
      }
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Ошибка создания диспетчера:', err);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Внутренняя ошибка сервера' } });
  }
});

// PATCH /:id — ФИО и телефон диспетчера
router.patch('/:id', async (req, res) => {
  try {
    const dispatcherId = parseInt(req.params.id, 10);
    const fullName = String(req.body.full_name || '').trim().slice(0, 120);
    const phone = String(req.body.phone || '').replace(/[\s()-]/g, '');
    if (!fullName) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Укажите ФИО', field: 'full_name' } });
    }
    if (!/^\+998\d{9}$/.test(phone)) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Неверный формат телефона. Используйте +998XXXXXXXXX', field: 'phone' } });
    }
    const { rows } = await pool.query(
      `SELECT full_name, phone FROM users WHERE id = $1 AND role = 'DISPATCHER' AND status != 'ARCHIVED'`,
      [dispatcherId]
    );
    if (!rows.length) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Диспетчер не найден' } });
    }
    await pool.query('UPDATE users SET full_name = $1, phone = $2 WHERE id = $3', [fullName, phone, dispatcherId]);
    await writeAudit(pool, req.user.id, 'DISPATCHER_UPDATED', 'user', dispatcherId, rows[0], { full_name: fullName, phone }, req.ip);
    res.json({ id: dispatcherId, full_name: fullName, phone });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: { code: 'CONFLICT', message: 'Такой телефон уже есть у другого пользователя', field: 'phone' } });
    }
    console.error('Ошибка изменения диспетчера:', err);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Внутренняя ошибка сервера' } });
  }
});

// POST /:id/reset-password — Сброс пароля (генерация временного)
router.post('/:id/reset-password', async (req, res) => {
  try {
    const dispatcherId = parseInt(req.params.id, 10);
    
    // Генерируем временный пароль (12 символов)
    const tempPassword = crypto.randomBytes(6).toString('hex');
    const tempHash = await bcrypt.hash(tempPassword, 10);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Обновляем пароль и сбрасываем флаг must_change_password (он и так TRUE, но на всякий случай)
      await client.query(
        `UPDATE users SET password_hash = $1, must_change_password = TRUE, 
                failed_logins = 0, token_version = token_version + 1
         WHERE id = $2 AND role = 'DISPATCHER'`,
        [tempHash, dispatcherId]
      );

      // Записываем в password_resets
      await client.query(
        `INSERT INTO password_resets (user_id, temp_password_hash, expires_at, reset_by)
         VALUES ($1, $2, now() + INTERVAL '72 hours', $3)`,
        [dispatcherId, tempHash, req.user.id]
      );

      await writeAudit(client, req.user.id, 'PASSWORD_RESET', 'user', dispatcherId, null, null, req.ip);
      await client.query('COMMIT');

      // Возвращаем временный пароль ОДИН РАЗ (FR-PWD-08)
      res.json({ tempPassword });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Ошибка сброса пароля:', err);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Внутренняя ошибка сервера' } });
  }
});

// POST /:id/archive — Архивация диспетчера
router.post('/:id/archive', async (req, res) => {
  try {
    const dispatcherId = parseInt(req.params.id, 10);
    const { reason, reassignTo } = req.body;

    if (!reason) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Укажите причину архивации', field: 'reason' } });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Проверка: есть ли неподтверждённые платежи (BR-DSP-4)
      const { rows: pendingPayments } = await client.query(
        `SELECT id FROM payments 
         WHERE dispatcher_id = $1 AND status = 'DISPATCHER_PENDING'`,
        [dispatcherId]
      );

      if (pendingPayments.length > 0 && !reassignTo) {
        await client.query('ROLLBACK');
        return res.status(409).json({ 
          error: { 
            code: 'CONFLICT', 
            message: `У диспетчера ${pendingPayments.length} неподтверждённых платежей. Укажите reassignTo для переназначения.` 
          } 
        });
      }

      // Переназначение платежей, если нужно
      if (reassignTo && pendingPayments.length > 0) {
        await client.query(
          `UPDATE payments SET dispatcher_id = $1 WHERE dispatcher_id = $2 AND status = 'DISPATCHER_PENDING'`,
          [reassignTo, dispatcherId]
        );
        
        // Записываем факт переназначения в audit (упрощённо)
        await writeAudit(client, req.user.id, 'PAYMENTS_REASSIGNED', 'dispatcher', dispatcherId, 
          { from: dispatcherId, to: reassignTo, count: pendingPayments.length }, null, req.ip);
      }

      // Архивируем пользователя
      await client.query(
        `UPDATE users SET status = 'ARCHIVED', archived_at = now(), 
                archived_by = $1, archive_reason = $2, token_version = token_version + 1
         WHERE id = $3 AND role = 'DISPATCHER'`,
        [req.user.id, reason, dispatcherId]
      );

      await writeAudit(client, req.user.id, 'DISPATCHER_ARCHIVED', 'user', dispatcherId, null, { reason }, req.ip);
      await client.query('COMMIT');

      res.json({ status: 'ok' });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Ошибка архивации диспетчера:', err);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Внутренняя ошибка сервера' } });
  }
});

export default router;