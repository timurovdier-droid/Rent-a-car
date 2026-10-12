import { Router } from 'express';
import { pool } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { writeAudit } from '../middleware/audit.js';
import { localDay, localToday, isDay, addDays, daysBetween, carDailyLedger, rentStatus } from '../carMoney.js';

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
