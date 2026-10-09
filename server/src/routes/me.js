import { Router } from 'express';
import { pool } from '../db.js';
import { authenticate } from '../middleware/auth.js';
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

function driverOnly(req, res) {
  if (req.user.role !== 'DRIVER' || !req.user.driver_id) {
    fail(res, 403, 'FORBIDDEN', 'Только для водителя');
    return false;
  }
  return true;
}

// GET /me/rent?from&to — машина водителя, его долг за всё время и таблица по дням
router.get('/rent', async (req, res) => {
  try {
    if (!driverOnly(req, res)) return;
    const driverId = req.user.driver_id;
    const today = localToday();
    const assignment = await currentCar(driverId);
    if (!assignment) return res.json({ today, car: null });

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
