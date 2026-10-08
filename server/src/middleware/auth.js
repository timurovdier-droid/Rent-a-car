import jwt from 'jsonwebtoken';
import { pool } from '../db.js';
import { config } from '../config.js';

const authCache = new Map();
const AUTH_CACHE_MS = 20000;

function recallUser(id, tokenVersion) {
  const hit = authCache.get(`${id}:${tokenVersion}`);
  if (!hit || hit.exp < Date.now()) {
    if (hit) authCache.delete(`${id}:${tokenVersion}`);
    return null;
  }
  return { ...hit.user };
}

function rememberUser(user) {
  authCache.set(`${user.id}:${user.token_version}`, {
    user: { ...user },
    exp: Date.now() + AUTH_CACHE_MS,
  });
  if (authCache.size > 200) {
    const first = authCache.keys().next().value;
    authCache.delete(first);
  }
}

export async function authenticate(req, res, next) {
  try {
    const token = req.cookies?.token;
    if (!token) {
      return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Необходимо войти в систему' } });
    }

    let payload;
    try {
      payload = jwt.verify(token, config.jwt.secret);
    } catch (err) {
      return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Недействительный токен' } });
    }

    const cached = recallUser(Number(payload.sub), Number(payload.token_version || 0));
    if (cached) {
      req.user = cached;
      return next();
    }

    // Проверяем актуальность токена (token_version) и статус пользователя
    const { rows } = await pool.query(
      `SELECT u.id, u.role, u.full_name, u.login, u.status, u.must_change_password, u.token_version,
              (SELECT id FROM drivers WHERE user_id = u.id) AS driver_id,
              (SELECT branch_id FROM user_branches WHERE user_id = u.id LIMIT 1) AS branch_id
       FROM users u WHERE u.id = $1`,
      [payload.sub]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Пользователь не найден' } });
    }

    const user = rows[0];
    user.id = Number(user.id);
    user.token_version = Number(user.token_version || 0);
    if (user.driver_id != null) user.driver_id = Number(user.driver_id);
    if (user.branch_id != null) user.branch_id = Number(user.branch_id);

    if (!['ACTIVE', 'INVITED'].includes(user.status) || user.role === 'DRIVER') {
      return res.status(403).json({ error: { code: 'ACCOUNT_DISABLED', message: 'Учётная запись заблокирована или архивирована' } });
    }

    if (user.token_version !== Number(payload.token_version)) {
      return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Сессия отозвана' } });
    }

    req.user = user;
    rememberUser(user);
    next();
  } catch (err) {
    console.error('Ошибка middleware authenticate:', err);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Внутренняя ошибка сервера' } });
  }
}

// Middleware для опциональной авторизации (если токен есть — загружаем пользователя, если нет — идём дальше)
export async function optionalAuth(req, res, next) {
  const token = req.cookies?.token;
  if (!token) return next();
  
  try {
    const payload = jwt.verify(token, config.jwt.secret);
    const { rows } = await pool.query(
      'SELECT id, role, full_name, login, status, must_change_password, token_version FROM users WHERE id = $1',
      [payload.sub]
    );
    if (rows.length > 0 && rows[0].status === 'ACTIVE' && rows[0].token_version === payload.token_version) {
      req.user = rows[0];
    }
  } catch (e) {
    // Игнорируем невалидный токен для опциональной авторизации
  }
  next();
}