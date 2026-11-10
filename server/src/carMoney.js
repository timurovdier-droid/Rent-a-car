// Учёт денег по машинам: начисление ставки по дням, долг, напоминания.
// Все «дни» — местные даты Ташкента (UTC+5) в формате YYYY-MM-DD.

const TZ_OFFSET_MS = 5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export const INCOME_CATEGORIES = ['RENT', 'DEPOSIT', 'OTHER_INCOME'];
export const EXPENSE_CATEGORIES = ['FUEL', 'REPAIR', 'SERVICE', 'FINES', 'WASH', 'INSURANCE', 'OTHER'];
// TRANSFER, CLICK, PAYME, UZUM — старые способы: новые записи ими не создаются, но старые можно править.
export const PAY_METHODS = ['CASH', 'CARD', 'BALANCE', 'TRANSFER', 'CLICK', 'PAYME', 'UZUM', 'DEPOSIT'];

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

export function dayDiff(from, to) {
  if (!isDay(from) || !isDay(to)) return 0;
  const a = new Date(`${from}T00:00:00Z`).getTime();
  const b = new Date(`${to}T00:00:00Z`).getTime();
  return Math.round((b - a) / DAY_MS);
}

// Если дату выдачи сдвинули, «платит с» двигается на тот же интервал; иначе остаётся «лишний» период без начисления.
export function shiftPayFromOnStartChange(payFrom, oldStart, newStart) {
  if (!payFrom || !isDay(payFrom)) return null;
  if (!isDay(oldStart) || !isDay(newStart) || oldStart === newStart) {
    return payFrom > newStart ? payFrom : null;
  }
  const shifted = addDays(payFrom, dayDiff(oldStart, newStart));
  if (!isDay(shifted) || shifted <= newStart) return null;
  return shifted;
}

// Ставка должна действовать с первого дня выдачи, иначе долг «начинается» позже в календаре.
export async function ensureCarRateFrom(db, carId, day, userId) {
  if (!isDay(day)) return;
  // Берём первую ПОЛОЖИТЕЛЬНУЮ ставку — нулевые «заглушки» с 2000-01-01 не считаются.
  const { rows } = await db.query(
    `SELECT id, rate, valid_from FROM car_rate_history
     WHERE car_id = $1 AND rate > 0
     ORDER BY substr(valid_from, 1, 10) ASC, id ASC LIMIT 1`,
    [carId]
  );
  const first = rows[0];
  if (!first) return;
  const from = String(first.valid_from).slice(0, 10);
  if (!isDay(from) || from <= day) return;
  await db.query(
    'UPDATE car_rate_history SET valid_from = $1 WHERE id = $2',
    [day, first.id]
  );
}

function minDay(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  return a < b ? a : b;
}

// Первый день аренды машины: по отчётам за день и по старым выдачам.
export async function carFirstDay(db, carId) {
  const { rows } = await db.query(
    `SELECT (SELECT MIN(start_at) FROM car_assignments WHERE car_id = $1) AS start_at,
            (SELECT MIN(day) FROM car_day_reports WHERE car_id = $1) AS day`,
    [Number(carId)]
  );
  return minDay(localDay(rows[0]?.start_at), rows[0]?.day || null);
}

export async function driverFirstDay(db, driverId) {
  const { rows } = await db.query(
    `SELECT (SELECT MIN(start_at) FROM car_assignments WHERE driver_id = $1) AS start_at,
            (SELECT MIN(day) FROM car_day_reports WHERE driver_id = $1) AS day`,
    [Number(driverId)]
  );
  return minDay(localDay(rows[0]?.start_at), rows[0]?.day || null);
}

// Ставка должна действовать с первого дня аренды — иначе в отчёте «дыра» (долг с 9-го при выдаче с 1-го).
export async function syncCarRateToAssignments(db, carId, userId = null) {
  const id = Number(carId);
  if (!id) return;
  const start = await carFirstDay(db, id);
  if (start) await ensureCarRateFrom(db, id, start, userId);
}

