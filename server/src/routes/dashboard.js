import { Router } from 'express';
import { pool } from '../db.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

// GET / — Дашборд (данные зависят от роли)
router.get('/', async (req, res) => {
  try {
    const role = req.user.role;
    const userId = req.user.id;

    if (role === 'DRIVER') {
      // Водитель видит свои активные назначения и последние платежи
      const { rows: assignments } = await pool.query(
        `SELECT ca.id, ca.start_at, c.plate, c.brand, c.model
         FROM car_assignments ca
         JOIN cars c ON ca.car_id = c.id
         WHERE ca.driver_id = (SELECT id FROM drivers WHERE user_id = $1)
           AND ca.end_at IS NULL
         ORDER BY ca.start_at DESC`,
        [userId]
      );

      const { rows: recentPayments } = await pool.query(
        `SELECT p.id, p.amount_declared, p.status, p.created_at
         FROM payments p
         WHERE p.driver_id = (SELECT id FROM drivers WHERE user_id = $1)
         ORDER BY p.created_at DESC
         LIMIT 5`,
        [userId]
      );

      res.json({ role: 'DRIVER', assignments, recentPayments });
    } 
    else if (role === 'DISPATCHER') {
      // Диспетчер видит очередь своих платежей и статистику
      const { rows: queue } = await pool.query(
        `SELECT COUNT(*) AS count,
                COALESCE(SUM(p.amount_declared), 0) AS total_amount
         FROM payments p
         WHERE p.dispatcher_id = $1
           AND p.status IN ('DISPATCHER_PENDING', 'ADMIN_PENDING')`,
        [userId]
      );

      const { rows: todayStats } = await pool.query(
        `SELECT 
           COUNT(*) AS payments_today,
           COALESCE(SUM(CASE WHEN status = 'ADMIN_CONFIRMED' THEN amount_admin ELSE 0 END), 0) AS confirmed_today
         FROM payments
         WHERE dispatcher_id = $1
           AND created_at >= CURRENT_DATE`,
        [userId]
      );

      res.json({ 
        role: 'DISPATCHER', 
        queue: queue[0], 
        todayStats: todayStats[0] 
      });
    } 
    else if (role === 'ADMIN') {
      // Администратор видит общую сводку
      const { rows: stats } = await pool.query(
        `SELECT 
           (SELECT COUNT(*) FROM users WHERE role = 'DRIVER' AND status = 'ACTIVE') AS active_drivers,
           (SELECT COUNT(*) FROM users WHERE role = 'DISPATCHER' AND status = 'ACTIVE') AS active_dispatchers,
           (SELECT COUNT(*) FROM cars WHERE archived_at IS NULL) AS active_cars,
           (SELECT COUNT(*) FROM payments WHERE status = 'DISPATCHER_PENDING') AS pending_dispatcher,
           (SELECT COUNT(*) FROM payments WHERE status = 'ADMIN_PENDING') AS pending_admin,
           (SELECT COALESCE(SUM(amount_admin), 0) FROM payments WHERE status = 'ADMIN_CONFIRMED' AND created_at >= CURRENT_DATE) AS confirmed_today`
      );

      res.json({ role: 'ADMIN', stats: stats[0] });
    } 
    else if (role === 'OWNER') {
      // Арендодатель видит свои автомобили и последние поступления
      const { rows: owners } = await pool.query(
        'SELECT id FROM owners WHERE user_id = $1',
        [userId]
      );

      if (owners.length === 0) {
        return res.json({ role: 'OWNER', cars: [], recentPayments: [] });
      }

      const ownerId = owners[0].id;

      const { rows: cars } = await pool.query(
        `SELECT c.id, c.plate, c.brand, c.model, c.status
         FROM cars c
         WHERE c.owner_id = $1 AND c.archived_at IS NULL
         ORDER BY c.plate`,
        [ownerId]
      );

      const { rows: recentPayments } = await pool.query(
        `SELECT p.id, p.amount_admin, p.status, p.created_at, c.plate
         FROM payments p
         JOIN daily_reports dr ON p.daily_report_id = dr.id
         JOIN cars c ON dr.car_id = c.id
         WHERE c.owner_id = $1
           AND p.status = 'ADMIN_CONFIRMED'
         ORDER BY p.created_at DESC
         LIMIT 5`,
        [ownerId]
      );

      res.json({ role: 'OWNER', cars, recentPayments });
    } 
    else {
      res.json({ role, message: 'Роль не поддерживается на дашборде' });
    }
  } catch (err) {
    console.error('Ошибка получения данных дашборда:', err);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Внутренняя ошибка сервера' } });
  }
});

export default router;