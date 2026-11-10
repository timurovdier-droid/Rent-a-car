import { Router } from 'express';
import { pool } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { writeAudit } from '../middleware/audit.js';
const router = Router();

router.use(authenticate, requireRole('ADMIN'));

// GET /reports/pending-transactions — записи диспетчеров, которые ждут подтверждения админа
router.get('/pending-transactions', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT t.id, t.car_id, t.kind, t.category, t.amount, t.method, t.tx_date, t.comment, t.status,
              t.created_by, t.created_at, c.plate, c.brand, c.model,
              u.full_name AS author_name, u.role AS author_role
       FROM car_transactions t
       JOIN cars c ON c.id = t.car_id
       LEFT JOIN users u ON u.id = t.created_by
       WHERE t.status = 'PENDING'
       ORDER BY t.created_at DESC, t.id DESC
       LIMIT 500`
    );
    res.json(rows.map((t) => ({
      ...t,
      car_id: Number(t.car_id),
      can_confirm: true,
      can_edit: true,
      can_delete: true,
    })));
  } catch (err) {
    console.error('Ошибка списка ожидающих операций:', err);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Внутренняя ошибка сервера' } });
  }
});

// POST /reports/pending-transactions/confirm — подтвердить сразу несколько записей
router.post('/pending-transactions/confirm', async (req, res) => {
  try {
    const ids = [...new Set((Array.isArray(req.body.ids) ? req.body.ids : [])
      .map((v) => parseInt(v, 10)).filter(Number.isFinite))].slice(0, 500);
    if (!ids.length) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Не выбраны записи', field: 'ids' } });
    }
    const marks = ids.map((_, i) => `$${i + 2}`).join(', ');
    const { rows } = await pool.query(
      `UPDATE car_transactions SET status = 'CONFIRMED', confirmed_by = $1, confirmed_at = datetime('now')
       WHERE status = 'PENDING' AND id IN (${marks}) RETURNING id, amount`,
      [req.user.id, ...ids]
    );
    for (const r of rows) {
      await writeAudit(pool, req.user.id, 'CAR_TX_CONFIRMED', 'car_transaction', r.id,
        { status: 'PENDING' }, { status: 'CONFIRMED', amount: r.amount }, req.ip);
    }
    res.json({ confirmed: rows.length });
  } catch (err) {
    console.error('Ошибка подтверждения операций:', err);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Внутренняя ошибка сервера' } });
  }
});

// GET /reports/revenue — Выручка по дням за период
router.get('/revenue', async (req, res) => {
  try {
    const { from, to } = req.query;

    if (!from || !to) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Укажите параметры from и to (YYYY-MM-DD)' } });
    }

    const { rows } = await pool.query(
      `SELECT 
         DATE(created_at) AS day,
         COUNT(*) AS payments_count,
         COALESCE(SUM(amount_admin), 0) AS total_amount
       FROM payments
       WHERE status = 'ADMIN_CONFIRMED'
         AND created_at >= $1::date
         AND created_at < ($2::date + INTERVAL '1 day')
       GROUP BY DATE(created_at)
       ORDER BY day ASC`,
      [from, to]
    );

    res.json(rows);
  } catch (err) {
    console.error('Ошибка получения отчёта по выручке:', err);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Внутренняя ошибка сервера' } });
  }
});

// GET /reports/by-branch — Выручка по филиалам
router.get('/by-branch', async (req, res) => {
  try {
    const { from, to } = req.query;

    let query = `
      SELECT 
        b.id AS branch_id,
        b.name AS branch_name,
        COUNT(DISTINCT p.id) AS payments_count,
        COALESCE(SUM(p.amount_admin), 0) AS total_amount
      FROM branches b
      LEFT JOIN cars c ON c.branch_id = b.id AND c.archived_at IS NULL
      LEFT JOIN daily_reports dr ON dr.car_id = c.id
      LEFT JOIN payments p ON p.daily_report_id = dr.id 
        AND p.status = 'ADMIN_CONFIRMED'
    `;

    const params = [];
    let idx = 1;

    if (from) {
      params.push(from);
      query += ` AND p.created_at >= $${idx++}::date`;
    }
    if (to) {
      params.push(to);
      query += ` AND p.created_at < ($${idx++}::date + INTERVAL '1 day')`;
    }

    query += ' GROUP BY b.id, b.name ORDER BY total_amount DESC';

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error('Ошибка получения отчёта по филиалам:', err);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Внутренняя ошибка сервера' } });
  }
});

// GET /reports/by-owner — Выручка по арендодателям
router.get('/by-owner', async (req, res) => {
  try {
    const { from, to } = req.query;

    let query = `
      SELECT 
        o.id AS owner_id,
        o.name AS owner_name,
        o.phone,
        COUNT(DISTINCT c.id) AS cars_count,
        COUNT(DISTINCT p.id) AS payments_count,
        COALESCE(SUM(p.amount_admin), 0) AS total_amount
      FROM owners o
      LEFT JOIN cars c ON c.owner_id = o.id AND c.archived_at IS NULL
      LEFT JOIN daily_reports dr ON dr.car_id = c.id
      LEFT JOIN payments p ON p.daily_report_id = dr.id 
        AND p.status = 'ADMIN_CONFIRMED'
      WHERE o.status != 'ARCHIVED'
    `;

    const params = [];
    let idx = 1;

    if (from) {
      params.push(from);
      query += ` AND p.created_at >= $${idx++}::date`;
    }
    if (to) {
      params.push(to);
      query += ` AND p.created_at < ($${idx++}::date + INTERVAL '1 day')`;
    }

    query += ' GROUP BY o.id, o.name, o.phone ORDER BY total_amount DESC';

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error('Ошибка получения отчёта по арендодателям:', err);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Внутренняя ошибка сервера' } });
  }
});

// GET /reports/top-cars — Топ автомобилей по выручке
router.get('/top-cars', async (req, res) => {
  try {
    const { from, to, limit = 10 } = req.query;

    let query = `
      SELECT 
        c.id AS car_id,
        c.plate,
        c.brand,
        c.model,
        o.name AS owner_name,
        COUNT(p.id) AS payments_count,
        COALESCE(SUM(p.amount_admin), 0) AS total_amount
      FROM cars c
      JOIN owners o ON c.owner_id = o.id
      LEFT JOIN daily_reports dr ON dr.car_id = c.id
      LEFT JOIN payments p ON p.daily_report_id = dr.id 
        AND p.status = 'ADMIN_CONFIRMED'
      WHERE c.archived_at IS NULL
    `;

    const params = [];
    let idx = 1;

    if (from) {
      params.push(from);
      query += ` AND p.created_at >= $${idx++}::date`;
    }
    if (to) {
      params.push(to);
      query += ` AND p.created_at < ($${idx++}::date + INTERVAL '1 day')`;
    }

    query += ` GROUP BY c.id, c.plate, c.brand, c.model, o.name
               ORDER BY total_amount DESC
               LIMIT $${idx++}`;
    params.push(parseInt(limit, 10));

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error('Ошибка получения топа автомобилей:', err);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Внутренняя ошибка сервера' } });
  }
});

// GET /reports/top-drivers — Топ водителей по выручке
router.get('/top-drivers', async (req, res) => {
  try {
    const { from, to, limit = 10 } = req.query;

    let query = `
      SELECT 
        d.id AS driver_id,
        u.full_name,
        u.phone,
        COUNT(p.id) AS payments_count,
        COALESCE(SUM(p.amount_admin), 0) AS total_amount
      FROM drivers d
      JOIN users u ON d.user_id = u.id
      LEFT JOIN daily_reports dr ON dr.driver_id = d.id
      LEFT JOIN payments p ON p.daily_report_id = dr.id 
        AND p.status = 'ADMIN_CONFIRMED'
      WHERE d.archived_at IS NULL
    `;

    const params = [];
    let idx = 1;

    if (from) {
      params.push(from);
      query += ` AND p.created_at >= $${idx++}::date`;
    }
    if (to) {
      params.push(to);
      query += ` AND p.created_at < ($${idx++}::date + INTERVAL '1 day')`;
    }

    query += ` GROUP BY d.id, u.full_name, u.phone
               ORDER BY total_amount DESC
               LIMIT $${idx++}`;
    params.push(parseInt(limit, 10));

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error('Ошибка получения топа водителей:', err);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Внутренняя ошибка сервера' } });
  }
});

export default router;