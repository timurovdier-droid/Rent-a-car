import { Router } from 'express';
import { pool } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { writeAudit } from '../middleware/audit.js';
import { localDay, localToday, isDay, addDays, daysBetween, carDailyLedger, rentStatus } from '../carMoney.js';
import { pushPublicKey, sendPush } from '../push.js';

const router = Router();
router.use(authenticate);

function fail(res, status, code, message, field) {
  return res.status(status).json({ error: { code, message, ...(field ? { field } : {}) } });
}

async function currentCar(driverId) {
  const { rows } = await pool.query(
    `SELECT ca.car_id, ca.start_at
     FROM car_assignments ca
     WHERE ca.driver_id = $1 AND ca.end_at IS NULL
     ORDER BY ca.start_at DESC, ca.id DESC
     LIMIT 1`,
    [driverId]
  );
  return rows[0] || null;
}

// Незакрытые долги водителя помимо аренды: ремонт, штрафы и т. п.
async function openCharges(driverId) {
  const { rows } = await pool.query(
    `SELECT ch.id, ch.kind, ch.amount, ch.day, ch.comment, c.plate,
            COALESCE((SELECT SUM(p.amount) FROM driver_charge_payments p WHERE p.charge_id = ch.id), 0) AS paid
     FROM driver_charges ch LEFT JOIN cars c ON c.id = ch.car_id
     WHERE ch.driver_id = $1 ORDER BY ch.day DESC, ch.id DESC`,
    [driverId]
  );
  return rows
    .map((r) => ({ ...r, paid: Number(r.paid), left: Number(r.amount) - Number(r.paid) }))
    .filter((r) => r.left > 0);
}

// Долг водителя: аренда по текущей машине и незакрытые начисления
export async function driverDebt(driverId) {
  const today = localToday();
  const charges = (await openCharges(driverId)).reduce((s, c) => s + c.left, 0);
  const assignment = await currentCar(driverId);
  let rent = 0;
  if (assignment) {
    const carId = Number(assignment.car_id);
    const { rows: first } = await pool.query(
      'SELECT MIN(start_at) AS start_at FROM car_assignments WHERE car_id = $1 AND driver_id = $2',
      [carId, driverId]
    );
    const firstDay = localDay(first[0]?.start_at || assignment.start_at) || today;
    const overall = await carDailyLedger(pool, carId, firstDay, today, { driverId });
    rent = Number(overall.totals.debt) || 0;
  }
  return { rent, charges, total: rent + charges };
}

function driverOnly(req, res) {
  if (req.user.role !== 'DRIVER' || !req.user.driver_id) {
    fail(res, 403, 'FORBIDDEN', 'Только для водителя');
    return false;
  }
  return true;
}

async function driverProfile(driverId) {
  const { rows } = await pool.query(
    `SELECT u.full_name, u.phone, u.login, d.license_no, d.license_expires, d.passport, d.pinfl, d.deposit
     FROM drivers d JOIN users u ON u.id = d.user_id WHERE d.id = $1`,
    [driverId]
  );
  const p = rows[0];
  return p ? { ...p, deposit: Number(p.deposit || 0) } : null;
}

const DRIVER_PAY_METHODS = ['CASH', 'CARD', 'BALANCE'];

function readAmount(value) {
  const n = Number(String(value ?? '').replace(/\s+/g, ''));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : NaN;
}

async function carOnDay(driverId, day, today) {
  const { rows } = await pool.query(
    'SELECT car_id, start_at, end_at FROM car_assignments WHERE driver_id = $1 ORDER BY start_at DESC, id DESC',
    [driverId]
  );
  const hit = rows.find((a) => {
    const from = localDay(a.start_at);
    const to = a.end_at ? localDay(a.end_at) : today;
    return from && from <= day && day <= to;
  });
  return hit ? Number(hit.car_id) : null;
}