// Кто ездил на машинах по дням: отчёт за день важнее старой выдачи, в день передачи — тот, кто взял.
export async function loadCarDrivers(db, carIds) {
  const ids = [...new Set(carIds.map(Number))].filter(Boolean);
  const spans = new Map();
  const reports = new Map();
  if (ids.length) {
    const today = localToday();
    const list = placeholders(ids);
    const { rows: assigns } = await db.query(
      `SELECT ca.car_id, ca.driver_id, ca.start_at, ca.end_at, u.full_name AS driver_name
       FROM car_assignments ca
       LEFT JOIN drivers d ON d.id = ca.driver_id
       LEFT JOIN users u ON u.id = d.user_id
       WHERE ca.car_id IN (${list})
       ORDER BY ca.start_at ASC, ca.id ASC`,
      ids
    );
    for (const a of assigns) {
      const from = localDay(a.start_at);
      if (!from) continue;
      const carId = Number(a.car_id);
      if (!spans.has(carId)) spans.set(carId, []);
      spans.get(carId).push({
        driver_id: Number(a.driver_id),
        driver_name: a.driver_name || 'Удалённый водитель',
        from,
        to: a.end_at ? localDay(a.end_at) : today,
        reported: false,
      });
    }
    const { rows: days } = await db.query(
      `SELECT r.car_id, r.day, r.driver_id, u.full_name AS driver_name
       FROM car_day_reports r
       LEFT JOIN drivers d ON d.id = r.driver_id
       LEFT JOIN users u ON u.id = d.user_id
       WHERE r.car_id IN (${list})`,
      ids
    );
    for (const r of days) {
      reports.set(`${Number(r.car_id)}|${r.day}`, {
        driver_id: Number(r.driver_id),
        driver_name: r.driver_name || 'Удалённый водитель',
        reported: true,
      });
    }
  }
  return (carId, day) => {
    const report = reports.get(`${Number(carId)}|${day}`);
    if (report) return report;
    let hit = null;
    for (const s of spans.get(Number(carId)) || []) if (s.from <= day && day <= s.to) hit = s;
    return hit;
  };
}

export async function driverOnCarDay(db, carId, day) {
  const driverOn = await loadCarDrivers(db, [carId]);
  return driverOn(carId, day);
}

// Машины, на которых водители ездили в периоде (по отчётам и старым выдачам).
export async function driverCarIds(db, driverIds, { from = null, to = null } = {}) {
  const ids = [...new Set(driverIds.map(Number))].filter(Boolean);
  if (!ids.length) return [];
  const today = localToday();
  const lo = from || '0000-01-01';
  const hi = to || '9999-12-31';
  const list = placeholders(ids);
  const out = new Set();
  const { rows: assigns } = await db.query(
    `SELECT car_id, start_at, end_at FROM car_assignments WHERE driver_id IN (${list})`,
    ids
  );
  for (const a of assigns) {
    const start = localDay(a.start_at);
    const end = a.end_at ? localDay(a.end_at) : today;
    if (start && start <= hi && end >= lo) out.add(Number(a.car_id));
  }
  const { rows: reports } = await db.query(
    `SELECT DISTINCT car_id FROM car_day_reports
     WHERE driver_id IN (${list}) AND day >= $${ids.length + 1} AND day <= $${ids.length + 2}`,
    [...ids, lo, hi]
  );
  for (const r of reports) out.add(Number(r.car_id));
  return [...out];
}

