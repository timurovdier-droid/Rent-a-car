import { Router } from 'express';
import { pool } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { visibleCars, carMoney, dailySeries, expensesByCategory, readPeriod } from '../fleetStats.js';
import { addDays, localToday } from '../carMoney.js';

const router = Router();

router.use(authenticate);

function monthBounds(month) {
  const [y, m] = month.split('-').map(Number);
  const first = `${month}-01`;
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return { first, last };
}

function prevMonth(month) {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
}

const sumSeries = (series) => series.reduce(
  (acc, d) => ({ income: acc.income + d.income, expenses: acc.expenses + d.expense }),
  { income: 0, expenses: 0 }
);

// GET /finance/month?month=YYYY-MM — месяц по дням и сравнение с тем же числом дней прошлого месяца
router.get('/month', requireRole('ADMIN', 'OWNER'), async (req, res) => {
  try {
    const today = localToday();
    const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(req.query.month || '') ? req.query.month : today.slice(0, 7);
    const { first, last } = monthBounds(month);
    const cars = await visibleCars(pool, req.user);
    const ids = cars.map((c) => Number(c.id));

    const chart = await dailySeries(pool, ids, first, last);

    const inMonth = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && v >= first && v <= last;
    const elapsedEnd = today >= first && today <= last ? today : last;
    let from = inMonth(req.query.from) ? req.query.from : first;
    let to = inMonth(req.query.to) ? req.query.to : elapsedEnd;
    if (from > to) [from, to] = [to, from];
    const cur = sumSeries(chart.filter((d) => d.day >= from && d.day <= to));

    const prev = monthBounds(prevMonth(month));
    const shift = (day) => {
      const v = addDays(prev.first, Number(day.slice(8, 10)) - 1);
      return v > prev.last ? prev.last : v;
    };
    const prevFrom = shift(from);
    const prevEnd = shift(to);
    const prevTotals = sumSeries(await dailySeries(pool, ids, prevFrom, prevEnd));

    const body = {
      month,
      today,
      from,
      to,
      partial: from !== first || to !== last,
      compare_to: { from: prevFrom, to: prevEnd },
      totals: { ...cur, profit: cur.income - cur.expenses },
      prev: { ...prevTotals, profit: prevTotals.income - prevTotals.expenses },
      chart,
    };

    if (req.user.role === 'ADMIN') {
      const money = await carMoney(pool, cars, { from, to });
      let debt = 0; let pending = 0; let pendingCount = 0; let debtors = 0; let accrued = 0;
      for (const m of money.values()) {
        debt += m.debt;
        if (m.debt > 0) debtors += 1;
        accrued += m.accrued;
        pending += m.pending_income + m.pending_expenses;
        pendingCount += m.pending_count;
      }
      Object.assign(body, { debt, debtors, accrued, pending, pending_count: pendingCount });
    }
    res.json(body);
  } catch (err) {
    console.error('Ошибка месячной сводки:', err);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Внутренняя ошибка сервера' } });
  }
});

// GET /finance/overview — сводка по машинам за период (ADMIN — весь парк, OWNER — свои машины)
router.get('/overview', requireRole('ADMIN', 'OWNER'), async (req, res) => {
  try {
    const { from, to } = readPeriod(req.query);
    const cars = await visibleCars(pool, req.user);
    const ids = cars.map((c) => Number(c.id));
    const money = await carMoney(pool, cars, { from, to });
    const chart = await dailySeries(pool, ids, from, to);
    const categories = await expensesByCategory(pool, ids, from, to);

    const rows = cars.map((c) => ({
      car_id: c.id, plate: c.plate, brand: c.brand, model: c.model,
      owner_id: c.owner_id, owner_name: c.owner_name, driver_name: c.driver_name,
      ...money.get(Number(c.id)),
    }));
    const total = (key) => rows.reduce((s, r) => s + (r[key] || 0), 0);
    const totals = {
      income: total('income'),
      expenses: total('expenses'),
      profit: total('income') - total('expenses'),
    };

    if (req.user.role === 'OWNER') {
      return res.json({
        from, to, totals, chart, categories,
        cars: rows.map(({ car_id, plate, brand, model, income, expenses, profit }) =>
          ({ car_id, plate, brand, model, income, expenses, profit })),
      });
    }

    Object.assign(totals, {
      accrued: total('accrued'),
      debt: total('debt'),
      pending: total('pending_income') + total('pending_expenses'),
      pending_count: total('pending_count'),
    });
    const owners = new Map();
    for (const r of rows) {
      const key = r.owner_id || 0;
      if (!owners.has(key)) {
        owners.set(key, { owner_id: r.owner_id, owner_name: r.owner_name || 'Без арендодателя', cars: 0, income: 0, expenses: 0, profit: 0 });
      }
      const o = owners.get(key);
      o.cars += 1;
      o.income += r.income;
      o.expenses += r.expenses;
      o.profit += r.profit;
    }
    res.json({ from, to, totals, chart, categories, owners: [...owners.values()], cars: rows });
  } catch (err) {
    console.error('Ошибка финансовой сводки:', err);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Внутренняя ошибка сервера' } });
  }
});