// GET /me/push — ключ для подписки на уведомления
router.get('/push', (req, res) => {
  res.json({ key: pushPublicKey() });
});

// POST /me/push — сохранить подписку браузера на уведомления
router.post('/push', async (req, res) => {
  try {
    const { endpoint, keys } = req.body || {};
    if (!endpoint || !/^https:\/\//.test(endpoint) || !keys?.p256dh || !keys?.auth) {
      return fail(res, 400, 'BAD_REQUEST', 'Неверная подписка');
    }
    const { rows: known } = await pool.query('SELECT id FROM push_subscriptions WHERE endpoint = $1', [endpoint]);
    await pool.query(
      `INSERT INTO push_subscriptions (user_id, driver_id, endpoint, p256dh, auth) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (endpoint) DO UPDATE SET user_id = excluded.user_id, driver_id = excluded.driver_id,
         p256dh = excluded.p256dh, auth = excluded.auth`,
      [req.user.id, req.user.driver_id || null, endpoint, keys.p256dh, keys.auth]
    );
    if (!known.length) {
      await sendPush({ endpoint, p256dh: keys.p256dh, auth: keys.auth }, {
        title: 'Уведомления включены',
        body: 'Будем напоминать о долге по аренде каждые 2 часа, пока он есть.',
        url: '/',
      });
    }
    res.status(201).json({ ok: true, created: !known.length });
  } catch (err) {
    console.error('Ошибка подписки на уведомления:', err);
    fail(res, 500, 'INTERNAL_ERROR', 'Внутренняя ошибка сервера');
  }
});

