import { Router } from 'express';
import { pool } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { writeAudit } from '../middleware/audit.js';
import {
  INCOME_CATEGORIES,
  EXPENSE_CATEGORIES,
  PAY_METHODS,
  localDay,
  localToday,
  isDay,
  addDays,
  dayStartUtc,
  daysBetween,
  loadAccrualInputs,
  computeAccruals,
  getReminderSettings,
  serviceDue,
  documentDue,
  ownerIdForUser,
  carDailyLedger,
  carDebtDays,
} from '../carMoney.js';

const router = Router();
router.use(authenticate);

const SERVICE_TYPES = ['OIL_CHANGE', 'REPAIR', 'INSPECTION', 'INSURANCE', 'TIRE', 'OTHER'];
const SERVICE_LABELS = {
  OIL_CHANGE: 'Замена масла',
  REPAIR: 'Ремонт',
  INSPECTION: 'Техосмотр',
  INSURANCE: 'Страховка',
  TIRE: 'Шины',
  OTHER: 'Другое',
};
const MAX_AMOUNT = 100_000_000_000;

function fail(res, status, code, message, field) {
  return res.status(status).json({ error: { code, message, ...(field ? { field } : {}) } });
}

function serverError(res, label, err) {
  console.error(label, err);
  return fail(res, 500, 'INTERNAL_ERROR', 'Внутренняя ошибка сервера');
}

function toInt(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(String(value).replace(/\s+/g, ''));
  return Number.isFinite(n) ? Math.round(n) : NaN;
}

async function loadCar(req, res, { write = false } = {}) {
  const id = parseInt(req.params.id, 10);
  const { user } = req;
  if (!Number.isFinite(id)) {
    fail(res, 404, 'NOT_FOUND', 'Автомобиль не найден');
    return null;
  }
  if (user.role === 'DRIVER') {
    fail(res, 403, 'FORBIDDEN', 'Недостаточно прав');
    return null;
  }
  if (write && user.role === 'OWNER') {
    fail(res, 403, 'FORBIDDEN', 'Арендодатель может только просматривать');
    return null;
  }
  const { rows } = await pool.query(
    `SELECT c.*, o.name AS owner_name, b.name AS branch_name
     FROM cars c
     LEFT JOIN owners o ON o.id = c.owner_id
     LEFT JOIN branches b ON b.id = c.branch_id
     WHERE c.id = $1 AND c.archived_at IS NULL`,
    [id]
  );
  const car = rows[0];
  let visible = Boolean(car);
  if (car && user.role === 'DISPATCHER' && user.branch_id) {
    visible = Number(car.branch_id) === Number(user.branch_id);
  }
  if (car && user.role === 'OWNER') {
    visible = Number(car.owner_id) === (await ownerIdForUser(pool, user.id));
  }
  if (!visible) {
    fail(res, 404, 'NOT_FOUND', 'Автомобиль не найден');
    return null;
  }
  return car;
}

function txPermissions(tx, user) {
  if (user.role === 'ADMIN') return { can_edit: true, can_delete: true, can_confirm: tx.status === 'PENDING' };
  const own = user.role === 'DISPATCHER' && tx.status === 'PENDING' && Number(tx.created_by) === Number(user.id);
  return { can_edit: own, can_delete: own, can_confirm: false };
}

function summaryForRole(role, totals) {
  const debt = Math.max(totals.accrued - totals.received, 0);
  const overpaid = Math.max(totals.received - totals.accrued, 0);
  if (role === 'ADMIN') {
    return { ...totals, debt, overpaid, profit: totals.income_all - totals.expenses };
  }
  if (role === 'DISPATCHER') {
    return {
      accrued: totals.accrued,
      accrued_days: totals.accrued_days,
      received: totals.received,
      pending: totals.pending,
      debt,
      overpaid,
    };
  }
  return { income: totals.income_all, expenses: totals.expenses, profit: totals.income_all - totals.expenses };
}

// GET /cars/:id/ledger?from&to — таблица по дням: начислено, наличные, перевод, долг
router.get('/:id/ledger', async (req, res) => {
  try {
    const car = await loadCar(req, res);
    if (!car) return;
    const today = localToday();
    const to = isDay(req.query.to) ? req.query.to : today;
    const from = isDay(req.query.from) ? req.query.from : addDays(to, -29);
    if (from > to) return fail(res, 400, 'BAD_REQUEST', 'Дата «с» позже даты «по»', 'from');
    if (daysBetween(from, to).length > 366) return fail(res, 400, 'BAD_REQUEST', 'Не больше года за раз', 'from');
    const ledger = await carDailyLedger(pool, car.id, from, to);
    res.json({
      car: { id: car.id, plate: car.plate, brand: car.brand, model: car.model },
      ...ledger,
    });
  } catch (err) {
    serverError(res, 'Ошибка таблицы по дням:', err);
  }
});

// GET /cars/:id/debts — за какие дни и какой водитель должен
router.get('/:id/debts', async (req, res) => {
  try {
    const car = await loadCar(req, res);
    if (!car) return;
    if (req.user.role === 'OWNER') return fail(res, 403, 'FORBIDDEN', 'Недостаточно прав');
    res.json(await carDebtDays(pool, car.id));
  } catch (err) {
    serverError(res, 'Ошибка долга по дням:', err);
  }
});

