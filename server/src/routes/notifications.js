import { Router } from 'express';
import { pool } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import {
  localToday,
  addDays,
  getReminderSettings,
  serviceDue,
  documentDue,
} from '../carMoney.js';

const router = Router();

router.use(authenticate, requireRole('ADMIN'));

const SERVICE_LABELS = {
  OIL_CHANGE: 'Замена масла',
  REPAIR: 'Ремонт',
  INSPECTION: 'Техосмотр',
  INSURANCE: 'Страховка',
  TIRE: 'Шины',
  OTHER: 'Обслуживание',
};

function ruDate(day) {
  if (!day) return '';
  const [y, m, d] = String(day).slice(0, 10).split('-');
  return `${d}.${m}.${y}`;
}

function money(n) {
  return `${Number(n).toLocaleString('ru-RU')} сум`;
}

// GET / — Уведомления: сроки документов, обслуживание, записи на подтверждение
router.get('/', async (req, res) => {
  try {
    const today = localToday();
    const reminders = await getReminderSettings(pool);
    const horizon = addDays(today, reminders.days);
    const notifications = [];
    const push = (n) => notifications.push({ created_at: today, ...n });

    const { rows: cars } = await pool.query(
      `SELECT id, plate, brand, model, mileage, insurance_expires, inspection_expires
       FROM cars WHERE archived_at IS NULL`
    );
    const carById = new Map(cars.map((c) => [Number(c.id), c]));

    for (const car of cars) {
      for (const [field, label] of [['insurance_expires', 'Страховка'], ['inspection_expires', 'Техосмотр']]) {
        const state = documentDue(car[field], reminders, today);
        if (!state) continue;
        push({
          id: `${field}-${car.id}`,
          type: state === 'OVERDUE' ? 'DANGER' : 'WARNING',
          category: 'DOCUMENT',
          title: `${label}: ${car.plate}`,
          message: state === 'OVERDUE'
            ? `${label} ${car.brand} ${car.model} закончилась ${ruDate(car[field])}`
            : `${label} ${car.brand} ${car.model} заканчивается ${ruDate(car[field])}`,
          object_type: 'car',
          object_id: car.id,
        });
      }
    }

    const { rows: services } = await pool.query(
      `SELECT id, car_id, type, status, scheduled_at, due_mileage FROM service_records WHERE status = 'SCHEDULED'`
    );
    for (const s of services) {
      const car = carById.get(Number(s.car_id));
      if (!car) continue;
      const state = serviceDue(s, car.mileage, reminders, today);
      if (!state) continue;
      const parts = [];
      if (s.scheduled_at) parts.push(`до ${ruDate(s.scheduled_at)}`);
      if (s.due_mileage != null) {
        parts.push(`на ${Number(s.due_mileage).toLocaleString('ru-RU')} км (сейчас ${car.mileage != null ? Number(car.mileage).toLocaleString('ru-RU') : '—'} км)`);
      }
      push({
        id: `service-${s.id}`,
        type: state === 'OVERDUE' ? 'DANGER' : 'WARNING',
        category: 'SERVICE',
        title: `Пора на обслуживание: ${car.plate}`,
        message: `${SERVICE_LABELS[s.type] || s.type} ${parts.join(', ')}`,
        object_type: 'car',
        object_id: car.id,
      });
    }

    const { rows: pending } = await pool.query(
      `SELECT t.car_id, COUNT(*) AS cnt, COALESCE(SUM(t.amount), 0) AS total, MIN(t.created_at) AS since
       FROM car_transactions t WHERE t.status = 'PENDING' GROUP BY t.car_id`
    );
    for (const p of pending) {
      const car = carById.get(Number(p.car_id));
      if (!car) continue;
      push({
        id: `pending-${p.car_id}`,
        type: 'WARNING',
        category: 'PAYMENT',
        title: `Ждёт подтверждения: ${car.plate}`,
        message: `${p.cnt} запис. на ${money(p.total)} от диспетчера`,
        object_type: 'car',
        object_id: car.id,
        created_at: p.since,
      });
    }

    const { rows: licenses } = await pool.query(
      `SELECT d.id, u.full_name, d.license_no, d.license_expires
       FROM drivers d JOIN users u ON u.id = d.user_id
       WHERE d.archived_at IS NULL AND d.license_expires IS NOT NULL AND d.license_expires <= $1
       ORDER BY d.license_expires LIMIT 50`,
      [horizon]
    );
    for (const row of licenses) {
      const overdue = String(row.license_expires).slice(0, 10) < today;
      push({
        id: `license-${row.id}`,
        type: overdue ? 'DANGER' : 'WARNING',
        category: 'LICENSE',
        title: `Водительское удостоверение: ${row.full_name}`,
        message: `${row.license_no || 'ВУ'} ${overdue ? 'просрочено с' : 'действует до'} ${ruDate(row.license_expires)}`,
        object_type: 'driver',
        object_id: row.id,
      });
    }

    const priority = { DANGER: 0, WARNING: 1, INFO: 2 };
    notifications.sort((a, b) => priority[a.type] - priority[b.type] || String(b.created_at).localeCompare(String(a.created_at)));
    res.json(notifications);
  } catch (err) {
    console.error('Ошибка получения уведомлений:', err);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Внутренняя ошибка сервера' } });
  }
});

export default router;
