// Учёт денег по машинам: начисление ставки по дням, долг, напоминания.
// Все «дни» — местные даты Ташкента (UTC+5) в формате YYYY-MM-DD.

const TZ_OFFSET_MS = 5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export const INCOME_CATEGORIES = ['RENT', 'DEPOSIT', 'OTHER_INCOME'];
export const EXPENSE_CATEGORIES = ['FUEL', 'REPAIR', 'SERVICE', 'FINES', 'WASH', 'INSURANCE', 'OTHER'];
export const PAY_METHODS = ['CASH', 'CARD', 'TRANSFER', 'CLICK', 'PAYME', 'UZUM'];

function parseTimestamp(ts) {
  if (!ts) return null;
  const text = String(ts);
  const iso = /[zZ]|[+-]\d\d:?\d\d$/.test(text) ? text : `${text.replace(' ', 'T')}Z`;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function localDay(ts) {
  const date = ts ? parseTimestamp(ts) : new Date();
  if (!date) return null;
  return new Date(date.getTime() + TZ_OFFSET_MS).toISOString().slice(0, 10);
}

export function localToday() {
  return localDay(null);
}

export function isDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function addDays(day, n) {
  const date = new Date(`${day}T00:00:00Z`);
  return new Date(date.getTime() + n * DAY_MS).toISOString().slice(0, 10);
}

// Начало местного дня в UTC, в формате, который хранит SQLite.
export function dayStartUtc(day) {
  const date = new Date(new Date(`${day}T00:00:00Z`).getTime() - TZ_OFFSET_MS);
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

export function daysBetween(from, to) {
  const out = [];
  if (!from || !to || from > to) return out;
  for (let day = from; day <= to; day = addDays(day, 1)) out.push(day);
  return out;
}

function placeholders(list, offset = 0) {
  return list.map((_, i) => `$${i + 1 + offset}`).join(', ');
}

export async function loadAccrualInputs(db, carIds) {
  const ids = [...new Set(carIds.map(Number))].filter(Boolean);
  if (!ids.length) return { ids, assignments: [], rates: [], daysOff: [] };
  const list = placeholders(ids);
  const { rows: assignments } = await db.query(
    `SELECT car_id, start_at, end_at FROM car_assignments WHERE car_id IN (${list})`,
    ids
  );
  const { rows: rates } = await db.query(
    `SELECT car_id, rate, valid_from, id FROM car_rate_history WHERE car_id IN (${list})
     ORDER BY valid_from ASC, id ASC`,
    ids
  );
  const { rows: daysOff } = await db.query(
    `SELECT car_id, day FROM car_days_off WHERE car_id IN (${list})`,
    ids
  );
  return { ids, assignments, rates, daysOff };
}

// Возвращает Map(carId → { total, days: [{ day, rate }] }).
export function computeAccruals(inputs, { from = null, to = null } = {}) {
  const today = localToday();
  const upper = to && to < today ? to : today;
  const result = new Map();

  const byCar = (rows) => {
    const map = new Map();
    for (const row of rows) {
      const id = Number(row.car_id);
      if (!map.has(id)) map.set(id, []);
      map.get(id).push(row);
    }
    return map;
  };
  const assignments = byCar(inputs.assignments);
  const rates = byCar(inputs.rates);
  const off = byCar(inputs.daysOff);

  for (const carId of inputs.ids) {
    const days = new Set();
    for (const a of assignments.get(carId) || []) {
      let start = localDay(a.start_at);
      let end = a.end_at ? localDay(a.end_at) : today;
      if (!start) continue;
      if (from && start < from) start = from;
      if (end > upper) end = upper;
      for (const day of daysBetween(start, end)) days.add(day);
    }
    for (const row of off.get(carId) || []) days.delete(row.day);

    const carRates = rates.get(carId) || [];
    const sorted = [...days].sort();
    let total = 0;
    const detail = [];
    let r = -1;
    for (const day of sorted) {
      while (r + 1 < carRates.length && carRates[r + 1].valid_from <= day) r += 1;
      const rate = r >= 0 ? Number(carRates[r].rate) : 0;
      total += rate;
      detail.push({ day, rate });
    }
    result.set(carId, { total, days: detail });
  }
  return result;
}

// Таблица по дням для одной машины: кто ездил, начислено, наличные, перевод, долг за день.
// Депозит в оплаты аренды не входит. driverId — оставить только дни этого водителя.
export async function carDailyLedger(db, carId, from, to, { driverId = null } = {}) {
  const id = Number(carId);
  const today = localToday();
  const upper = to > today ? today : to;
  const inputs = await loadAccrualInputs(db, [id]);
  const accrual = computeAccruals(inputs, { from, to: upper }).get(id) || { days: [] };
  const rateByDay = new Map(accrual.days.map((d) => [d.day, d.rate]));
  const offDays = new Set(inputs.daysOff.map((r) => r.day));

  const { rows: assigns } = await db.query(
    `SELECT ca.driver_id, ca.start_at, ca.end_at, u.full_name AS driver_name
     FROM car_assignments ca
     LEFT JOIN drivers d ON d.id = ca.driver_id
     LEFT JOIN users u ON u.id = d.user_id
     WHERE ca.car_id = $1
     ORDER BY ca.start_at ASC, ca.id ASC`,
    [id]
  );
  const spans = assigns
    .map((a) => ({
      driver_id: Number(a.driver_id),
      driver_name: a.driver_name || 'Удалённый водитель',
      from: localDay(a.start_at),
      to: a.end_at ? localDay(a.end_at) : today,
    }))
    .filter((s) => s.from);
  // В день передачи машины день считается за того, кто её взял.
  const driverOn = (day) => {
    let hit = null;
    for (const s of spans) if (s.from <= day && day <= s.to) hit = s;
    return hit;
  };

  const { rows: tx } = await db.query(
    `SELECT tx_date, method, status, COALESCE(SUM(amount), 0) AS total
     FROM car_transactions
     WHERE car_id = $1 AND kind = 'INCOME' AND category <> 'DEPOSIT' AND tx_date >= $2 AND tx_date <= $3
     GROUP BY tx_date, method, status`,
    [id, from, upper]
  );
  const pay = new Map();
  for (const row of tx) {
    const day = String(row.tx_date).slice(0, 10);
    if (!pay.has(day)) pay.set(day, { cash: 0, transfer: 0, pending: 0 });
    const slot = pay.get(day);
    const amount = Number(row.total);
    if (row.status !== 'CONFIRMED') slot.pending += amount;
    else if (row.method === 'CASH') slot.cash += amount;
    else slot.transfer += amount;
  }

  const rows = [];
  for (const day of daysBetween(from, upper)) {
    const driver = driverOn(day);
    if (driverId && (!driver || driver.driver_id !== Number(driverId))) continue;
    const accrued = rateByDay.get(day) || 0;
    const { cash = 0, transfer = 0, pending = 0 } = pay.get(day) || {};
    const paid = cash + transfer;
    rows.push({
      day,
      driver_id: driver?.driver_id ?? null,
      driver_name: driver?.driver_name ?? null,
      day_off: offDays.has(day),
      accrued,
      cash,
      transfer,
      paid,
      pending,
      debt: Math.max(accrued - paid, 0),
    });
  }

  return { from, to: upper, rows, totals: ledgerTotals(rows) };
}

export function ledgerTotals(rows) {
  const sum = (key) => rows.reduce((s, r) => s + r[key], 0);
  const balance = sum('accrued') - sum('paid');
  return {
    accrued: sum('accrued'),
    cash: sum('cash'),
    transfer: sum('transfer'),
    paid: sum('paid'),
    pending: sum('pending'),
    // Платёж за несколько дней сразу гасит долг прошлых дней, поэтому итог — разница, а не сумма по строкам.
    debt: Math.max(balance, 0),
    overpaid: Math.max(-balance, 0),
    debt_days: rows.filter((r) => r.debt > 0).length,
    balance,
  };
}

// Насколько закрыта аренда у водителя: деньги гасят самые старые дни первыми.
export async function rentStatus(db, driverId) {
  const id = Number(driverId);
  const today = localToday();
  const { rows: first } = await db.query(
    'SELECT MIN(start_at) AS start_at FROM car_assignments WHERE driver_id = $1',
    [id]
  );
  const firstDay = localDay(first[0]?.start_at);
  if (!firstDay) return null;

  const rows = await driverLedgerRows(db, [id], firstDay, today);
  const byDay = new Map();
  for (const r of rows) {
    const d = byDay.get(r.day) || { day: r.day, accrued: 0, paid: 0, pending: 0, day_off: true, plates: [] };
    d.accrued += r.accrued;
    d.paid += r.paid;
    d.pending += r.pending;
    d.day_off = d.day_off && r.day_off;
    if (r.plate && !d.plates.includes(r.plate)) d.plates.push(r.plate);
    byDay.set(r.day, d);
  }
  const days = [...byDay.values()].sort((a, b) => (a.day < b.day ? -1 : 1));

  const totalAccrued = days.reduce((s, d) => s + d.accrued, 0);
  const totalPaid = days.reduce((s, d) => s + d.paid, 0);
  const pending = days.reduce((s, d) => s + d.pending, 0);
  let pool = totalPaid;
  let paidThrough = null;
  let debtFrom = null;
  let debtDays = 0;
  for (const d of days) {
    if (!d.accrued) {
      d.status = d.day_off ? 'off' : 'none';
      d.covered = 0;
      d.left = 0;
      continue;
    }
    const cover = Math.min(pool, d.accrued);
    pool -= cover;
    d.covered = cover;
    d.left = d.accrued - cover;
    if (d.left === 0) {
      d.status = 'paid';
      if (!debtFrom) paidThrough = d.day;
    } else {
      d.status = cover > 0 ? 'part' : 'unpaid';
      if (!debtFrom) debtFrom = d.day;
      debtDays += 1;
    }
  }

  const { rows: current } = await db.query(
    `SELECT ca.car_id, c.plate, c.brand, c.model,
            (SELECT rate FROM car_rate_history r WHERE r.car_id = ca.car_id AND r.valid_from <= $2
             ORDER BY r.valid_from DESC, r.id DESC LIMIT 1) AS rate
     FROM car_assignments ca JOIN cars c ON c.id = ca.car_id
     WHERE ca.driver_id = $1 AND ca.end_at IS NULL
     ORDER BY ca.start_at DESC LIMIT 1`,
    [id, today]
  );
  const car = current[0] || null;
  const rate = car?.rate ? Number(car.rate) : 0;
  const aheadDays = pool > 0 && rate > 0 ? Math.floor(pool / rate) : 0;

  return {
    today,
    first_day: firstDay,
    car: car ? { id: Number(car.car_id), plate: car.plate, brand: car.brand, model: car.model } : null,
    rate,
    accrued: totalAccrued,
    paid: totalPaid,
    pending,
    debt: Math.max(totalAccrued - totalPaid, 0),
    overpaid: pool,
    debt_days: debtDays,
    paid_through: paidThrough,
    debt_from: debtFrom,
    ahead_until: aheadDays ? addDays(today, aheadDays) : null,
    days: days.map(({ day, accrued, paid, pending: wait, covered, left, status, plates }) => ({
      day, accrued, paid, pending: wait, covered, left, status, plates,
    })),
  };
}

// Строки по дням для водителей: по всем машинам, на которых они ездили в периоде.
export async function driverLedgerRows(db, driverIds, from, to) {
  const ids = [...new Set(driverIds.map(Number))].filter(Boolean);
  if (!ids.length) return [];
  const today = localToday();
  const { rows: assigns } = await db.query(
    `SELECT ca.car_id, ca.start_at, ca.end_at, c.plate, c.brand, c.model
     FROM car_assignments ca JOIN cars c ON c.id = ca.car_id
     WHERE ca.driver_id IN (${placeholders(ids)})`,
    ids
  );
  const cars = new Map();
  for (const a of assigns) {
    const start = localDay(a.start_at);
    const end = a.end_at ? localDay(a.end_at) : today;
    if (!start || start > to || end < from) continue;
    cars.set(Number(a.car_id), { plate: a.plate, brand: a.brand, model: a.model });
  }
  const wanted = new Set(ids);
  const out = [];
  for (const [carId, car] of cars) {
    const ledger = await carDailyLedger(db, carId, from, to);
    for (const row of ledger.rows) {
      if (row.driver_id && wanted.has(row.driver_id)) out.push({ ...row, car_id: carId, ...car });
    }
  }
  out.sort((a, b) => (a.day === b.day ? String(a.plate).localeCompare(String(b.plate)) : a.day < b.day ? -1 : 1));
  return out;
}

let reminderCache = null;

export async function getReminderSettings(db) {
  if (reminderCache && reminderCache.exp > Date.now()) return reminderCache.value;
  const { rows } = await db.query(
    "SELECT key, value FROM settings WHERE key IN ('remind_days', 'remind_km')"
  );
  const value = { days: 7, km: 1000 };
  for (const row of rows) {
    if (row.key === 'remind_days') value.days = Number(row.value) || 0;
    if (row.key === 'remind_km') value.km = Number(row.value) || 0;
  }
  reminderCache = { value, exp: Date.now() + 60000 };
  return value;
}

export function forgetReminderSettings() {
  reminderCache = null;
}

// 'OVERDUE' — срок прошёл, 'SOON' — в окне напоминания, null — рано.
export function serviceDue(record, carMileage, reminders, today = localToday()) {
  if (record.status !== 'SCHEDULED') return null;
  let state = null;
  if (record.scheduled_at) {
    const due = String(record.scheduled_at).slice(0, 10);
    if (due < today) state = 'OVERDUE';
    else if (due <= addDays(today, reminders.days)) state = 'SOON';
  }
  if (record.due_mileage != null && carMileage != null) {
    const left = Number(record.due_mileage) - Number(carMileage);
    if (left <= 0) state = 'OVERDUE';
    else if (left <= reminders.km && state !== 'OVERDUE') state = 'SOON';
  }
  return state;
}

export function documentDue(dateValue, reminders, today = localToday()) {
  if (!dateValue) return null;
  const due = String(dateValue).slice(0, 10);
  if (due < today) return 'OVERDUE';
  if (due <= addDays(today, reminders.days)) return 'SOON';
  return null;
}

export async function ownerIdForUser(db, userId) {
  const { rows } = await db.query('SELECT id FROM owners WHERE user_id = $1', [userId]);
  return rows.length ? Number(rows[0].id) : null;
}

// Машины, которые видит пользователь: SQL-условие для алиаса c.
// Филиалы скрыты из интерфейса, но часть запросов соединяет машины с branches,
// поэтому новым записям ставим первый действующий филиал (или создаём «Основной»).
export async function defaultBranchId(db) {
  const { rows } = await db.query('SELECT id FROM branches WHERE archived_at IS NULL ORDER BY id LIMIT 1');
  if (rows.length) return Number(rows[0].id);
  const created = await db.query(`INSERT INTO branches (name) VALUES ('Основной') RETURNING id`);
  return Number(created.rows[0].id);
}

export async function carScope(db, user, alias = 'c', offset = 0) {
  if (user.role === 'ADMIN') return { sql: '', params: [] };
  if (user.role === 'DISPATCHER') {
    if (!user.branch_id) return { sql: '', params: [] };
    return { sql: ` AND ${alias}.branch_id = $${offset + 1}`, params: [user.branch_id] };
  }
  if (user.role === 'OWNER') {
    const ownerId = await ownerIdForUser(db, user.id);
    return { sql: ` AND ${alias}.owner_id = $${offset + 1}`, params: [ownerId ?? -1] };
  }
  return { sql: ' AND 1 = 0', params: [] };
}
