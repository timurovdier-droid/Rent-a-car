import { Router } from 'express';
import { pool } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { localToday, addDays, getReminderSettings, serviceDue, documentDue } from '../carMoney.js';
import { visibleCars, carMoney, dailySeries, monthStart } from '../fleetStats.js';

const router = Router();

router.use(authenticate);

// Главная админа и диспетчера: сначала машины с метками, затем цифры и график за 14 дней.
async function fleetOverview(user) {
  const isAdmin = user.role === 'ADMIN';
  const today = localToday();
  const from14 = addDays(today, -13);
  const month = monthStart(today);
  const reminders = await getReminderSettings(pool);

  const cars = await visibleCars(pool, user);
  const ids = cars.map((c) => Number(c.id));
  const money = await carMoney(pool, cars, { from: month, to: today });

  let services = [];
  if (ids.length) {
    ({ rows: services } = await pool.query(
      `SELECT car_id, type, status, scheduled_at, due_mileage FROM service_records
       WHERE status = 'SCHEDULED' AND car_id IN (${ids.map((_, i) => `$${i + 1}`).join(', ')})`,
      ids
    ));
  }

  const cards = cars.map((car) => {
    const m = money.get(Number(car.id));
    const due = services
      .filter((s) => Number(s.car_id) === Number(car.id))
      .map((s) => serviceDue(s, car.mileage, reminders, today))
      .filter(Boolean);
    return {
      id: car.id,
      plate: car.plate,
      brand: car.brand,
      model: car.model,
      color: car.color,
      status: car.status,
      branch_name: car.branch_name,
      driver_name: car.driver_name,
      daily_rate: car.daily_rate,
      pending_amount: m.pending_income + m.pending_expenses,
      pending_count: m.pending_count,
      debt: m.debt,
      service_due: due.includes('OVERDUE') ? 'OVERDUE' : due[0] || null,
      insurance_due: documentDue(car.insurance_expires, reminders, today),
      inspection_due: documentDue(car.inspection_expires, reminders, today),
    };
  });

  const total = (key) => [...money.values()].reduce((s, m) => s + m[key], 0);
  const chart = await dailySeries(pool, ids, from14, today, { createdBy: isAdmin ? null : user.id });
  const rented = cars.filter((c) => c.status === 'RENTED').length;

  let stats;
  if (isAdmin) {
    const todayPoint = chart[chart.length - 1];
    stats = {
      today_income: todayPoint.income,
      month_income: total('income'),
      month_expenses: total('expenses'),
      month_profit: total('income') - total('expenses'),
      debt: total('debt'),
      pending_amount: total('pending_income') + total('pending_expenses'),
      pending_count: total('pending_count'),
      cars_total: cars.length,
      cars_rented: rented,
    };
  } else {
    const { rows } = await pool.query(
      `SELECT
         COALESCE(SUM(CASE WHEN status = 'CONFIRMED' AND kind = 'INCOME' AND tx_date = $2 THEN amount ELSE 0 END), 0) AS today_income,
         COALESCE(SUM(CASE WHEN status = 'CONFIRMED' AND kind = 'INCOME' AND tx_date >= $3 THEN amount ELSE 0 END), 0) AS month_income,
         COALESCE(SUM(CASE WHEN status = 'PENDING' THEN amount ELSE 0 END), 0) AS pending_amount,
         COALESCE(SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END), 0) AS pending_count
       FROM car_transactions WHERE created_by = $1`,
      [user.id, today, month]
    );
    stats = {
      today_income: Number(rows[0].today_income),
      month_income: Number(rows[0].month_income),
      pending_amount: Number(rows[0].pending_amount),
      pending_count: Number(rows[0].pending_count),
      debt: total('debt'),
      cars_total: cars.length,
      cars_rented: rented,
    };
  }

  return { role: user.role, today, cars: cards, stats, chart };
}

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
    else if (role === 'DISPATCHER' || role === 'ADMIN') {
      res.json(await fleetOverview(req.user));
    } 
    else if (role === 'OWNER') {
      // Арендодатель: свои машины, доход, расходы и прибыль за месяц (только просмотр)
      const today = localToday();
      const month = monthStart(today);
      const cars = await visibleCars(pool, req.user);
      const money = await carMoney(pool, cars, { from: month, to: today });
      const chart = await dailySeries(pool, cars.map((c) => Number(c.id)), addDays(today, -13), today);
      const list = cars.map((c) => {
        const m = money.get(Number(c.id));
        return {
          id: c.id, plate: c.plate, brand: c.brand, model: c.model, status: c.status,
          income: m.income, expenses: m.expenses, profit: m.profit,
        };
      });
      const total = (key) => list.reduce((s, c) => s + c[key], 0);
      res.json({
        role: 'OWNER',
        today,
        cars: list,
        stats: { month_income: total('income'), month_expenses: total('expenses'), month_profit: total('profit') },
        chart,
      });
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