// GET /cars/:id/hub — всё по машине одним запросом
router.get('/:id/hub', async (req, res) => {
  try {
    const car = await loadCar(req, res);
    if (!car) return;
    const { user } = req;
    const carId = Number(car.id);
    const reminders = await getReminderSettings(pool);
    const today = localToday();

    const { rows: assignments } = await pool.query(
      `SELECT ca.id, ca.driver_id, ca.start_at, ca.end_at, ca.mileage_start, ca.mileage_end, ca.note,
              u.full_name AS driver_name, u.phone AS driver_phone, cb.full_name AS created_by_name
       FROM car_assignments ca
       LEFT JOIN drivers d ON d.id = ca.driver_id
       LEFT JOIN users u ON u.id = d.user_id
       LEFT JOIN users cb ON cb.id = ca.created_by
       WHERE ca.car_id = $1
       ORDER BY ca.start_at DESC, ca.id DESC
       LIMIT 100`,
      [carId]
    );
    const current = assignments.find((a) => !a.end_at) || null;

    const { rows: totalsRows } = await pool.query(
      `SELECT kind, status, COALESCE(SUM(amount), 0) AS total, COUNT(*) AS cnt
       FROM car_transactions WHERE car_id = $1 GROUP BY kind, status`,
      [carId]
    );
    const sum = (kind, status) =>
      totalsRows.filter((r) => r.kind === kind && (!status || r.status === status))
        .reduce((s, r) => s + Number(r.total), 0);

    const accrual = computeAccruals(await loadAccrualInputs(pool, [carId])).get(carId);
    const totals = {
      accrued: accrual.total,
      accrued_days: accrual.days.length,
      received: sum('INCOME', 'CONFIRMED'),
      pending: sum('INCOME', 'PENDING'),
      pending_expenses: sum('EXPENSE', 'PENDING'),
      income_all: sum('INCOME', 'CONFIRMED'),
      expenses: sum('EXPENSE', 'CONFIRMED'),
    };

    let txSql = `
      SELECT t.id, t.kind, t.category, t.amount, t.method, t.tx_date, t.comment, t.status,
             t.created_by, t.created_at, t.confirmed_at, t.service_record_id,
             u.full_name AS author_name, cu.full_name AS confirmed_by_name
      FROM car_transactions t
      LEFT JOIN users u ON u.id = t.created_by
      LEFT JOIN users cu ON cu.id = t.confirmed_by
      WHERE t.car_id = $1`;
    const txParams = [carId];
    if (user.role === 'DISPATCHER') {
      txParams.push(user.id);
      txSql += ` AND (t.kind = 'INCOME' OR t.created_by = $2)`;
    } else if (user.role === 'OWNER') {
      txSql += ` AND t.status = 'CONFIRMED'`;
    }
    txSql += ' ORDER BY t.tx_date DESC, t.id DESC LIMIT 300';
    const { rows: transactions } = await pool.query(txSql, txParams);

    const { rows: daysOff } = await pool.query(
      `SELECT day, reason FROM car_days_off WHERE car_id = $1 AND day >= $2 ORDER BY day`,
      [carId, addDays(today, -400)]
    );

    const { rows: services } = await pool.query(
      `SELECT s.id, s.type, s.description, s.comment, s.cost, s.status, s.scheduled_at, s.due_mileage,
              s.completed_at, s.done_mileage, s.created_at
       FROM service_records s
       WHERE s.car_id = $1
       ORDER BY CASE WHEN s.status = 'SCHEDULED' THEN 0 ELSE 1 END,
                COALESCE(s.completed_at, s.scheduled_at, s.created_at) DESC
       LIMIT 40`,
      [carId]
    );

    let rates = [];
    let freeDrivers = [];
    if (user.role === 'ADMIN') {
      ({ rows: rates } = await pool.query(
        `SELECT r.id, r.rate, r.valid_from, r.created_at, u.full_name AS author_name
         FROM car_rate_history r LEFT JOIN users u ON u.id = r.created_by
         WHERE r.car_id = $1 ORDER BY r.valid_from DESC, r.id DESC LIMIT 20`,
        [carId]
      ));
    }
    if (user.role === 'ADMIN' || user.role === 'DISPATCHER') {
      ({ rows: freeDrivers } = await pool.query(
        `SELECT d.id, u.full_name, u.phone, d.deposit, d.branch_id
         FROM drivers d JOIN users u ON u.id = d.user_id
         WHERE d.archived_at IS NULL
           AND NOT EXISTS (SELECT 1 FROM car_assignments ca WHERE ca.driver_id = d.id AND ca.end_at IS NULL)
         ORDER BY u.full_name`
      ));
    }

    res.json({
      car: {
        ...car,
        insurance_due: documentDue(car.insurance_expires, reminders, today),
        inspection_due: documentDue(car.inspection_expires, reminders, today),
      },
      today,
      current,
      assignments,
      summary: summaryForRole(user.role, totals),
      transactions: transactions.map((t) => ({ ...t, ...txPermissions(t, user) })),
      days_off: daysOff.map((d) => d.day),
      idle_days: daysOff.filter((d) => d.reason).map((d) => ({ day: d.day, reason: d.reason })),
      services: services.map((s) => ({
        ...s,
        label: SERVICE_LABELS[s.type] || s.type,
        due: serviceDue(s, car.mileage, reminders, today),
      })),
      rates,
      free_drivers: freeDrivers,
      reminders,
    });
  } catch (err) {
    serverError(res, 'Ошибка загрузки карточки автомобиля:', err);
  }
});

