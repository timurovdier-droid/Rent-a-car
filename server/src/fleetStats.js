import {
  carScope,
  loadAccrualInputs,
  computeAccruals,
  daysBetween,
  addDays,
  localToday,
} from './carMoney.js';

export async function visibleCars(db, user) {
  const scope = await carScope(db, user);
  const { rows } = await db.query(
    `SELECT c.id, c.plate, c.brand, c.model, c.year, c.color, c.status, c.branch_id, c.owner_id,
            c.daily_rate, c.mileage, c.insurance_expires, c.inspection_expires, c.photo_version,
            o.name AS owner_name, b.name AS branch_name,
            (SELECT u.full_name FROM car_assignments ca
               JOIN drivers d ON d.id = ca.driver_id JOIN users u ON u.id = d.user_id
             WHERE ca.car_id = c.id AND ca.end_at IS NULL LIMIT 1) AS driver_name
     FROM cars c
     LEFT JOIN owners o ON o.id = c.owner_id
     LEFT JOIN branches b ON b.id = c.branch_id
     WHERE c.archived_at IS NULL ${scope.sql}
     ORDER BY c.plate`,
    scope.params
  );
  return rows;
}

function idList(ids, offset = 0) {
  return ids.map((_, i) => `$${i + 1 + offset}`).join(', ');
}

// Деньги по каждой машине: за период и за всё время (для долга).
export async function carMoney(db, cars, { from, to }) {
  const ids = cars.map((c) => Number(c.id));
  const result = new Map(ids.map((id) => [id, {
    accrued: 0, income: 0, expenses: 0, pending_income: 0, pending_expenses: 0, pending_count: 0,
    accrued_all: 0, received_all: 0, debt: 0,
  }]));
  if (!ids.length) return result;

  const inputs = await loadAccrualInputs(db, ids);
  const period = computeAccruals(inputs, { from, to });
  const all = computeAccruals(inputs);

  const { rows } = await db.query(
    `SELECT car_id, kind, status, COUNT(*) AS cnt, COALESCE(SUM(amount), 0) AS total,
            COALESCE(SUM(CASE WHEN tx_date >= $1 AND tx_date <= $2 THEN amount ELSE 0 END), 0) AS period_total
     FROM car_transactions WHERE car_id IN (${idList(ids, 2)})
     GROUP BY car_id, kind, status`,
    [from, to, ...ids]
  );
  for (const row of rows) {
    const m = result.get(Number(row.car_id));
    if (!m) continue;
    if (row.status === 'CONFIRMED') {
      if (row.kind === 'INCOME') {
        m.income += Number(row.period_total);
        m.received_all += Number(row.total);
      } else {
        m.expenses += Number(row.period_total);
      }
    } else {
      m.pending_count += Number(row.cnt);
      if (row.kind === 'INCOME') m.pending_income += Number(row.total);
      else m.pending_expenses += Number(row.total);
    }
  }
  for (const id of ids) {
    const m = result.get(id);
    m.accrued = period.get(id)?.total || 0;
    m.accrued_all = all.get(id)?.total || 0;
    m.debt = Math.max(m.accrued_all - m.received_all, 0);
    m.profit = m.income - m.expenses;
  }
  return result;
}

// Подтверждённые доходы и расходы по дням.
export async function dailySeries(db, carIds, from, to, { createdBy = null } = {}) {
  const days = daysBetween(from, to);
  const map = new Map(days.map((day) => [day, { day, income: 0, expense: 0 }]));
  if (!carIds.length) return days.map((d) => map.get(d));
  const params = [from, to, ...carIds];
  let sql = `
    SELECT tx_date AS day, kind, COALESCE(SUM(amount), 0) AS total
    FROM car_transactions
    WHERE status = 'CONFIRMED' AND tx_date >= $1 AND tx_date <= $2
      AND car_id IN (${idList(carIds, 2)})`;
  if (createdBy) {
    params.push(createdBy);
    sql += ` AND created_by = $${params.length}`;
  }
  sql += ' GROUP BY tx_date, kind';
  const { rows } = await db.query(sql, params);
  for (const row of rows) {
    const point = map.get(row.day);
    if (!point) continue;
    if (row.kind === 'INCOME') point.income += Number(row.total);
    else point.expense += Number(row.total);
  }
  return days.map((d) => map.get(d));
}

export async function expensesByCategory(db, carIds, from, to) {
  if (!carIds.length) return [];
  const { rows } = await db.query(
    `SELECT category, COALESCE(SUM(amount), 0) AS total, COUNT(*) AS cnt
     FROM car_transactions
     WHERE kind = 'EXPENSE' AND status = 'CONFIRMED' AND tx_date >= $1 AND tx_date <= $2
       AND car_id IN (${idList(carIds, 2)})
     GROUP BY category ORDER BY total DESC`,
    [from, to, ...carIds]
  );
  return rows.map((r) => ({ category: r.category, total: Number(r.total), count: Number(r.cnt) }));
}

export function monthStart(day = localToday()) {
  return `${day.slice(0, 7)}-01`;
}

export function readPeriod(query, fallbackFrom) {
  const today = localToday();
  const ok = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
  let from = ok(query.from) ? query.from : fallbackFrom || monthStart(today);
  let to = ok(query.to) ? query.to : today;
  if (from > to) [from, to] = [to, from];
  if (from < addDays(to, -1100)) from = addDays(to, -1100);
  return { from, to };
}
