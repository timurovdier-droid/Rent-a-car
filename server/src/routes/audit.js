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

const isDay = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const localDayOf = (stamp) => {
  if (!stamp) return null;
  const d = new Date(`${String(stamp).replace(' ', 'T')}Z`);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getTime() + 5 * 3600 * 1000).toISOString().slice(0, 10);
};
const parse = (v) => {
  if (!v) return null;
  try { return typeof v === 'string' ? JSON.parse(v) : v; } catch { return null; }
};

// GET /transactions?from&to — ведомость: кто и когда добавил, изменил, удалил или подтвердил деньги.
router.get('/transactions', async (req, res) => {
  try {
    const { from, to, driver_id: driverIdParam } = req.query;
    const driverFilter = driverIdParam ? Number(driverIdParam) : null;
    if (!isDay(from) || !isDay(to) || from > to) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Неверный период' } });
    }
    const inRange = (stamp) => { const d = localDayOf(stamp); return d && d >= from && d <= to; };

    const { rows: users } = await pool.query('SELECT id, full_name FROM users');
    const userName = new Map(users.map((u) => [Number(u.id), u.full_name]));
    const { rows: cars } = await pool.query('SELECT id, plate FROM cars');
    const plateOf = new Map(cars.map((c) => [Number(c.id), c.plate]));

    const { rows: created } = await pool.query(
      `SELECT * FROM car_transactions
       WHERE date(created_at, '+5 hours') >= $1 AND date(created_at, '+5 hours') <= $2`,
      [from, to]
    );
    const { rows: logs } = await pool.query(
      `SELECT * FROM audit_log
       WHERE action IN ('CAR_TX_UPDATED', 'CAR_TX_DELETED', 'CAR_TX_CONFIRMED')
         AND date(at, '+5 hours') >= $1 AND date(at, '+5 hours') <= $2`,
      [from, to]
    );

    const pick = (tx) => ({
      tx_id: Number(tx.id),
      car_id: Number(tx.car_id),
      plate: plateOf.get(Number(tx.car_id)) || null,
      kind: tx.kind,
      category: tx.category,
      method: tx.method,
      amount: Number(tx.amount),
      tx_date: tx.tx_date ? String(tx.tx_date).slice(0, 10) : null,
      comment: tx.comment || null,
    });

    const events = created.map((tx) => ({
      at: tx.created_at, action: 'add', user_name: userName.get(Number(tx.created_by)) || null, ...pick(tx),
    }));
    const txIds = new Set(created.map((t) => Number(t.id)));
    const missing = logs
      .filter((l) => l.action === 'CAR_TX_CONFIRMED' && !txIds.has(Number(l.object_id)))
      .map((l) => Number(l.object_id));
    const extra = new Map();
    if (missing.length) {
      const { rows } = await pool.query(
        `SELECT * FROM car_transactions WHERE id IN (${missing.map((_, i) => `$${i + 1}`).join(', ')})`,
        missing
      );
      for (const r of rows) extra.set(Number(r.id), r);
    }
    const byId = new Map([...created, ...extra.values()].map((t) => [Number(t.id), t]));

    for (const l of logs) {
      const who = userName.get(Number(l.user_id)) || null;
      const oldV = parse(l.old_value);
      const newV = parse(l.new_value);
      if (l.action === 'CAR_TX_DELETED' && oldV) {
        events.push({ at: l.at, action: 'delete', user_name: who, ...pick({ ...oldV, id: l.object_id }) });
        if (oldV.created_at && inRange(oldV.created_at) && !txIds.has(Number(l.object_id))) {
          events.push({
            at: oldV.created_at, action: 'add', user_name: userName.get(Number(oldV.created_by)) || null,
            ...pick({ ...oldV, id: l.object_id }), deleted: true,
          });
        }
      } else if (l.action === 'CAR_TX_UPDATED' && newV) {
        events.push({
          at: l.at, action: 'edit', user_name: who, ...pick({ ...newV, id: l.object_id }),
          old: oldV ? { amount: Number(oldV.amount), method: oldV.method, tx_date: oldV.tx_date, category: oldV.category } : null,
        });
      } else if (l.action === 'CAR_TX_CONFIRMED') {
        const tx = byId.get(Number(l.object_id));
        events.push({
          at: l.at, action: 'confirm', user_name: who,
          ...(tx ? pick(tx) : { tx_id: Number(l.object_id), amount: Number(newV?.amount) || 0 }),
        });
      }
    }

    // Водитель — тот, кто ездил на машине в день операции; в день передачи — кто её взял.
    const carIds = [...new Set(events.map((e) => e.car_id).filter(Boolean))];
    const spans = new Map();
    if (carIds.length) {
      const { rows: assigns } = await pool.query(
        `SELECT ca.car_id, ca.driver_id, ca.start_at, ca.end_at, u.full_name AS driver_name
         FROM car_assignments ca LEFT JOIN drivers d ON d.id = ca.driver_id LEFT JOIN users u ON u.id = d.user_id
         WHERE ca.car_id IN (${carIds.map((_, i) => `$${i + 1}`).join(', ')})
         ORDER BY ca.start_at ASC, ca.id ASC`,
        carIds
      );
      const today = localDayOf(new Date().toISOString().slice(0, 19).replace('T', ' '));
      for (const a of assigns) {
        const list = spans.get(Number(a.car_id)) || [];
        list.push({
          from: localDayOf(a.start_at),
          to: a.end_at ? localDayOf(a.end_at) : today,
          name: a.driver_name,
          driver_id: a.driver_id ? Number(a.driver_id) : null,
        });
        spans.set(Number(a.car_id), list);
      }
    }
    for (const e of events) {
      let name = null;
      let driverId = null;
      for (const s of spans.get(e.car_id) || []) {
        if (e.tx_date && s.from <= e.tx_date && e.tx_date <= s.to) {
          name = s.name;
          driverId = s.driver_id;
        }
      }
      e.driver_name = name;
      e.driver_id = driverId;
    }

    let out = events;
    if (driverFilter) out = out.filter((e) => e.driver_id === driverFilter);

    out.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
    res.json({ from, to, driver_id: driverFilter || null, events: out });
  } catch (err) {
    console.error('Ошибка ведомости операций:', err);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Внутренняя ошибка сервера' } });
  }
});

export default router;