// Машина, на которой водитель ездил последней, и с какого дня он вообще на ней ездил.
export async function lastCarOfDriver(db, driverId) {
  const id = Number(driverId);
  const today = localToday();
  const { rows: reports } = await db.query(
    'SELECT car_id, day FROM car_day_reports WHERE driver_id = $1 ORDER BY day DESC, id DESC LIMIT 1',
    [id]
  );
  const { rows: assigns } = await db.query(
    'SELECT car_id, start_at, end_at FROM car_assignments WHERE driver_id = $1',
    [id]
  );
  let best = reports[0] ? { car_id: Number(reports[0].car_id), day: reports[0].day } : null;
  for (const a of assigns) {
    const day = a.end_at ? localDay(a.end_at) : today;
    if (day && (!best || day > best.day)) best = { car_id: Number(a.car_id), day };
  }
  if (!best) return null;
  const { rows } = await db.query(
    `SELECT (SELECT MIN(start_at) FROM car_assignments WHERE driver_id = $1 AND car_id = $2) AS start_at,
            (SELECT MIN(day) FROM car_day_reports WHERE driver_id = $1 AND car_id = $2) AS day`,
    [id, best.car_id]
  );
  return { car_id: best.car_id, last_day: best.day, since: minDay(localDay(rows[0]?.start_at), rows[0]?.day || null) };
}

// «В аренде» — если за вчера или сегодня есть отчёт с водителем. Привязки водителя к машине больше нет.
const RECENT_DAY_SQL = "date('now', '+5 hours', '-1 day')";

export function carStatusSql(alias = 'c') {
  return `CASE WHEN EXISTS (SELECT 1 FROM car_day_reports rs WHERE rs.car_id = ${alias}.id AND rs.day >= ${RECENT_DAY_SQL})
    THEN 'RENTED' ELSE 'FREE' END`;
}

export function carDriverNameSql(alias = 'c') {
  return `(SELECT ru.full_name FROM car_day_reports rd
    JOIN drivers rdd ON rdd.id = rd.driver_id JOIN users ru ON ru.id = rdd.user_id
    WHERE rd.car_id = ${alias}.id AND rd.day >= ${RECENT_DAY_SQL}
    ORDER BY rd.day DESC, rd.id DESC LIMIT 1)`;
}

export function driverCarSql(alias = 'd', column = 'plate') {
  return `(SELECT rc.${column} FROM car_day_reports rr JOIN cars rc ON rc.id = rr.car_id
    WHERE rr.driver_id = ${alias}.id AND rr.day >= ${RECENT_DAY_SQL}
    ORDER BY rr.day DESC, rr.id DESC LIMIT 1)`;
}

async function rateOnOrBefore(db, carId, day) {
  const { rows } = await db.query(
    `SELECT rate, valid_from FROM car_rate_history
     WHERE car_id = $1 AND substr(valid_from, 1, 10) <= $2
     ORDER BY substr(valid_from, 1, 10) DESC, id DESC LIMIT 1`,
    [carId, day]
  );
  return rows[0] ? Number(rows[0].rate) : 0;
}

async function rateBeforeDay(db, carId, day) {
  const { rows } = await db.query(
    `SELECT rate FROM car_rate_history
     WHERE car_id = $1 AND substr(valid_from, 1, 10) < $2
     ORDER BY substr(valid_from, 1, 10) DESC, id DESC LIMIT 1`,
    [carId, day]
  );
  return rows[0] ? Number(rows[0].rate) : 0;
}