// GET /finance/summary — Общая финансовая сводка (только ADMIN)
router.get('/summary', requireRole('ADMIN'), async (req, res) => {
  try {
    const { from, to } = req.query;
    
    let query = `
      SELECT 
        COUNT(*) AS total_payments,
        SUM(p.amount_admin) AS total_confirmed,
        SUM(CASE WHEN p.status = 'ADMIN_CONFIRMED' THEN p.amount_admin ELSE 0 END) AS confirmed_amount,
        SUM(CASE WHEN p.status = 'DISPATCHER_PENDING' THEN p.amount_declared ELSE 0 END) AS pending_dispatcher,
        SUM(CASE WHEN p.status = 'ADMIN_PENDING' THEN p.amount_dispatcher ELSE 0 END) AS pending_admin
      FROM payments p
      WHERE 1=1
    `;
    
    const params = [];
    
    if (from) {
      params.push(from);
      query += ` AND p.created_at >= $${params.length}`;
    }
    if (to) {
      params.push(to);
      query += ` AND p.created_at <= $${params.length}`;
    }

    const { rows } = await pool.query(query, params);
    res.json(rows[0]);
  } catch (err) {
    console.error('Ошибка получения финансовой сводки:', err);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Внутренняя ошибка сервера' } });
  }
});

// GET /finance/owner-summary — Финансовая сводка по арендодателю (ADMIN или OWNER)
router.get('/owner-summary', requireRole('ADMIN', 'OWNER'), async (req, res) => {
  try {
    const { from, to, owner_id } = req.query;
    
    // Если роль OWNER, берём только его данные
    let targetOwnerId = owner_id;
    if (req.user.role === 'OWNER') {
      const { rows: owners } = await pool.query(
        'SELECT id FROM owners WHERE user_id = $1',
        [req.user.id]
      );
      if (owners.length === 0) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Арендодатель не найден' } });
      }
      targetOwnerId = owners[0].id;
    }

    if (!targetOwnerId) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Укажите owner_id' } });
    }

    let query = `
      SELECT 
        c.id AS car_id,
        c.plate,
        c.brand,
        c.model,
        COUNT(p.id) AS payments_count,
        COALESCE(SUM(p.amount_admin), 0) AS total_amount,
        COALESCE(SUM(CASE WHEN p.status = 'ADMIN_CONFIRMED' THEN p.amount_admin ELSE 0 END), 0) AS confirmed_amount
      FROM cars c
      LEFT JOIN daily_reports dr ON c.id = dr.car_id
      LEFT JOIN payments p ON dr.id = p.daily_report_id
      WHERE c.owner_id = $1
        AND c.archived_at IS NULL
    `;
    
    const params = [targetOwnerId];
    let paramIndex = 2;

    if (from) {
      params.push(from);
      query += ` AND p.created_at >= $${paramIndex}`;
      paramIndex++;
    }
    if (to) {
      params.push(to);
      query += ` AND p.created_at <= $${paramIndex}`;
      paramIndex++;
    }

    query += ' GROUP BY c.id, c.plate, c.brand, c.model ORDER BY c.plate';

    const { rows } = await pool.query(query, params);

    // Получаем информацию об арендодателе
    const { rows: ownerInfo } = await pool.query(
      'SELECT id, name, contact_person, phone FROM owners WHERE id = $1',
      [targetOwnerId]
    );

    const totalAmount = rows.reduce((sum, row) => sum + Number(row.confirmed_amount), 0);

    res.json({
      owner: ownerInfo[0],
      cars: rows,
      total_amount: totalAmount,
      period: { from, to }
    });
  } catch (err) {
    console.error('Ошибка получения сводки арендодателя:', err);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Внутренняя ошибка сервера' } });
  }
});

// GET /finance/owners-list — Список арендодателей с суммами (только ADMIN)
router.get('/owners-list', requireRole('ADMIN'), async (req, res) => {
  try {
    const { from, to } = req.query;

    let query = `
      SELECT 
        o.id,
        o.name,
        o.phone,
        COUNT(DISTINCT c.id) AS cars_count,
        COALESCE(SUM(p.amount_admin), 0) AS total_amount
      FROM owners o
      LEFT JOIN cars c ON o.id = c.owner_id AND c.archived_at IS NULL
      LEFT JOIN daily_reports dr ON c.id = dr.car_id
      LEFT JOIN payments p ON dr.id = p.daily_report_id AND p.status = 'ADMIN_CONFIRMED'
      WHERE o.status != 'ARCHIVED'
    `;

    const params = [];
    let paramIndex = 1;

    if (from) {
      params.push(from);
      query += ` AND p.created_at >= $${paramIndex}`;
      paramIndex++;
    }
    if (to) {
      params.push(to);
      query += ` AND p.created_at <= $${paramIndex}`;
      paramIndex++;
    }

    query += ' GROUP BY o.id, o.name, o.phone ORDER BY o.name';

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error('Ошибка получения списка арендодателей с суммами:', err);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Внутренняя ошибка сервера' } });
  }
});

export default router;