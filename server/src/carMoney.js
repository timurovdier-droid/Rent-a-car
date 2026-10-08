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
