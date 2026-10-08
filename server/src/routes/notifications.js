import { Router } from 'express';
import { pool } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';

const router = Router();

router.use(authenticate, requireRole('ADMIN'));

// GET / — Список уведомлений
router.get('/', async (req, res) => {
  try {
    const notifications = [];

    // 1. Истекающие водительские права (в течение 30 дней)
    const { rows: expiringLicenses } = await pool.query(`
      SELECT d.id AS driver_id, u.full_name, d.license_no, d.license_expires
      FROM drivers d
      JOIN users u ON d.user_id = u.id
      WHERE d.archived_at IS NULL
        AND d.license_expires IS NOT NULL
        AND d.license_expires <= CURRENT_DATE + INTERVAL '30 days'
        AND d.license_expires >= CURRENT_DATE
      ORDER BY d.license_expires ASC
      LIMIT 20
    `);
    expiringLicenses.forEach((row) => {
      const daysLeft = Math.ceil((new Date(row.license_expires) - new Date()) / (1000 * 60 * 60 * 24));
      notifications.push({
        id: `license-${row.driver_id}`,
        type: 'WARNING',
        category: 'LICENSE',
        title: `Истекают права у ${row.full_name}`,
        message: `Права ${row.license_no} истекают через ${daysLeft} дн. (${new Date(row.license_expires).toLocaleDateString('ru-RU')})`,
        object_type: 'driver',
        object_id: row.driver_id,
        created_at: new Date().toISOString(),
      });
    });

    // 2. Просроченные платежи (висят больше 3 дней в DISPATCHER_PENDING)
    const { rows: overduePayments } = await pool.query(`
      SELECT p.id, p.amount_declared, p.created_at,
             u.full_name AS driver_name, c.plate
      FROM payments p
      JOIN drivers d ON p.driver_id = d.id
      JOIN users u ON d.user_id = u.id
      JOIN daily_reports dr ON p.daily_report_id = dr.id
      JOIN cars c ON dr.car_id = c.id
      WHERE p.status = 'DISPATCHER_PENDING'
        AND p.created_at < CURRENT_TIMESTAMP - INTERVAL '3 days'
      ORDER BY p.created_at ASC
      LIMIT 20
    `);
    overduePayments.forEach((row) => {
      const days = Math.floor((new Date() - new Date(row.created_at)) / (1000 * 60 * 60 * 24));
      notifications.push({
        id: `payment-${row.id}`,
        type: 'DANGER',
        category: 'PAYMENT',
        title: `Просроченный платёж от ${row.driver_name}`,
        message: `${row.amount_declared.toLocaleString('ru-RU')} сум по авто ${row.plate} висит ${days} дн. без подтверждения`,
        object_type: 'payment',
        object_id: row.id,
        created_at: row.created_at,
      });
    });

    // 3. Автомобили с истёкшей страховкой (если бы было поле insurance_expires — но пока используем заглушку через service_records)
    const { rows: serviceOverdue } = await pool.query(`
      SELECT s.id, s.car_id, s.type, s.scheduled_at, c.plate, c.brand, c.model
      FROM service_records s
      JOIN cars c ON s.car_id = c.id
      WHERE s.status = 'SCHEDULED'
        AND s.scheduled_at IS NOT NULL
        AND s.scheduled_at < CURRENT_DATE
      ORDER BY s.scheduled_at ASC
      LIMIT 20
    `);
    serviceOverdue.forEach((row) => {
      notifications.push({
        id: `service-${row.id}`,
        type: 'WARNING',
        category: 'SERVICE',
        title: `Просроченное ТО: ${row.plate}`,
        message: `${row.brand} ${row.model} — запланированное на ${new Date(row.scheduled_at).toLocaleDateString('ru-RU')} обслуживание не завершено`,
        object_type: 'service_record',
        object_id: row.id,
        created_at: row.scheduled_at,
      });
    });

    // 4. Новые водители, которые ещё не назначены (созданы за последние 7 дней и статус FREE)
    const { rows: unassignedDrivers } = await pool.query(`
      SELECT d.id, u.full_name, d.created_at
      FROM drivers d
      JOIN users u ON d.user_id = u.id
      WHERE d.status = 'FREE'
        AND d.archived_at IS NULL
        AND d.created_at >= CURRENT_TIMESTAMP - INTERVAL '7 days'
        AND NOT EXISTS (
          SELECT 1 FROM car_assignments ca WHERE ca.driver_id = d.id AND ca.end_at IS NULL
        )
      ORDER BY d.created_at DESC
      LIMIT 10
    `);
    unassignedDrivers.forEach((row) => {
      notifications.push({
        id: `driver-${row.id}`,
        type: 'INFO',
        category: 'DRIVER',
        title: `Водитель без назначения: ${row.full_name}`,
        message: `Создан ${new Date(row.created_at).toLocaleDateString('ru-RU')}, но ещё не назначен на автомобиль`,
        object_type: 'driver',
        object_id: row.id,
        created_at: row.created_at,
      });
    });

    // Сортируем по важности (DANGER > WARNING > INFO), затем по дате
    const priority = { DANGER: 0, WARNING: 1, INFO: 2 };
    notifications.sort((a, b) => {
      if (priority[a.type] !== priority[b.type]) return priority[a.type] - priority[b.type];
      return new Date(b.created_at) - new Date(a.created_at);
    });

    res.json(notifications);
  } catch (err) {
    console.error('Ошибка получения уведомлений:', err);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Внутренняя ошибка сервера' } });
  }
});

export default router;