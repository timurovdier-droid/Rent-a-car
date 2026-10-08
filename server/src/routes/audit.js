import { Router } from 'express';
import { pool } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';

const router = Router();

// Все маршруты требуют авторизации и роли ADMIN
router.use(authenticate, requireRole('ADMIN'));

// GET / — Получение последних записей аудита
router.get('/', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 100;
    const offset = parseInt(req.query.offset, 10) || 0;

    // Получаем записи аудита с именами пользователей для читаемости
    const { rows } = await pool.query(
      `SELECT 
         al.id, al.action, al.object_type, al.object_id, 
         al.old_value, al.new_value, al.ip, al.at,
         u.full_name AS user_name, u.login AS user_login
       FROM audit_log al
       LEFT JOIN users u ON al.user_id = u.id
       ORDER BY al.at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    // Парсим JSONB поля для удобного использования на клиенте
    const formattedRows = rows.map(row => ({
      ...row,
      old_value: row.old_value ? JSON.parse(row.old_value) : null,
      new_value: row.new_value ? JSON.parse(row.new_value) : null,
    }));

    res.json(formattedRows);
  } catch (err) {
    console.error('Ошибка получения журнала аудита:', err);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Внутренняя ошибка сервера' } });
  }
});

export default router;