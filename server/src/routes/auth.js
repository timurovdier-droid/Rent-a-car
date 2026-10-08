import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { writeAudit } from '../middleware/audit.js';
import { config } from '../config.js';

const router = Router();

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.VERCEL === '1',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
}

function issueToken(user) {
  return jwt.sign(
    { sub: Number(user.id), token_version: Number(user.token_version || 0), role: user.role },
    config.jwt.secret,
    { expiresIn: '7d' }
  );
}

// POST /login — Вход в систему
router.post('/login', async (req, res) => {
  try {
    const { login, password } = req.body;

    if (!login || !password) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Укажите логин и пароль' } });
    }

    const { rows } = await pool.query(
      `SELECT u.id, u.login, u.password_hash, u.full_name, u.phone, u.role, u.status,
              u.must_change_password, u.failed_login_attempts, u.locked_until, u.token_version, u.created_at,
              b.id AS branch_id, b.name AS branch_name
       FROM users u
       LEFT JOIN user_branches ub ON ub.user_id = u.id
       LEFT JOIN branches b ON b.id = ub.branch_id
       WHERE u.login = $1
       LIMIT 1`,
      [login]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Неверный логин или пароль' } });
    }

    const user = rows[0];

    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      const minutesLeft = Math.ceil((new Date(user.locked_until) - new Date()) / 60000);
      return res.status(423).json({
        error: { code: 'LOCKED', message: `Аккаунт заблокирован. Попробуйте через ${minutesLeft} мин.` }
      });
    }

    if (['LOCKED', 'ARCHIVED', 'SUSPENDED'].includes(user.status)) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Аккаунт заблокирован или архивирован' } });
    }

    const passwordValid = user.password_hash ? await bcrypt.compare(password, user.password_hash) : false;
    if (!passwordValid) {
      await pool.query(
        `UPDATE users SET failed_login_attempts = failed_login_attempts + 1 WHERE id = $1`,
        [user.id]
      );

      const { rows: updated } = await pool.query(
        `SELECT failed_login_attempts FROM users WHERE id = $1`,
        [user.id]
      );

      if (Number(updated[0].failed_login_attempts) >= 5) {
        const until = new Date(Date.now() + 30 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');
        await pool.query(`UPDATE users SET locked_until = $1 WHERE id = $2`, [until, user.id]);
        return res.status(423).json({
          error: { code: 'LOCKED', message: 'Аккаунт заблокирован после 5 неудачных попыток. Попробуйте через 30 мин.' }
        });
      }

      return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Неверный логин или пароль' } });
    }

    await pool.query(
      `UPDATE users SET failed_login_attempts = 0, locked_until = NULL, last_login_at = datetime('now') WHERE id = $1`,
      [user.id]
    );

    res.cookie('token', issueToken(user), cookieOptions());

    const responseData = {
      id: user.id,
      login: user.login,
      full_name: user.full_name,
      phone: user.phone,
      role: user.role,
      must_change_password: user.must_change_password,
      branch_id: user.branch_id,
      branch_name: user.branch_name,
      created_at: user.created_at,
    };

    await writeAudit(pool, user.id, 'USER_LOGIN', 'user', user.id, null, { ip: req.ip }, req.ip);

    if (user.must_change_password) {
      return res.status(403).json({
        error: { code: 'PASSWORD_CHANGE_REQUIRED', message: 'Необходимо сменить пароль' },
        user: responseData,
      });
    }

    res.json(responseData);
  } catch (err) {
    console.error('Ошибка входа:', err);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Внутренняя ошибка сервера' } });
  }
});

// POST /logout — Выход из системы
router.post('/logout', authenticate, async (req, res) => {
  try {
    await writeAudit(pool, req.user.id, 'USER_LOGOUT', 'user', req.user.id, null, { ip: req.ip }, req.ip);
    res.clearCookie('token', { path: '/' });
    res.json({ message: 'Выход выполнен успешно' });
  } catch (err) {
    console.error('Ошибка выхода:', err);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Внутренняя ошибка сервера' } });
  }
});

// GET /me — Получить текущего пользователя
router.get('/me', authenticate, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.login, u.full_name, u.phone, u.role, u.status,
              u.must_change_password, u.created_at,
              b.id AS branch_id, b.name AS branch_name
       FROM users u
       LEFT JOIN user_branches ub ON ub.user_id = u.id
       LEFT JOIN branches b ON b.id = ub.branch_id
       WHERE u.id = $1
       LIMIT 1`,
      [req.user.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Пользователь не найден' } });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error('Ошибка получения профиля:', err);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Внутренняя ошибка сервера' } });
  }
});

// POST /change-password — Смена пароля
router.post('/change-password', authenticate, async (req, res) => {
  try {
    const oldPassword = req.body.old_password || req.body.oldPassword;
    const newPassword = req.body.new_password || req.body.newPassword;

    if (!newPassword) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Укажите новый пароль' } });
    }

    if (newPassword.length < 10 || !/[A-Za-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      return res.status(400).json({
        error: { code: 'BAD_REQUEST', message: 'Новый пароль: минимум 10 символов, буквы и цифры', field: 'new_password' },
      });
    }

    const { rows } = await pool.query(
      'SELECT password_hash, must_change_password, status FROM users WHERE id = $1',
      [req.user.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Пользователь не найден' } });
    }

    const forced = Boolean(rows[0].must_change_password);
    if (!forced || oldPassword) {
      if (!oldPassword) {
        return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Укажите текущий пароль', field: 'old_password' } });
      }
      const passwordValid = rows[0].password_hash
        ? await bcrypt.compare(oldPassword, rows[0].password_hash)
        : false;
      if (!passwordValid) {
        return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Неверный текущий пароль', field: 'old_password' } });
      }
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    const nextStatus = rows[0].status === 'INVITED' ? 'ACTIVE' : rows[0].status;

    await pool.query(
      `UPDATE users SET password_hash = $1, must_change_password = 0, status = $2 WHERE id = $3`,
      [newHash, nextStatus, req.user.id]
    );

    await writeAudit(pool, req.user.id, 'PASSWORD_CHANGED', 'user', req.user.id, null, { ip: req.ip }, req.ip);

    res.json({ message: 'Пароль успешно изменён' });
  } catch (err) {
    console.error('Ошибка смены пароля:', err);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Внутренняя ошибка сервера' } });
  }
});

export default router;