// onlyDay=true: ставка только на один день, со следующего дня прежняя цена.
// validTo: ставка на период validFrom..validTo, со следующего дня — цена, что была там до изменения.
// Без onlyDay и validTo ставка действует с validFrom и дальше: более поздние изменения ставки заменяются.
export async function applyCarRate(db, carId, rate, validFrom, { onlyDay = false, validTo = null, userId = null } = {}) {
  const amount = Number(rate) || 0;
  if (validTo && !onlyDay) {
    const nextDay = addDays(validTo, 1);
    const after = await rateOnOrBefore(db, carId, nextDay);
    await db.query(
      `DELETE FROM car_rate_history
       WHERE car_id = $1 AND substr(valid_from, 1, 10) >= $2 AND substr(valid_from, 1, 10) <= $3`,
      [carId, validFrom, nextDay]
    );
    await db.query(
      'INSERT INTO car_rate_history (car_id, rate, valid_from, created_by) VALUES ($1, $2, $3, $4)',
      [carId, amount, validFrom, userId]
    );
    if (after !== amount) {
      await db.query(
        'INSERT INTO car_rate_history (car_id, rate, valid_from, created_by) VALUES ($1, $2, $3, $4)',
        [carId, after, nextDay, userId]
      );
    }
  } else if (onlyDay) {
    // База — цена до этого дня (не «текущая на этот день», иначе повторное изменение ломает восстановление).
    const base = await rateBeforeDay(db, carId, validFrom);
    const nextDay = addDays(validFrom, 1);
    // Убираем прошлые однодневные записи на этот день и «возврат» на следующий.
    await db.query(
      `DELETE FROM car_rate_history
       WHERE car_id = $1 AND substr(valid_from, 1, 10) = $2`,
      [carId, validFrom]
    );
    if (isDay(nextDay)) {
      await db.query(
        `DELETE FROM car_rate_history
         WHERE car_id = $1 AND substr(valid_from, 1, 10) = $2
           AND rate = $3`,
        [carId, nextDay, base]
      );
    }
    await db.query(
      'INSERT INTO car_rate_history (car_id, rate, valid_from, created_by) VALUES ($1, $2, $3, $4)',
      [carId, amount, validFrom, userId]
    );
    if (isDay(nextDay) && Number(base) !== amount) {
      await db.query(
        'INSERT INTO car_rate_history (car_id, rate, valid_from, created_by) VALUES ($1, $2, $3, $4)',
        [carId, base, nextDay, userId]
      );
    }
  } else {
    await db.query(
      `DELETE FROM car_rate_history WHERE car_id = $1 AND substr(valid_from, 1, 10) >= $2`,
      [carId, validFrom]
    );
    await db.query(
      'INSERT INTO car_rate_history (car_id, rate, valid_from, created_by) VALUES ($1, $2, $3, $4)',
      [carId, amount, validFrom, userId]
    );
  }
  const today = localToday();
  const current = await rateOnOrBefore(db, carId, today);
  await db.query('UPDATE cars SET daily_rate = $1 WHERE id = $2', [current, carId]);
  return {
    daily_rate: current,
    rate: amount,
    valid_from: validFrom,
    valid_to: onlyDay ? validFrom : validTo || null,
    only_day: Boolean(onlyDay),
    restored_from: onlyDay ? addDays(validFrom, 1) : validTo ? addDays(validTo, 1) : null,
  };
}

function placeholders(list, offset = 0) {
  return list.map((_, i) => `$${i + 1 + offset}`).join(', ');
}