// DELETE /me/push — отключить уведомления на этом устройстве
router.delete('/push', async (req, res) => {
  try {
    await pool.query('DELETE FROM push_subscriptions WHERE endpoint = $1 AND user_id = $2', [String(req.body?.endpoint || ''), req.user.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('Ошибка отписки от уведомлений:', err);
    fail(res, 500, 'INTERNAL_ERROR', 'Внутренняя ошибка сервера');
  }
});

// GET /me/payments — оплаты, которые водитель отправил сам: ждут проверки, приняты или отклонены
router.get('/payments', async (req, res) => {
  try {
    if (!driverOnly(req, res)) return;
    const { rows } = await pool.query(
      `SELECT r.id, r.amount, r.method, r.day, r.comment, r.status, r.reject_reason, r.created_at, r.decided_at,
              c.plate, u.full_name AS decided_by_name
       FROM driver_payment_requests r
       LEFT JOIN cars c ON c.id = r.car_id
       LEFT JOIN users u ON u.id = r.decided_by
       WHERE r.driver_id = $1 ORDER BY r.id DESC LIMIT 50`,
      [req.user.driver_id]
    );
    res.json(rows);
  } catch (err) {
    console.error('Ошибка списка оплат водителя:', err);
    fail(res, 500, 'INTERNAL_ERROR', 'Внутренняя ошибка сервера');
  }
});

// POST /me/payments — водитель сообщает об оплате; в учёт она попадает после подтверждения диспетчером
router.post('/payments', async (req, res) => {
  try {
    if (!driverOnly(req, res)) return;
    const today = localToday();
    const amount = readAmount(req.body.amount);
    const method = req.body.method || 'CASH';
    const day = req.body.date || today;
    const comment = req.body.comment ? String(req.body.comment).trim().slice(0, 300) : null;
    if (Number.isNaN(amount) || amount > 1e9) return fail(res, 400, 'BAD_REQUEST', 'Укажите сумму', 'amount');
    if (!DRIVER_PAY_METHODS.includes(method)) return fail(res, 400, 'BAD_REQUEST', 'Выберите способ оплаты', 'method');
    if (!isDay(day) || day > today) return fail(res, 400, 'BAD_REQUEST', 'Неверная дата', 'date');
    const carId = await carOnDay(req.user.driver_id, day, today);
    if (!carId) return fail(res, 409, 'CONFLICT', 'В этот день за вами не было машины', 'date');
    const { rows: open } = await pool.query(
      `SELECT COUNT(*) AS n FROM driver_payment_requests WHERE driver_id = $1 AND status = 'PENDING'`,
      [req.user.driver_id]
    );
    if (Number(open[0].n) >= 10) {
      return fail(res, 409, 'CONFLICT', 'Уже 10 оплат ждут проверки. Дождитесь, пока диспетчер их проверит.');
    }
    const { rows } = await pool.query(
      `INSERT INTO driver_payment_requests (driver_id, car_id, amount, method, day, comment)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [req.user.driver_id, carId, amount, method, day, comment]
    );
    await writeAudit(pool, req.user.id, 'DRIVER_PAYMENT_REQUESTED', 'driver', req.user.driver_id, null,
      { request_id: rows[0].id, amount, method, day, car_id: carId }, req.ip);
    res.status(201).json({ id: rows[0].id });
  } catch (err) {
    console.error('Ошибка отправки оплаты водителем:', err);
    fail(res, 500, 'INTERNAL_ERROR', 'Внутренняя ошибка сервера');
  }
});

// DELETE /me/payments/:id — отменить свою оплату, пока её не проверили
router.delete('/payments/:id', async (req, res) => {
  try {
    if (!driverOnly(req, res)) return;
    const { rows } = await pool.query(
      `DELETE FROM driver_payment_requests WHERE id = $1 AND driver_id = $2 AND status = 'PENDING' RETURNING id`,
      [parseInt(req.params.id, 10), req.user.driver_id]
    );
    if (!rows.length) return fail(res, 409, 'CONFLICT', 'Эту оплату уже проверили — отменить нельзя');
    res.json({ id: rows[0].id, deleted: true });
  } catch (err) {
    console.error('Ошибка отмены оплаты водителем:', err);
    fail(res, 500, 'INTERNAL_ERROR', 'Внутренняя ошибка сервера');
  }
});

// GET /me/rent?from&to — машина водителя, его долг за всё время и таблица по дням
router.get('/rent', async (req, res) => {
  try {
    if (!driverOnly(req, res)) return;
    const driverId = req.user.driver_id;
    const today = localToday();
    const assignment = await currentCar(driverId);
    const charges = await openCharges(driverId);
    const profile = await driverProfile(driverId);
    if (!assignment) return res.json({ today, car: null, charges, profile });

    const carId = Number(assignment.car_id);
    const { rows: cars } = await pool.query(
      'SELECT id, plate, brand, model, year, color, photo_version FROM cars WHERE id = $1',
      [carId]
    );
    const { rows: rates } = await pool.query(
      `SELECT rate FROM car_rate_history WHERE car_id = $1 AND valid_from <= $2
       ORDER BY valid_from DESC, id DESC LIMIT 1`,
      [carId, today]
    );
    const { rows: first } = await pool.query(
      'SELECT MIN(start_at) AS start_at FROM car_assignments WHERE car_id = $1 AND driver_id = $2',
      [carId, driverId]
    );
    const firstDay = localDay(first[0]?.start_at || assignment.start_at) || today;

    const to = isDay(req.query.to) && req.query.to <= today ? req.query.to : today;
    const from = isDay(req.query.from) ? req.query.from : addDays(to, -29);
    if (from > to) return fail(res, 400, 'BAD_REQUEST', 'Дата «с» позже даты «по»', 'from');
    if (daysBetween(from, to).length > 366) return fail(res, 400, 'BAD_REQUEST', 'Не больше года за раз', 'from');

    const overall = await carDailyLedger(pool, carId, firstDay, today, { driverId });
    const ledger = await carDailyLedger(pool, carId, from < firstDay ? firstDay : from, to, { driverId });

    res.json({
      today,
      car: cars[0] || null,
      since: localDay(assignment.start_at),
      rate: rates[0] ? Number(rates[0].rate) : 0,
      debt: overall.totals.debt,
      overpaid: overall.totals.overpaid,
      debt_days: overall.totals.debt_days,
      status: await rentStatus(pool, driverId),
      ledger,
      charges,
      profile,
    });
  } catch (err) {
    console.error('Ошибка кабинета водителя:', err);
    fail(res, 500, 'INTERNAL_ERROR', 'Внутренняя ошибка сервера');
  }
});

function readTime(value) {
  if (value == null || value === '') return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(value).trim());
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return undefined;
  return `${m[1].padStart(2, '0')}:${m[2]}`;
}

function readInt(value) {
  const n = Number(String(value ?? '').replace(/\s+/g, ''));
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : NaN;
}

async function lastOdometer(driverId, carId) {
  const { rows } = await pool.query(
    `SELECT MAX(v) AS v FROM (
       SELECT MAX(odometer) AS v FROM driver_mileage WHERE driver_id = $1 AND car_id = $2
       UNION ALL
       SELECT MAX(odometer) AS v FROM driver_expenses WHERE driver_id = $1 AND car_id = $2
     )`,
    [driverId, carId]
  );
  return rows[0]?.v == null ? null : Number(rows[0].v);
}

async function bumpCarMileage(carId, odometer) {
  await pool.query(
    'UPDATE cars SET mileage = $2 WHERE id = $1 AND (mileage IS NULL OR mileage < $2)',
    [carId, odometer]
  );
}

function periodFrom(query, today) {
  const to = isDay(query.to) && query.to <= today ? query.to : today;
  const from = isDay(query.from) ? query.from : `${to.slice(0, 7)}-01`;
  return { from: from > to ? to : from, to };
}

// GET /me/car — всё о машине водителя: документы, пробег, ближайшее ТО
router.get('/car', async (req, res) => {
  try {
    if (!driverOnly(req, res)) return;
    const today = localToday();
    const assignment = await currentCar(req.user.driver_id);
    if (!assignment) return res.json({ car: null });
    const carId = Number(assignment.car_id);
    const { rows: cars } = await pool.query(
      `SELECT id, plate, brand, model, year, color, vin, fuel_type, mileage,
              insurance_expires, inspection_expires, photo_version
       FROM cars WHERE id = $1`,
      [carId]
    );
    const { rows: rates } = await pool.query(
      `SELECT rate FROM car_rate_history WHERE car_id = $1 AND valid_from <= $2
       ORDER BY valid_from DESC, id DESC LIMIT 1`,
      [carId, today]
    );
    const { rows: services } = await pool.query(
      `SELECT id, type, description, scheduled_at, due_mileage FROM service_records
       WHERE car_id = $1 AND status = 'SCHEDULED' ORDER BY COALESCE(scheduled_at, created_at) LIMIT 5`,
      [carId]
    );
    const car = cars[0];
    res.json({
      today,
      car: car ? { ...car, mileage: car.mileage == null ? null : Number(car.mileage) } : null,
      since: localDay(assignment.start_at),
      rate: rates[0] ? Number(rates[0].rate) : 0,
      last_odometer: await lastOdometer(req.user.driver_id, carId),
      services,
    });
  } catch (err) {
    console.error('Ошибка данных машины для водителя:', err);
    fail(res, 500, 'INTERNAL_ERROR', 'Внутренняя ошибка сервера');
  }
});

// GET /me/contacts — телефоны диспетчерской и адреса, которые админ заполнил в настройках
router.get('/contacts', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT key, value FROM settings WHERE key IN ('contacts', 'company_name')`);
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    let contacts = { phones: [], locations: [], note: '' };
    try {
      if (map.contacts) contacts = { ...contacts, ...JSON.parse(map.contacts) };
    } catch {
      // испорченное значение — покажем пустые контакты
    }
    res.json({ company: map.company_name || 'RENT A CAR GTA', ...contacts });
  } catch (err) {
    console.error('Ошибка контактов:', err);
    fail(res, 500, 'INTERNAL_ERROR', 'Внутренняя ошибка сервера');
  }
});

// GET /me/mileage — записи пробега водителя за период (по умолчанию этот месяц)
router.get('/mileage', async (req, res) => {
  try {
    if (!driverOnly(req, res)) return;
    const { from, to } = periodFrom(req.query, localToday());
    const { rows } = await pool.query(
      `SELECT m.id, m.car_id, m.day, m.time, m.odometer, m.income, m.comment, m.created_at, c.plate
       FROM driver_mileage m LEFT JOIN cars c ON c.id = m.car_id
       WHERE m.driver_id = $1 AND m.day >= $2 AND m.day <= $3
       ORDER BY m.day DESC, m.time DESC, m.id DESC`,
      [req.user.driver_id, from, to]
    );
    const assignment = await currentCar(req.user.driver_id);
    const last = assignment ? await lastOdometer(req.user.driver_id, Number(assignment.car_id)) : null;
    res.json({ from, to, last_odometer: last, rows: await withDistance(req.user.driver_id, rows) });
  } catch (err) {
    console.error('Ошибка пробега водителя:', err);
    fail(res, 500, 'INTERNAL_ERROR', 'Внутренняя ошибка сервера');
  }
});

// Сколько проехал с прошлой записи на той же машине
async function withDistance(driverId, rows) {
  const out = [];
  for (const r of rows) {
    const { rows: prev } = await pool.query(
      `SELECT odometer FROM driver_mileage
       WHERE driver_id = $1 AND car_id = $2 AND (day < $3 OR (day = $3 AND id < $4))
       ORDER BY day DESC, id DESC LIMIT 1`,
      [driverId, r.car_id, r.day, r.id]
    );
    const km = prev.length ? Number(r.odometer) - Number(prev[0].odometer) : null;
    out.push({ ...r, odometer: Number(r.odometer), income: Number(r.income || 0), km: km != null && km >= 0 ? km : null });
  }
  return out;
}

// POST /me/mileage — показания одометра: дата, время и комментарий
router.post('/mileage', async (req, res) => {
  try {
    if (!driverOnly(req, res)) return;
    const today = localToday();
    const day = req.body.date || today;
    const time = readTime(req.body.time);
    const odometer = readInt(req.body.odometer);
    const comment = req.body.comment ? String(req.body.comment).trim().slice(0, 300) : null;
    if (!isDay(day) || day > today) return fail(res, 400, 'BAD_REQUEST', 'Неверная дата', 'date');
    if (time === undefined) return fail(res, 400, 'BAD_REQUEST', 'Неверное время', 'time');
    if (Number.isNaN(odometer) || odometer <= 0 || odometer > 5e6) return fail(res, 400, 'BAD_REQUEST', 'Укажите пробег по одометру', 'odometer');
    const carId = await carOnDay(req.user.driver_id, day, today);
    if (!carId) return fail(res, 409, 'CONFLICT', 'В этот день за вами не было машины', 'date');
    const { rows: before } = await pool.query(
      `SELECT MAX(odometer) AS v FROM driver_mileage WHERE driver_id = $1 AND car_id = $2 AND day <= $3`,
      [req.user.driver_id, carId, day]
    );
    if (before[0]?.v != null && odometer < Number(before[0].v)) {
      return fail(res, 400, 'BAD_REQUEST', `Пробег меньше прошлой записи (${Number(before[0].v).toLocaleString('ru-RU')} км)`, 'odometer');
    }
    const { rows } = await pool.query(
      `INSERT INTO driver_mileage (driver_id, car_id, day, time, odometer, comment)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [req.user.driver_id, carId, day, time, odometer, comment]
    );
    await bumpCarMileage(carId, odometer);
    res.status(201).json({ id: rows[0].id });
  } catch (err) {
    console.error('Ошибка записи пробега:', err);
    fail(res, 500, 'INTERNAL_ERROR', 'Внутренняя ошибка сервера');
  }
});

router.delete('/mileage/:id', async (req, res) => {
  try {
    if (!driverOnly(req, res)) return;
    const { rows } = await pool.query(
      'DELETE FROM driver_mileage WHERE id = $1 AND driver_id = $2 RETURNING id',
      [parseInt(req.params.id, 10), req.user.driver_id]
    );
    if (!rows.length) return fail(res, 404, 'NOT_FOUND', 'Запись не найдена');
    res.json({ id: rows[0].id, deleted: true });
  } catch (err) {
    console.error('Ошибка удаления пробега:', err);
    fail(res, 500, 'INTERNAL_ERROR', 'Внутренняя ошибка сервера');
  }
});

const EXPENSE_KINDS = ['FUEL', 'GAS', 'CHARGE', 'WASH', 'LUNCH', 'OTHER'];

// GET /me/expenses — расходы водителя на заправку, зарядку, мойку
router.get('/expenses', async (req, res) => {
  try {
    if (!driverOnly(req, res)) return;
    const { from, to } = periodFrom(req.query, localToday());
    const { rows } = await pool.query(
      `SELECT e.id, e.day, e.time, e.kind, e.amount, e.volume, e.odometer, e.comment, e.created_at, c.plate
       FROM driver_expenses e LEFT JOIN cars c ON c.id = e.car_id
       WHERE e.driver_id = $1 AND e.day >= $2 AND e.day <= $3
       ORDER BY e.day DESC, e.time DESC, e.id DESC`,
      [req.user.driver_id, from, to]
    );
    res.json({
      from,
      to,
      rows: rows.map((r) => ({
        ...r,
        amount: Number(r.amount),
        volume: r.volume == null ? null : Number(r.volume),
        odometer: r.odometer == null ? null : Number(r.odometer),
      })),
    });
  } catch (err) {
    console.error('Ошибка расходов водителя:', err);
    fail(res, 500, 'INTERNAL_ERROR', 'Внутренняя ошибка сервера');
  }
});

// POST /me/expenses — заправка или зарядка: сумма, литры/кВт·ч и пробег на момент записи
router.post('/expenses', async (req, res) => {
  try {
    if (!driverOnly(req, res)) return;
    const today = localToday();
    const day = req.body.date || today;
    const kind = req.body.kind || 'FUEL';
    const amount = readAmount(req.body.amount);
    const volume = req.body.volume === '' || req.body.volume == null ? null : Number(String(req.body.volume).replace(',', '.'));
    const odometer = req.body.odometer === '' || req.body.odometer == null ? null : readInt(req.body.odometer);
    const comment = req.body.comment ? String(req.body.comment).trim().slice(0, 300) : null;
    const time = readTime(req.body.time);
    if (time === undefined) return fail(res, 400, 'BAD_REQUEST', 'Неверное время', 'time');
    if (!EXPENSE_KINDS.includes(kind)) return fail(res, 400, 'BAD_REQUEST', 'Выберите вид расхода', 'kind');
    if (Number.isNaN(amount) || amount > 1e9) return fail(res, 400, 'BAD_REQUEST', 'Укажите сумму', 'amount');
    if (volume != null && (!Number.isFinite(volume) || volume <= 0 || volume > 10000)) return fail(res, 400, 'BAD_REQUEST', 'Неверное количество', 'volume');
    if (odometer != null && (Number.isNaN(odometer) || odometer > 5e6)) return fail(res, 400, 'BAD_REQUEST', 'Неверный пробег', 'odometer');
    if (!isDay(day) || day > today) return fail(res, 400, 'BAD_REQUEST', 'Неверная дата', 'date');
    const carId = await carOnDay(req.user.driver_id, day, today);
    if (!carId) return fail(res, 409, 'CONFLICT', 'В этот день за вами не было машины', 'date');
    const { rows } = await pool.query(
      `INSERT INTO driver_expenses (driver_id, car_id, day, time, kind, amount, volume, odometer, comment)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [req.user.driver_id, carId, day, time, kind, amount, volume, odometer, comment]
    );
    if (odometer) await bumpCarMileage(carId, odometer);
    res.status(201).json({ id: rows[0].id });
  } catch (err) {
    console.error('Ошибка записи расхода:', err);
    fail(res, 500, 'INTERNAL_ERROR', 'Внутренняя ошибка сервера');
  }
});

router.delete('/expenses/:id', async (req, res) => {
  try {
    if (!driverOnly(req, res)) return;
    const { rows } = await pool.query(
      'DELETE FROM driver_expenses WHERE id = $1 AND driver_id = $2 RETURNING id',
      [parseInt(req.params.id, 10), req.user.driver_id]
    );
    if (!rows.length) return fail(res, 404, 'NOT_FOUND', 'Запись не найдена');
    res.json({ id: rows[0].id, deleted: true });
  } catch (err) {
    console.error('Ошибка удаления расхода:', err);
    fail(res, 500, 'INTERNAL_ERROR', 'Внутренняя ошибка сервера');
  }
});

// GET /me/income — заработок водителя по дням (видит только он сам)
router.get('/income', async (req, res) => {
  try {
    if (!driverOnly(req, res)) return;
    const { from, to } = periodFrom(req.query, localToday());
    const { rows } = await pool.query(
      `SELECT id, day, amount, comment, created_at FROM driver_income
       WHERE driver_id = $1 AND day >= $2 AND day <= $3 ORDER BY day DESC, id DESC`,
      [req.user.driver_id, from, to]
    );
    res.json({ from, to, rows: rows.map((r) => ({ ...r, amount: Number(r.amount) })) });
  } catch (err) {
    console.error('Ошибка заработка водителя:', err);
    fail(res, 500, 'INTERNAL_ERROR', 'Внутренняя ошибка сервера');
  }
});

router.post('/income', async (req, res) => {
  try {
    if (!driverOnly(req, res)) return;
    const today = localToday();
    const day = req.body.date || today;
    const amount = readAmount(req.body.amount);
    const comment = req.body.comment ? String(req.body.comment).trim().slice(0, 300) : null;
    if (Number.isNaN(amount) || amount > 1e9) return fail(res, 400, 'BAD_REQUEST', 'Укажите сумму', 'amount');
    if (!isDay(day) || day > today) return fail(res, 400, 'BAD_REQUEST', 'Неверная дата', 'date');
    const { rows } = await pool.query(
      'INSERT INTO driver_income (driver_id, day, amount, comment) VALUES ($1, $2, $3, $4) RETURNING id',
      [req.user.driver_id, day, amount, comment]
    );
    res.status(201).json({ id: rows[0].id });
  } catch (err) {
    console.error('Ошибка записи заработка:', err);
    fail(res, 500, 'INTERNAL_ERROR', 'Внутренняя ошибка сервера');
  }
});

router.delete('/income/:id', async (req, res) => {
  try {
    if (!driverOnly(req, res)) return;
    const { rows } = await pool.query(
      'DELETE FROM driver_income WHERE id = $1 AND driver_id = $2 RETURNING id',
      [parseInt(req.params.id, 10), req.user.driver_id]
    );
    if (!rows.length) return fail(res, 404, 'NOT_FOUND', 'Запись не найдена');
    res.json({ id: rows[0].id, deleted: true });
  } catch (err) {
    console.error('Ошибка удаления заработка:', err);
    fail(res, 500, 'INTERNAL_ERROR', 'Внутренняя ошибка сервера');
  }
});

// GET /me/report?from&to — сколько водитель заработал чистыми: заработок минус расходы (аренду водителю здесь не показываем)
router.get('/report', async (req, res) => {
  try {
    if (!driverOnly(req, res)) return;
    const driverId = req.user.driver_id;
    const { from, to } = periodFrom(req.query, localToday());
    if (daysBetween(from, to).length > 366) return fail(res, 400, 'BAD_REQUEST', 'Не больше года за раз', 'from');

    const { rows: miles } = await pool.query(
      `SELECT car_id, day, odometer, income FROM driver_mileage
       WHERE driver_id = $1 AND day >= $2 AND day <= $3 ORDER BY day, id`,
      [driverId, from, to]
    );
    const { rows: exp } = await pool.query(
      `SELECT kind, SUM(amount) AS amount, SUM(volume) AS volume, COUNT(*) AS n FROM driver_expenses
       WHERE driver_id = $1 AND day >= $2 AND day <= $3 GROUP BY kind`,
      [driverId, from, to]
    );

    // Пробег: разница показаний одометра внутри периода плюс от последней записи до периода
    let km = 0;
    const byCar = new Map();
    for (const m of miles) {
      const list = byCar.get(Number(m.car_id)) || [];
      list.push(Number(m.odometer));
      byCar.set(Number(m.car_id), list);
    }
    for (const [carId, list] of byCar) {
      const { rows: prev } = await pool.query(
        `SELECT odometer FROM driver_mileage WHERE driver_id = $1 AND car_id = $2 AND day < $3
         ORDER BY day DESC, id DESC LIMIT 1`,
        [driverId, carId, from]
      );
      const start = prev.length ? Number(prev[0].odometer) : list[0];
      km += Math.max(0, Math.max(...list) - start);
    }

    const { rows: earned } = await pool.query(
      'SELECT day, amount FROM driver_income WHERE driver_id = $1 AND day >= $2 AND day <= $3',
      [driverId, from, to]
    );
    const income = earned.reduce((s, r) => s + Number(r.amount), 0)
      + miles.reduce((s, m) => s + Number(m.income || 0), 0);
    const expenses = exp.map((e) => ({ kind: e.kind, amount: Number(e.amount), volume: e.volume == null ? null : Number(e.volume), count: Number(e.n) }));
    const spent = expenses.reduce((s, e) => s + e.amount, 0);
    const workDays = new Set([
      ...earned.map((r) => r.day),
      ...miles.filter((m) => Number(m.income) > 0).map((m) => m.day),
    ]).size;
    const net = income - spent;

    res.json({
      from,
      to,
      income,
      expenses,
      spent,
      net,
      km,
      work_days: workDays,
      per_km: km > 0 ? Math.round(spent / km) : null,
      net_per_day: workDays > 0 ? Math.round(net / workDays) : null,
      entries: earned.length + miles.filter((m) => Number(m.income) > 0).length,
    });
  } catch (err) {
    console.error('Ошибка отчёта водителя:', err);
    fail(res, 500, 'INTERNAL_ERROR', 'Внутренняя ошибка сервера');
  }
});

// GET /me/car-photo — фото машины, на которой водитель ездит сейчас
router.get('/car-photo', async (req, res) => {
  try {
    if (!driverOnly(req, res)) return;
    const assignment = await currentCar(req.user.driver_id);
    if (!assignment) return fail(res, 404, 'NOT_FOUND', 'Машины нет');
    const { rows } = await pool.query('SELECT mime, data FROM car_photos WHERE car_id = $1', [assignment.car_id]);
    if (!rows.length) return fail(res, 404, 'NOT_FOUND', 'Фото нет');
    res.set('Content-Type', rows[0].mime);
    res.set('Cache-Control', 'private, max-age=86400');
    res.send(Buffer.from(rows[0].data, 'base64'));
  } catch (err) {
    console.error('Ошибка фото для водителя:', err);
    fail(res, 500, 'INTERNAL_ERROR', 'Внутренняя ошибка сервера');
  }
});

export default router;