function readTransaction(body, { partial = false } = {}) {
  const out = {};
  if (!partial || body.kind !== undefined) {
    if (!['INCOME', 'EXPENSE'].includes(body.kind)) return { error: ['Выберите: доход или расход', 'kind'] };
    out.kind = body.kind;
  }
  if (!partial || body.amount !== undefined) {
    const amount = toInt(body.amount);
    if (!amount || Number.isNaN(amount) || amount <= 0 || amount > MAX_AMOUNT) {
      return { error: ['Укажите сумму больше нуля', 'amount'] };
    }
    out.amount = amount;
  }
  if (!partial || body.method !== undefined) {
    const method = body.method || 'CASH';
    if (!PAY_METHODS.includes(method)) return { error: ['Неизвестный способ оплаты', 'method'] };
    out.method = method;
  }
  if (!partial || body.tx_date !== undefined) {
    const day = body.tx_date || localToday();
    if (!isDay(day)) return { error: ['Неверная дата', 'tx_date'] };
    out.tx_date = day;
  }
  if (!partial || body.comment !== undefined) {
    out.comment = body.comment ? String(body.comment).trim().slice(0, 500) : null;
  }
  if (!partial || body.category !== undefined) {
    out.category = body.category || null;
  }
  return { value: out };
}

function checkCategory(kind, category) {
  const list = kind === 'INCOME' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const value = category || (kind === 'INCOME' ? 'RENT' : 'OTHER');
  return list.includes(value) ? value : null;
}