export async function loadAccrualInputs(db, carIds) {
  const ids = [...new Set(carIds.map(Number))].filter(Boolean);
  if (!ids.length) return { ids, assignments: [], reports: [], rates: [], daysOff: [] };
  const list = placeholders(ids);
  // Выдачи удалённых водителей тоже начисляются: отчёт по машине не должен меняться от удаления водителя.
  // handed_over: в тот же день водитель взял другую выдачу — этот день начисляется только по новой.
  const { rows: assignments } = await db.query(
    `SELECT ca.car_id, ca.start_at, ca.end_at, ca.pay_from,
            CASE WHEN ca.end_at IS NOT NULL AND EXISTS (
              SELECT 1 FROM car_assignments n
              WHERE n.driver_id = ca.driver_id AND n.id <> ca.id AND n.start_at >= ca.end_at
                AND date(n.start_at, '+5 hours') = date(ca.end_at, '+5 hours')
            ) THEN 1 ELSE 0 END AS handed_over
     FROM car_assignments ca
     WHERE ca.car_id IN (${list})`,
    ids
  );
  const { rows: rates } = await db.query(
    `SELECT car_id, rate, valid_from, id FROM car_rate_history WHERE car_id IN (${list})
     ORDER BY valid_from ASC, id ASC`,
    ids
  );
  const { rows: daysOff } = await db.query(
    `SELECT car_id, day, reason FROM car_days_off WHERE car_id IN (${list})`,
    ids
  );
  const { rows: reports } = await db.query(
    `SELECT car_id, day FROM car_day_reports WHERE car_id IN (${list})`,
    ids
  );
  return { ids, assignments, reports, rates, daysOff };
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
  const reports = byCar(inputs.reports || []);
  const rates = byCar(inputs.rates);
  const off = byCar(inputs.daysOff);

  for (const carId of inputs.ids) {
    const days = new Set();
    for (const a of assignments.get(carId) || []) {
      let start = localDay(a.start_at);
      let end = a.end_at ? localDay(a.end_at) : today;
      if (!start) continue;
      if (Number(a.handed_over)) end = addDays(end, -1);
      // pay_from — с этого дня водитель платит; дни раньше машина у него, но аренда не начисляется.
      if (a.pay_from && start < a.pay_from) start = a.pay_from;
      if (from && start < from) start = from;
      if (end > upper) end = upper;
      for (const day of daysBetween(start, end)) days.add(day);
    }
    // Отчёт за день: водитель ездил — аренда за этот день начислена, даже если он не платил.
    for (const row of reports.get(carId) || []) {
      if ((!from || row.day >= from) && row.day <= upper) days.add(row.day);
    }
    for (const row of off.get(carId) || []) days.delete(row.day);

    // valid_from иногда приходит с временем — сравниваем только YYYY-MM-DD.
    const carRates = (rates.get(carId) || []).map((row) => ({
      ...row,
      valid_from: String(row.valid_from || '').slice(0, 10),
      rate: Number(row.rate) || 0,
    })).filter((row) => isDay(row.valid_from));
    const sorted = [...days].sort();
    let total = 0;
    const detail = [];
    let r = -1;
    for (const day of sorted) {
      while (r + 1 < carRates.length && carRates[r + 1].valid_from <= day) r += 1;
      // Частый случай: в истории стоит 0 с 2000-01-01, а реальная ставка с 9-го.
      // Пока машина у водителя и «текущая» ставка 0 — берём ближайшую положительную цену.
      let rate = r >= 0 ? carRates[r].rate : 0;
      if (rate <= 0) {
        for (let i = Math.max(r + 1, 0); i < carRates.length; i += 1) {
          if (carRates[i].rate > 0) { rate = carRates[i].rate; break; }
        }
      }
      if (rate <= 0) {
        for (let i = r; i >= 0; i -= 1) {
          if (carRates[i].rate > 0) { rate = carRates[i].rate; break; }
        }
      }
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
  const offDays = new Map(inputs.daysOff.map((r) => [r.day, r.reason || null]));

  const driverOnCar = await loadCarDrivers(db, [id]);
  const driverOn = (day) => driverOnCar(id, day);

  // Оплата идёт тому, кто платил (driver_id в операции), а без него — водителю этого дня.
  const { rows: tx } = await db.query(
    `SELECT t.tx_date, t.method, t.status, t.driver_id, u.full_name AS driver_name,
            COALESCE(SUM(t.amount), 0) AS total
     FROM car_transactions t
     LEFT JOIN drivers d ON d.id = t.driver_id
     LEFT JOIN users u ON u.id = d.user_id
     WHERE t.car_id = $1 AND t.kind = 'INCOME' AND t.category <> 'DEPOSIT' AND t.tx_date >= $2 AND t.tx_date <= $3
     GROUP BY t.tx_date, t.method, t.status, t.driver_id, u.full_name`,
    [id, from, upper]
  );
  const pay = new Map();
  for (const row of tx) {
    const day = String(row.tx_date).slice(0, 10);
    const dayDriver = driverOn(day)?.driver_id ?? null;
    const payer = row.driver_id == null ? dayDriver : Number(row.driver_id);
    if (!pay.has(day)) pay.set(day, new Map());
    const slots = pay.get(day);
    const key = payer ?? 'none';
    if (!slots.has(key)) {
      slots.set(key, { cash: 0, transfer: 0, pending: 0, driver_name: row.driver_name || 'Удалённый водитель' });
    }
    const slot = slots.get(key);
    const amount = Number(row.total);
    if (row.status !== 'CONFIRMED') slot.pending += amount;
    else if (row.method === 'CASH') slot.cash += amount;
    else slot.transfer += amount;
  }

  const makeRow = (day, driver, accrued, { cash = 0, transfer = 0, pending = 0 } = {}, extra = false) => ({
    day,
    driver_id: driver?.driver_id ?? null,
    driver_name: driver?.driver_name ?? null,
    reported: Boolean(driver?.reported),
    extra,
    day_off: offDays.has(day),
    idle: offDays.get(day) || null,
    accrued,
    cash,
    transfer,
    paid: cash + transfer,
    pending,
    debt: Math.max(accrued - cash - transfer, 0),
  });

  const rows = [];
  for (const day of daysBetween(from, upper)) {
    const driver = driverOn(day);
    const own = driver?.driver_id ?? 'none';
    const slots = pay.get(day) || new Map();
    if (!driverId || (driver && driver.driver_id === Number(driverId))) {
      rows.push(makeRow(day, driver, rateByDay.get(day) || 0, slots.get(own)));
    }
    // Другой водитель отдал деньги в этот день: отдельная строка без начисления, деньги гасят его долг.
    for (const [key, slot] of slots) {
      if (key === own || key === 'none') continue;
      if (driverId && key !== Number(driverId)) continue;
      rows.push(makeRow(day, { driver_id: key, driver_name: slot.driver_name, reported: false }, 0, slot, true));
    }
  }

  return { from, to: upper, rows, totals: ledgerTotals(rows) };
}

// Незакрытые дни машины: кто из водителей должен и за какое число. Оплаты гасят дни только своего водителя.
export async function carDebtDays(db, carId) {
  const id = Number(carId);
  const today = localToday();
  const firstDay = await carFirstDay(db, id);
  if (!firstDay) return { debt: 0, pending: 0, days: [] };
  const ledger = await carDailyLedger(db, id, firstDay > today ? today : firstDay, today);
  const days = ledger.rows
    .filter((row) => row.accrued && row.debt > 0)
    .map((row) => ({
      day: row.day, driver_id: row.driver_id, driver_name: row.driver_name,
      accrued: row.accrued, paid: row.paid, left: row.debt,
    }));
  days.reverse();
  return { debt: ledger.totals.debt, pending: ledger.totals.pending, days };
}

function groupByDriver(rows) {
  const groups = new Map();
  for (const r of rows) {
    const key = r.driver_id ?? 'none';
    const list = groups.get(key) || [];
    list.push(r);
    groups.set(key, list);
  }
  return groups;
}

// Если водитель в целом не должен, его недоплаченные дни закрыты его же переплатой. Чужие деньги не трогаем.
function coverFromOverpay(rows) {
  for (const list of groupByDriver(rows).values()) {
    const balance = list.reduce((s, r) => s + r.accrued - r.paid, 0);
    if (balance > 0) continue;
    for (const r of list) {
      if (r.debt > 0) {
        r.from_overpay = r.debt;
        r.debt = 0;
      }
    }
  }
}

function driverMoney(rows) {
  let debt = 0;
  let overpaid = 0;
  for (const list of groupByDriver(rows).values()) {
    const balance = list.reduce((s, r) => s + r.accrued - r.paid, 0);
    if (balance > 0) debt += balance;
    else overpaid += -balance;
  }
  return { debt, overpaid };
}

export function ledgerTotals(rows) {
  coverFromOverpay(rows);
  const sum = (key) => rows.reduce((s, r) => s + r[key], 0);
  const { debt, overpaid } = driverMoney(rows);
  return {
    accrued: sum('accrued'),
    cash: sum('cash'),
    transfer: sum('transfer'),
    paid: sum('paid'),
    pending: sum('pending'),
    // Долг каждого водителя отдельно: переплата предыдущего не гасит долг следующего.
    debt,
    overpaid,
    debt_days: rows.filter((r) => r.debt > 0).length,
    balance: sum('accrued') - sum('paid'),
  };
}

// Сводка календаря водителя по строкам ведомости. carId — не смешивать дни другой машины.
export function driverCalendarFromRows(rows, { carId = null } = {}) {
  const scoped = carId ? rows.filter((r) => Number(r.car_id) === Number(carId)) : rows;
  const byDay = new Map();
  for (const r of scoped) {
    const d = byDay.get(r.day) || { day: r.day, accrued: 0, paid: 0, pending: 0, day_off: true, plates: [] };
    d.accrued += r.accrued;
    d.paid += r.paid;
    d.pending += r.pending;
    d.day_off = d.day_off && r.day_off;
    d.idle = d.idle || r.idle;
    if (r.plate && !d.plates.includes(r.plate)) d.plates.push(r.plate);
    byDay.set(r.day, d);
  }
  const days = [...byDay.values()].sort((a, b) => (a.day < b.day ? -1 : 1));
  return { days, closed: closeCalendarDays(days) };
}

// Насколько закрыта аренда у водителя: все дни из отчётов по любым машинам, на которых он ездил.
export async function rentStatus(db, driverId) {
  const id = Number(driverId);
  const today = localToday();

  const firstDay = await driverFirstDay(db, id);
  if (!firstDay) return null;
  for (const carId of await driverCarIds(db, [id])) await syncCarRateToAssignments(db, carId);
  const rows = await driverLedgerRows(db, [id], firstDay, today);

  const last = await lastCarOfDriver(db, id);
  let car = null;
  if (last) {
    const { rows: cars } = await db.query(
      `SELECT c.id AS car_id, c.plate, c.brand, c.model,
              (SELECT rate FROM car_rate_history r WHERE r.car_id = c.id AND r.valid_from <= $2
               ORDER BY r.valid_from DESC, r.id DESC LIMIT 1) AS rate
       FROM cars c WHERE c.id = $1`,
      [last.car_id, today]
    );
    car = cars[0] || null;
  }

  const { days, closed } = driverCalendarFromRows(rows);
  const rate = car?.rate ? Number(car.rate) : 0;
  const aheadDays = closed.pool > 0 && rate > 0 ? Math.floor(closed.pool / rate) : 0;

  return {
    today,
    first_day: firstDay,
    car: car ? { id: Number(car.car_id), plate: car.plate, brand: car.brand, model: car.model } : null,
    rate,
    ...closed.totals,
    debt_days: closed.debtDays,
    paid_through: closed.paidThrough,
    debt_from: closed.debtFrom,
    ahead_until: aheadDays ? addDays(today, aheadDays) : null,
    days: days.map(({ day, accrued, paid, pending: wait, covered, left, status, plates, idle, day_off }) => ({
      day, accrued, paid, pending: wait, covered, left, status, plates,
      idle: status === 'off' ? idle || null : null,
      day_off: Boolean(day_off),
    })),
  };
}

function closeDriverDays(days) {
  const accrued = days.reduce((s, d) => s + d.accrued, 0);
  const paid = days.reduce((s, d) => s + d.paid, 0);
  const pending = days.reduce((s, d) => s + d.pending, 0);
  const noDebt = paid >= accrued;
  for (const d of days) {
    if (!d.accrued) {
      d.status = d.day_off ? 'off' : 'none';
      d.covered = 0;
      d.left = 0;
      continue;
    }
    const cover = Math.min(d.paid, d.accrued);
    d.covered = cover;
    d.left = d.accrued - cover;
    if (d.left === 0) {
      d.status = 'paid';
    } else if (noDebt) {
      d.status = 'covered';
      d.covered = d.accrued;
      d.left = 0;
    } else {
      d.status = cover > 0 ? 'part' : 'unpaid';
    }
  }
  return {
    accrued,
    paid,
    pending,
    debt: Math.max(accrued - paid, 0),
    overpaid: Math.max(paid - accrued, 0),
  };
}

// Деньги гасят дни только своего водителя: переплата предыдущего не закрывает долг следующего.
export function closeCalendarDays(days) {
  let accrued = 0;
  let paid = 0;
  let pending = 0;
  let debt = 0;
  let overpaid = 0;
  for (const list of groupByDriver(days).values()) {
    const closed = closeDriverDays(list);
    accrued += closed.accrued;
    paid += closed.paid;
    pending += closed.pending;
    debt += closed.debt;
    overpaid += closed.overpaid;
  }
  let paidThrough = null;
  let debtFrom = null;
  let debtDays = 0;
  for (const d of days) {
    if (!d.accrued) continue;
    if (d.status === 'paid' || d.status === 'covered') {
      if (!debtFrom) paidThrough = d.day;
    } else if (d.status === 'part' || d.status === 'unpaid') {
      if (!debtFrom) debtFrom = d.day;
      debtDays += 1;
    }
  }
  return {
    pool: debt > 0 ? 0 : overpaid,
    paidThrough,
    debtFrom,
    debtDays,
    totals: { accrued, paid, pending, debt, overpaid },
  };
}

// Календарь аренды по машине: тот же цвет и сумма, плюс кто из водителей был в этот день.
export async function carRentStatus(db, carId) {
  const id = Number(carId);
  const today = localToday();
  await syncCarRateToAssignments(db, id);
  const firstDay = await carFirstDay(db, id);
  const from = firstDay || today;
  const ledger = await carDailyLedger(db, id, from, today);
  const days = ledger.rows;
  const closed = closeCalendarDays(days);

  const { rows: carRows } = await db.query(
    `SELECT c.plate, c.brand, c.model,
            (SELECT rate FROM car_rate_history r WHERE r.car_id = c.id AND r.valid_from <= $2
             ORDER BY r.valid_from DESC, r.id DESC LIMIT 1) AS rate
     FROM cars c
     WHERE c.id = $1`,
    [id, today]
  );
  const car = carRows[0] || {};
  const rate = car.rate ? Number(car.rate) : 0;
  const aheadDays = closed.pool > 0 && rate > 0 ? Math.floor(closed.pool / rate) : 0;
  const todayRow = days.find((d) => d.day === today);

  return {
    today,
    first_day: from,
    car: { id, plate: car.plate, brand: car.brand, model: car.model },
    driver: todayRow?.driver_id ? { id: Number(todayRow.driver_id), name: todayRow.driver_name } : null,
    rate,
    ...closed.totals,
    debt_days: closed.debtDays,
    paid_through: closed.paidThrough,
    debt_from: closed.debtFrom,
    ahead_until: aheadDays ? addDays(today, aheadDays) : null,
    days: days.map(({ day, accrued, paid, pending: wait, covered, left, status, idle, driver_id, driver_name, reported, extra, day_off }) => ({
      day, accrued, paid, pending: wait, covered, left, status,
      idle: status === 'off' ? idle || null : null,
      day_off: Boolean(day_off),
      driver_id: driver_id || null,
      driver_name: driver_name || null,
      reported: Boolean(reported),
      extra: Boolean(extra),
      plates: car.plate ? [car.plate] : [],
    })),
  };
}

// Строки по дням для водителей: по всем машинам, на которых они ездили в периоде.
export async function driverLedgerRows(db, driverIds, from, to) {
  const ids = [...new Set(driverIds.map(Number))].filter(Boolean);
  if (!ids.length) return [];
  const carIds = await driverCarIds(db, ids, { from, to });
  if (!carIds.length) return [];
  const { rows: carRows } = await db.query(
    `SELECT id, plate, brand, model FROM cars WHERE id IN (${placeholders(carIds)})`,
    carIds
  );
  const cars = new Map(carRows.map((c) => [Number(c.id), { plate: c.plate, brand: c.brand, model: c.model }]));
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