// POST /cars/:id/transactions — доход или расход
router.post('/:id/transactions', requireRole('ADMIN', 'DISPATCHER'), async (req, res) => {
  try {
    const car = await loadCar(req, res, { write: true });
    if (!car) return;
    const parsed = readTransaction(req.body);
    if (parsed.error) return fail(res, 400, 'BAD_REQUEST', parsed.error[0], parsed.error[1]);
    const tx = parsed.value;
    const category = checkCategory(tx.kind, tx.category);
    if (!category) return fail(res, 400, 'BAD_REQUEST', 'Неизвестная категория', 'category');

    const isAdmin = req.user.role === 'ADMIN';
    const { rows } = await pool.query(
      `INSERT INTO car_transactions
         (car_id, kind, category, amount, method, tx_date, comment, status, created_by, confirmed_by, confirmed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        car.id, tx.kind, category, tx.amount, tx.method, tx.tx_date, tx.comment,
        isAdmin ? 'CONFIRMED' : 'PENDING', req.user.id,
        isAdmin ? req.user.id : null, isAdmin ? new Date() : null,
      ]
    );
    await writeAudit(pool, req.user.id, 'CAR_TX_CREATED', 'car_transaction', rows[0].id, null, rows[0], req.ip);
    res.status(201).json(rows[0]);
  } catch (err) {
    serverError(res, 'Ошибка записи операции:', err);
  }
});

async function loadTx(req, res, car) {
  const { rows } = await pool.query(
    'SELECT * FROM car_transactions WHERE id = $1 AND car_id = $2',
    [parseInt(req.params.txId, 10), car.id]
  );
  if (!rows.length) {
    fail(res, 404, 'NOT_FOUND', 'Операция не найдена');
    return null;
  }
  return rows[0];
}

// PATCH /cars/:id/transactions/:txId
router.patch('/:id/transactions/:txId', requireRole('ADMIN', 'DISPATCHER'), async (req, res) => {
  try {
    const car = await loadCar(req, res, { write: true });
    if (!car) return;
    const tx = await loadTx(req, res, car);
    if (!tx) return;
    if (!txPermissions(tx, req.user).can_edit) {
      return fail(res, 403, 'FORBIDDEN', 'Подтверждённую запись может менять только администратор');
    }
    const parsed = readTransaction({ ...req.body, kind: undefined }, { partial: true });
    if (parsed.error) return fail(res, 400, 'BAD_REQUEST', parsed.error[0], parsed.error[1]);
    const next = { ...parsed.value };
    if (next.category !== undefined) {
      next.category = checkCategory(tx.kind, next.category);
      if (!next.category) return fail(res, 400, 'BAD_REQUEST', 'Неизвестная категория', 'category');
    }
    const keys = Object.keys(next);
    if (!keys.length) return fail(res, 400, 'BAD_REQUEST', 'Нет данных для обновления');
    const params = keys.map((k) => next[k]);
    const sets = keys.map((k, i) => `${k} = $${i + 1}`);
    params.push(tx.id);
    const { rows } = await pool.query(
      `UPDATE car_transactions SET ${sets.join(', ')}, updated_at = datetime('now')
       WHERE id = $${params.length} RETURNING *`,
      params
    );
    await writeAudit(pool, req.user.id, 'CAR_TX_UPDATED', 'car_transaction', tx.id, tx, rows[0], req.ip);
    res.json(rows[0]);
  } catch (err) {
    serverError(res, 'Ошибка изменения операции:', err);
  }
});

// DELETE /cars/:id/transactions/:txId
router.delete('/:id/transactions/:txId', requireRole('ADMIN', 'DISPATCHER'), async (req, res) => {
  try {
    const car = await loadCar(req, res, { write: true });
    if (!car) return;
    const tx = await loadTx(req, res, car);
    if (!tx) return;
    if (!txPermissions(tx, req.user).can_delete) {
      return fail(res, 403, 'FORBIDDEN', 'Подтверждённую запись может удалить только администратор');
    }
    await pool.query('DELETE FROM car_transactions WHERE id = $1', [tx.id]);
    await writeAudit(pool, req.user.id, 'CAR_TX_DELETED', 'car_transaction', tx.id, tx, null, req.ip);
    res.json({ id: tx.id, deleted: true });
  } catch (err) {
    serverError(res, 'Ошибка удаления операции:', err);
  }
});

// POST /cars/:id/transactions/:txId/confirm — только админ
router.post('/:id/transactions/:txId/confirm', requireRole('ADMIN'), async (req, res) => {
  try {
    const car = await loadCar(req, res, { write: true });
    if (!car) return;
    const tx = await loadTx(req, res, car);
    if (!tx) return;
    if (tx.status !== 'PENDING') return fail(res, 409, 'CONFLICT', 'Запись уже подтверждена');
    const { rows } = await pool.query(
      `UPDATE car_transactions SET status = 'CONFIRMED', confirmed_by = $1, confirmed_at = datetime('now')
       WHERE id = $2 RETURNING *`,
      [req.user.id, tx.id]
    );
    await writeAudit(pool, req.user.id, 'CAR_TX_CONFIRMED', 'car_transaction', tx.id,
      { status: tx.status }, { status: 'CONFIRMED', amount: tx.amount }, req.ip);
    res.json(rows[0]);
  } catch (err) {
    serverError(res, 'Ошибка подтверждения операции:', err);
  }
});

// POST /cars/:id/transactions-confirm-all — подтвердить все ожидающие записи машины
router.post('/:id/transactions-confirm-all', requireRole('ADMIN'), async (req, res) => {
  try {
    const car = await loadCar(req, res, { write: true });
    if (!car) return;
    const { rows } = await pool.query(
      `UPDATE car_transactions SET status = 'CONFIRMED', confirmed_by = $1, confirmed_at = datetime('now')
       WHERE car_id = $2 AND status = 'PENDING' RETURNING id, amount`,
      [req.user.id, car.id]
    );
    if (rows.length) {
      await writeAudit(pool, req.user.id, 'CAR_TX_CONFIRMED_ALL', 'car', car.id, null,
        { ids: rows.map((r) => r.id) }, req.ip);
    }
    res.json({ confirmed: rows.length });
  } catch (err) {
    serverError(res, 'Ошибка подтверждения операций:', err);
  }
});

// POST /cars/:id/rate — ставка аренды в день (только админ)
router.post('/:id/rate', requireRole('ADMIN'), async (req, res) => {
  try {
    const car = await loadCar(req, res, { write: true });
    if (!car) return;
    const rate = toInt(req.body.rate);
    if (rate === null || Number.isNaN(rate) || rate < 0 || rate > MAX_AMOUNT) {
      return fail(res, 400, 'BAD_REQUEST', 'Укажите ставку (0 или больше)', 'rate');
    }
    const validFrom = req.body.valid_from || localToday();
    if (!isDay(validFrom)) return fail(res, 400, 'BAD_REQUEST', 'Неверная дата начала', 'valid_from');

    await pool.query(
      `INSERT INTO car_rate_history (car_id, rate, valid_from, created_by) VALUES ($1, $2, $3, $4)`,
      [car.id, rate, validFrom, req.user.id]
    );
    const { rows } = await pool.query(
      `SELECT rate FROM car_rate_history WHERE car_id = $1 AND valid_from <= $2
       ORDER BY valid_from DESC, id DESC LIMIT 1`,
      [car.id, localToday()]
    );
    const current = rows.length ? Number(rows[0].rate) : 0;
    await pool.query('UPDATE cars SET daily_rate = $1 WHERE id = $2', [current, car.id]);
    await writeAudit(pool, req.user.id, 'CAR_RATE_CHANGED', 'car', car.id,
      { daily_rate: car.daily_rate }, { rate, valid_from: validFrom }, req.ip);
    res.json({ daily_rate: current, rate, valid_from: validFrom });
  } catch (err) {
    serverError(res, 'Ошибка изменения ставки:', err);
  }
});

// POST /cars/:id/days-off — выходной (без начисления), можно заранее и диапазоном
router.post('/:id/days-off', requireRole('ADMIN', 'DISPATCHER'), async (req, res) => {
  try {
    const car = await loadCar(req, res, { write: true });
    if (!car) return;
    const from = req.body.from || req.body.day;
    const to = req.body.to || from;
    if (!isDay(from) || !isDay(to) || to < from) {
      return fail(res, 400, 'BAD_REQUEST', 'Укажите дату выходного', 'day');
    }
    const days = daysBetween(from, to);
    if (days.length > 92) return fail(res, 400, 'BAD_REQUEST', 'Не больше 92 дней за раз', 'to');
    for (const day of days) {
      await pool.query(
        `INSERT INTO car_days_off (car_id, day, created_by) VALUES ($1, $2, $3)
         ON CONFLICT (car_id, day) DO NOTHING`,
        [car.id, day, req.user.id]
      );
    }
    await writeAudit(pool, req.user.id, 'CAR_DAYS_OFF_ADDED', 'car', car.id, null, { from, to }, req.ip);
    res.status(201).json({ days });
  } catch (err) {
    serverError(res, 'Ошибка добавления выходного:', err);
  }
});

// PUT /cars/:id/days-off — отдельные дни из календаря { add: [...], remove: [...] }
router.put('/:id/days-off', requireRole('ADMIN', 'DISPATCHER'), async (req, res) => {
  try {
    const car = await loadCar(req, res, { write: true });
    if (!car) return;
    const add = Array.isArray(req.body.add) ? [...new Set(req.body.add)] : [];
    const remove = Array.isArray(req.body.remove) ? [...new Set(req.body.remove)] : [];
    if (!add.length && !remove.length) return fail(res, 400, 'BAD_REQUEST', 'Выберите дни', 'days');
    if (add.length + remove.length > 400) return fail(res, 400, 'BAD_REQUEST', 'Слишком много дней за раз', 'days');
    if (![...add, ...remove].every(isDay)) return fail(res, 400, 'BAD_REQUEST', 'Неверная дата', 'days');

    for (const day of add) {
      await pool.query(
        `INSERT INTO car_days_off (car_id, day, created_by) VALUES ($1, $2, $3)
         ON CONFLICT (car_id, day) DO NOTHING`,
        [car.id, day, req.user.id]
      );
    }
    for (const day of remove) {
      await pool.query('DELETE FROM car_days_off WHERE car_id = $1 AND day = $2', [car.id, day]);
    }
    await writeAudit(pool, req.user.id, 'CAR_DAYS_OFF_CHANGED', 'car', car.id, remove.length ? { removed: remove } : null, add.length ? { added: add } : null, req.ip);
    res.json({ added: add, removed: remove });
  } catch (err) {
    serverError(res, 'Ошибка изменения выходных:', err);
  }
});

const IDLE_REASONS = ['REPAIR', 'LEFT', 'OTHER'];

// POST /cars/:id/idle — простой: машина на ремонте или водитель её оставил, аренда за эти дни не начисляется
router.post('/:id/idle', requireRole('ADMIN', 'DISPATCHER'), async (req, res) => {
  try {
    const car = await loadCar(req, res, { write: true });
    if (!car) return;
    const from = req.body.from;
    const to = req.body.to || from;
    const reason = req.body.reason;
    if (!IDLE_REASONS.includes(reason)) return fail(res, 400, 'BAD_REQUEST', 'Выберите причину простоя', 'reason');
    if (!isDay(from) || !isDay(to) || to < from) {
      return fail(res, 400, 'BAD_REQUEST', 'Укажите даты простоя', 'from');
    }
    const days = daysBetween(from, to);
    if (days.length > 92) return fail(res, 400, 'BAD_REQUEST', 'Не больше 92 дней за раз', 'to');
    for (const day of days) {
      await pool.query(
        `INSERT INTO car_days_off (car_id, day, reason, created_by) VALUES ($1, $2, $3, $4)
         ON CONFLICT (car_id, day) DO UPDATE SET reason = excluded.reason`,
        [car.id, day, reason, req.user.id]
      );
    }
    await writeAudit(pool, req.user.id, 'CAR_IDLE_ADDED', 'car', car.id, null, { from, to, reason }, req.ip);
    res.status(201).json({ days, reason });
  } catch (err) {
    serverError(res, 'Ошибка отметки простоя:', err);
  }
});

router.delete('/:id/days-off/:day', requireRole('ADMIN', 'DISPATCHER'), async (req, res) => {
  try {
    const car = await loadCar(req, res, { write: true });
    if (!car) return;
    if (!isDay(req.params.day)) return fail(res, 400, 'BAD_REQUEST', 'Неверная дата');
    await pool.query('DELETE FROM car_days_off WHERE car_id = $1 AND day = $2', [car.id, req.params.day]);
    await writeAudit(pool, req.user.id, 'CAR_DAY_OFF_REMOVED', 'car', car.id, { day: req.params.day }, null, req.ip);
    res.json({ day: req.params.day, deleted: true });
  } catch (err) {
    serverError(res, 'Ошибка удаления выходного:', err);
  }
});

function stampFor(day) {
  return day === localToday() ? new Date() : dayStartUtc(day);
}

// POST /cars/:id/assign — выдать машину водителю
router.post('/:id/assign', requireRole('ADMIN', 'DISPATCHER'), async (req, res) => {
  const car = await loadCar(req, res, { write: true }).catch((err) => { serverError(res, 'Ошибка:', err); return null; });
  if (!car) return;
  const driverId = parseInt(req.body.driver_id, 10);
  const day = req.body.date || localToday();
  const mileage = toInt(req.body.mileage);
  if (!driverId) return fail(res, 400, 'BAD_REQUEST', 'Выберите водителя', 'driver_id');
  if (!isDay(day)) return fail(res, 400, 'BAD_REQUEST', 'Неверная дата выдачи', 'date');
  if (mileage === null || Number.isNaN(mileage) || mileage < 0) {
    return fail(res, 400, 'BAD_REQUEST', 'Укажите пробег при выдаче', 'mileage');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: active } = await client.query(
      'SELECT id FROM car_assignments WHERE car_id = $1 AND end_at IS NULL', [car.id]
    );
    if (active.length) {
      await client.query('ROLLBACK');
      return fail(res, 409, 'CONFLICT', 'Машина уже выдана. Сначала примите её у водителя.');
    }
    const { rows: drivers } = await client.query(
      `SELECT d.id, d.branch_id FROM drivers d
       WHERE d.id = $1 AND d.archived_at IS NULL
         AND NOT EXISTS (SELECT 1 FROM car_assignments ca WHERE ca.driver_id = d.id AND ca.end_at IS NULL)`,
      [driverId]
    );
    if (!drivers.length) {
      await client.query('ROLLBACK');
      return fail(res, 409, 'CONFLICT', 'Водитель не найден или уже ездит на другой машине');
    }
    const { rows } = await client.query(
      `INSERT INTO car_assignments (car_id, driver_id, start_at, mileage_start, note, created_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [car.id, driverId, stampFor(day), mileage, req.body.note || null, req.user.id]
    );
    await client.query(`UPDATE cars SET status = 'RENTED', mileage = $1 WHERE id = $2`, [mileage, car.id]);
    await client.query(`UPDATE drivers SET status = 'RENTED' WHERE id = $1`, [driverId]);
    await writeAudit(client, req.user.id, 'ASSIGNMENT_CREATED', 'car_assignment', rows[0].id, null,
      { car_id: car.id, driver_id: driverId, date: day, mileage }, req.ip);
    await client.query('COMMIT');
    res.status(201).json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    serverError(res, 'Ошибка выдачи машины:', err);
  } finally {
    client.release();
  }
});

// POST /cars/:id/release — принять машину у водителя
router.post('/:id/release', requireRole('ADMIN', 'DISPATCHER'), async (req, res) => {
  const car = await loadCar(req, res, { write: true }).catch((err) => { serverError(res, 'Ошибка:', err); return null; });
  if (!car) return;
  const day = req.body.date || localToday();
  const mileage = toInt(req.body.mileage);
  if (!isDay(day)) return fail(res, 400, 'BAD_REQUEST', 'Неверная дата сдачи', 'date');
  if (mileage === null || Number.isNaN(mileage) || mileage < 0) {
    return fail(res, 400, 'BAD_REQUEST', 'Укажите пробег при сдаче', 'mileage');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      'SELECT * FROM car_assignments WHERE car_id = $1 AND end_at IS NULL ORDER BY start_at DESC LIMIT 1',
      [car.id]
    );
    const assignment = rows[0];
    if (!assignment) {
      await client.query('ROLLBACK');
      return fail(res, 409, 'CONFLICT', 'Машина сейчас никому не выдана');
    }
    if (assignment.mileage_start != null && mileage < Number(assignment.mileage_start)) {
      await client.query('ROLLBACK');
      return fail(res, 400, 'BAD_REQUEST', `Пробег не может быть меньше, чем при выдаче (${assignment.mileage_start})`, 'mileage');
    }
    if (day < localDay(assignment.start_at)) {
      await client.query('ROLLBACK');
      return fail(res, 400, 'BAD_REQUEST', 'Дата сдачи раньше даты выдачи', 'date');
    }
    await client.query(
      `UPDATE car_assignments SET end_at = $1, mileage_end = $2, note = COALESCE($3, note) WHERE id = $4`,
      [stampFor(day), mileage, req.body.note || null, assignment.id]
    );
    await client.query(`UPDATE cars SET status = 'FREE', mileage = $1 WHERE id = $2`, [mileage, car.id]);
    await client.query(`UPDATE drivers SET status = 'FREE' WHERE id = $1`, [assignment.driver_id]);
    await writeAudit(client, req.user.id, 'ASSIGNMENT_ENDED', 'car_assignment', assignment.id,
      { mileage_start: assignment.mileage_start }, { date: day, mileage }, req.ip);
    await client.query('COMMIT');
    res.json({ id: assignment.id, ended: true });
  } catch (err) {
    await client.query('ROLLBACK');
    serverError(res, 'Ошибка приёма машины:', err);
  } finally {
    client.release();
  }
});

// DELETE /cars/:id/assignments/:aid — убрать ошибочную выдачу: аренда за её дни больше не начисляется.
// Текущую выдачу могут убрать админ и диспетчер, прошлые записи истории — только админ.
router.delete('/:id/assignments/:aid', requireRole('ADMIN', 'DISPATCHER'), async (req, res) => {
  const car = await loadCar(req, res, { write: true }).catch((err) => { serverError(res, 'Ошибка:', err); return null; });
  if (!car) return;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT ca.*, u.full_name AS driver_name
       FROM car_assignments ca
       LEFT JOIN drivers d ON d.id = ca.driver_id
       LEFT JOIN users u ON u.id = d.user_id
       WHERE ca.id = $1 AND ca.car_id = $2`,
      [parseInt(req.params.aid, 10), car.id]
    );
    const assignment = rows[0];
    if (!assignment) {
      await client.query('ROLLBACK');
      return fail(res, 404, 'NOT_FOUND', 'Запись не найдена');
    }
    const active = !assignment.end_at;
    if (!active && req.user.role !== 'ADMIN') {
      await client.query('ROLLBACK');
      return fail(res, 403, 'FORBIDDEN', 'Удалять историю может только администратор');
    }
    await client.query('DELETE FROM car_assignments WHERE id = $1', [assignment.id]);
    if (active) {
      await client.query(`UPDATE cars SET status = 'FREE' WHERE id = $1`, [car.id]);
      if (assignment.driver_id) {
        await client.query(
          `UPDATE drivers SET status = 'FREE' WHERE id = $1
             AND NOT EXISTS (SELECT 1 FROM car_assignments WHERE driver_id = $1 AND end_at IS NULL)`,
          [assignment.driver_id]
        );
      }
    }
    await writeAudit(client, req.user.id, 'ASSIGNMENT_DELETED', 'car_assignment', assignment.id, {
      car_id: car.id, driver_id: assignment.driver_id, driver_name: assignment.driver_name,
      start_at: assignment.start_at, end_at: assignment.end_at,
      mileage_start: assignment.mileage_start, mileage_end: assignment.mileage_end,
    }, null, req.ip);
    await client.query('COMMIT');
    res.json({ id: assignment.id, deleted: true });
  } catch (err) {
    await client.query('ROLLBACK');
    serverError(res, 'Ошибка удаления выдачи:', err);
  } finally {
    client.release();
  }
});

async function addServiceExpense(db, user, car, record, cost, day) {
  if (!cost) return null;
  const isAdmin = user.role === 'ADMIN';
  const { rows } = await db.query(
    `INSERT INTO car_transactions
       (car_id, kind, category, amount, method, tx_date, comment, status, created_by, confirmed_by, confirmed_at, service_record_id)
     VALUES ($1, 'EXPENSE', 'SERVICE', $2, 'CASH', $3, $4, $5, $6, $7, $8, $9)
     RETURNING id`,
    [
      car.id, cost, day, `ТО: ${SERVICE_LABELS[record.type] || record.type}`,
      isAdmin ? 'CONFIRMED' : 'PENDING', user.id,
      isAdmin ? user.id : null, isAdmin ? new Date() : null, record.id,
    ]
  );
  return rows[0].id;
}

// POST /cars/:id/service — запланировать (или сразу отметить сделанным) обслуживание
router.post('/:id/service', requireRole('ADMIN', 'DISPATCHER'), async (req, res) => {
  try {
    const car = await loadCar(req, res, { write: true });
    if (!car) return;
    const { type, due_date, comment, done } = req.body;
    const dueMileage = toInt(req.body.due_mileage);
    if (!SERVICE_TYPES.includes(type)) return fail(res, 400, 'BAD_REQUEST', 'Выберите вид обслуживания', 'type');
    if (due_date && !isDay(due_date)) return fail(res, 400, 'BAD_REQUEST', 'Неверная дата', 'due_date');
    if (Number.isNaN(dueMileage) || (dueMileage !== null && dueMileage < 0)) {
      return fail(res, 400, 'BAD_REQUEST', 'Неверный пробег', 'due_mileage');
    }
    if (!done && !due_date && dueMileage === null) {
      return fail(res, 400, 'BAD_REQUEST', 'Укажите дату или пробег, когда нужно обслуживание', 'due_date');
    }

    const { rows } = await pool.query(
      `INSERT INTO service_records (car_id, type, description, comment, status, scheduled_at, due_mileage, created_by)
       VALUES ($1, $2, $3, $3, 'SCHEDULED', $4, $5, $6) RETURNING *`,
      [car.id, type, comment ? String(comment).slice(0, 500) : null, due_date || null, dueMileage, req.user.id]
    );
    let record = rows[0];
    await writeAudit(pool, req.user.id, 'SERVICE_CREATED', 'service_record', record.id, null, record, req.ip);
    if (done) {
      record = await completeService(req, car, record);
      if (record.error) return fail(res, 400, 'BAD_REQUEST', record.error[0], record.error[1]);
    }
    res.status(201).json(record);
  } catch (err) {
    serverError(res, 'Ошибка создания обслуживания:', err);
  }
});

async function completeService(req, car, record) {
  const cost = toInt(req.body.cost) || 0;
  const mileage = toInt(req.body.mileage);
  const day = req.body.date || localToday();
  if (Number.isNaN(cost) || cost < 0) return { error: ['Неверная стоимость', 'cost'] };
  if (Number.isNaN(mileage) || (mileage !== null && mileage < 0)) return { error: ['Неверный пробег', 'mileage'] };
  if (!isDay(day)) return { error: ['Неверная дата', 'date'] };

  const { rows } = await pool.query(
    `UPDATE service_records SET status = 'COMPLETED', completed_at = $1, cost = $2, done_mileage = $3
     WHERE id = $4 RETURNING *`,
    [day, cost, mileage, record.id]
  );
  if (mileage !== null && (car.mileage == null || mileage > Number(car.mileage))) {
    await pool.query('UPDATE cars SET mileage = $1 WHERE id = $2', [mileage, car.id]);
  }
  const txId = await addServiceExpense(pool, req.user, car, record, cost, day);
  await writeAudit(pool, req.user.id, 'SERVICE_COMPLETED', 'service_record', record.id,
    { status: record.status }, { status: 'COMPLETED', cost, mileage, expense_id: txId }, req.ip);
  return { ...rows[0], expense_id: txId };
}

// POST /cars/:id/service/:sid/done — «Сделано»: стоимость сразу уходит в расход «ТО»
router.post('/:id/service/:sid/done', requireRole('ADMIN', 'DISPATCHER'), async (req, res) => {
  try {
    const car = await loadCar(req, res, { write: true });
    if (!car) return;
    const { rows } = await pool.query(
      'SELECT * FROM service_records WHERE id = $1 AND car_id = $2', [parseInt(req.params.sid, 10), car.id]
    );
    if (!rows.length) return fail(res, 404, 'NOT_FOUND', 'Запись обслуживания не найдена');
    if (rows[0].status === 'COMPLETED') return fail(res, 409, 'CONFLICT', 'Уже отмечено как сделанное');
    const record = await completeService(req, car, rows[0]);
    if (record.error) return fail(res, 400, 'BAD_REQUEST', record.error[0], record.error[1]);
    res.json(record);
  } catch (err) {
    serverError(res, 'Ошибка завершения обслуживания:', err);
  }
});

router.delete('/:id/service/:sid', requireRole('ADMIN', 'DISPATCHER'), async (req, res) => {
  try {
    const car = await loadCar(req, res, { write: true });
    if (!car) return;
    const { rows } = await pool.query(
      `DELETE FROM service_records WHERE id = $1 AND car_id = $2 AND status = 'SCHEDULED' RETURNING *`,
      [parseInt(req.params.sid, 10), car.id]
    );
    if (!rows.length) return fail(res, 404, 'NOT_FOUND', 'Можно удалить только запланированное обслуживание');
    await writeAudit(pool, req.user.id, 'SERVICE_DELETED', 'service_record', rows[0].id, rows[0], null, req.ip);
    res.json({ id: rows[0].id, deleted: true });
  } catch (err) {
    serverError(res, 'Ошибка удаления обслуживания:', err);
  }
});

const PHOTO_PATTERN = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/;
const MAX_PHOTO_BYTES = 1_500_000;

// GET /:id/photo — фото машины (кэшируется по ?v=photo_version)
router.get('/:id/photo', async (req, res) => {
  try {
    const car = await loadCar(req, res);
    if (!car) return;
    const { rows } = await pool.query('SELECT mime, data FROM car_photos WHERE car_id = $1', [car.id]);
    if (!rows.length) return fail(res, 404, 'NOT_FOUND', 'Фото нет');
    res.set('Content-Type', rows[0].mime);
    res.set('Cache-Control', 'private, max-age=31536000, immutable');
    res.send(Buffer.from(rows[0].data, 'base64'));
  } catch (err) {
    serverError(res, 'Ошибка получения фото:', err);
  }
});

// PUT /:id/photo — загрузить фото { image: 'data:image/webp;base64,...' }
router.put('/:id/photo', async (req, res) => {
  try {
    const car = await loadCar(req, res, { write: true });
    if (!car) return;
    const match = PHOTO_PATTERN.exec(String(req.body?.image || ''));
    if (!match) return fail(res, 400, 'BAD_REQUEST', 'Нужна картинка JPG, PNG или WEBP', 'image');
    const bytes = Math.floor((match[2].length * 3) / 4);
    if (bytes > MAX_PHOTO_BYTES) return fail(res, 400, 'BAD_REQUEST', 'Фото слишком большое', 'image');

    await pool.query(
      `INSERT INTO car_photos (car_id, mime, data, updated_by, updated_at)
       VALUES ($1, $2, $3, $4, datetime('now'))
       ON CONFLICT (car_id) DO UPDATE SET mime = excluded.mime, data = excluded.data,
         updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
      [car.id, match[1], match[2], req.user.id]
    );
    const { rows } = await pool.query(
      'UPDATE cars SET photo_version = photo_version + 1 WHERE id = $1 RETURNING photo_version',
      [car.id]
    );
    await writeAudit(pool, req.user.id, 'CAR_PHOTO_UPDATED', 'car', car.id, null, { bytes }, req.ip);
    res.json({ photo_version: rows[0].photo_version });
  } catch (err) {
    serverError(res, 'Ошибка загрузки фото:', err);
  }
});

// DELETE /:id/photo — убрать фото
router.delete('/:id/photo', async (req, res) => {
  try {
    const car = await loadCar(req, res, { write: true });
    if (!car) return;
    await pool.query('DELETE FROM car_photos WHERE car_id = $1', [car.id]);
    await pool.query('UPDATE cars SET photo_version = 0 WHERE id = $1', [car.id]);
    await writeAudit(pool, req.user.id, 'CAR_PHOTO_DELETED', 'car', car.id, null, null, req.ip);
    res.json({ photo_version: 0 });
  } catch (err) {
    serverError(res, 'Ошибка удаления фото:', err);
  }
});

export default router;
