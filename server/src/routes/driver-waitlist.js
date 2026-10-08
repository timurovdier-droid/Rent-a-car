import { Router } from 'express';
import { pool } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { writeAudit } from '../middleware/audit.js';

const router = Router();

router.use(authenticate, requireRole('DISPATCHER', 'ADMIN'));

function fail(res, status, code, message, field) {
  return res.status(status).json({ error: { code, message, ...(field ? { field } : {}) } });
}

function serverError(res, label, err) {
  console.error(label, err);
  return fail(res, 500, 'INTERNAL_ERROR', 'Внутренняя ошибка сервера');
}

function branchFilter(user, alias, params) {
  if (user.role === 'DISPATCHER' && user.branch_id) {
    params.push(user.branch_id);
    return ` AND ${alias}.branch_id = $${params.length}`;
  }
  return '';
}

function text(value) {
  const s = value === undefined || value === null ? '' : String(value).trim();
  return s || null;
}

const SELECT = `
  SELECT w.id, w.full_name, w.phone, w.wanted_car, w.comment, w.branch_id, w.status,
         w.created_at, w.closed_at, u.full_name AS author_name, b.name AS branch_name
  FROM driver_waitlist w
  LEFT JOIN users u ON u.id = w.created_by
  LEFT JOIN branches b ON b.id = w.branch_id`;

async function loadEntry(req, res) {
  const params = [parseInt(req.params.id, 10)];
  const { rows } = await pool.query(`${SELECT} WHERE w.id = $1${branchFilter(req.user, 'w', params)}`, params);
  if (!rows.length) {
    fail(res, 404, 'NOT_FOUND', 'Запись не найдена');
    return null;
  }
  return rows[0];
}

// GET / — Лист ожидания (?closed=1 — вместе с закрытыми)
router.get('/', async (req, res) => {
  try {
    const params = [];
    let query = `${SELECT} WHERE 1 = 1`;
    if (req.query.closed !== '1') query += " AND w.status = 'WAITING'";
    query += branchFilter(req.user, 'w', params);
    query += " ORDER BY CASE w.status WHEN 'WAITING' THEN 0 ELSE 1 END, w.created_at DESC";
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    serverError(res, 'Ошибка получения листа ожидания:', err);
  }
});

// POST / — Записать водителя в лист ожидания
router.post('/', async (req, res) => {
  const fullName = text(req.body.full_name);
  const phone = text(req.body.phone);
  if (!fullName) return fail(res, 400, 'BAD_REQUEST', 'Укажите имя', 'full_name');
  if (!phone) return fail(res, 400, 'BAD_REQUEST', 'Укажите телефон', 'phone');
  const branchId = req.user.role === 'DISPATCHER' && req.user.branch_id
    ? req.user.branch_id
    : (req.body.branch_id ? Number(req.body.branch_id) : null);
  try {
    const { rows } = await pool.query(
      `INSERT INTO driver_waitlist (full_name, phone, wanted_car, comment, branch_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [fullName, phone, text(req.body.wanted_car), text(req.body.comment), branchId, req.user.id]
    );
    const id = rows[0].id;
    await writeAudit(pool, req.user.id, 'WAITLIST_CREATED', 'driver_waitlist', id, null,
      { full_name: fullName, phone, wanted_car: text(req.body.wanted_car) }, req.ip);
    res.status(201).json({ id });
  } catch (err) {
    serverError(res, 'Ошибка записи в лист ожидания:', err);
  }
});

// PATCH /:id — Изменить запись
router.patch('/:id', async (req, res) => {
  try {
    const entry = await loadEntry(req, res);
    if (!entry) return;
    const fullName = req.body.full_name !== undefined ? text(req.body.full_name) : entry.full_name;
    const phone = req.body.phone !== undefined ? text(req.body.phone) : entry.phone;
    if (!fullName) return fail(res, 400, 'BAD_REQUEST', 'Укажите имя', 'full_name');
    if (!phone) return fail(res, 400, 'BAD_REQUEST', 'Укажите телефон', 'phone');
    const wantedCar = req.body.wanted_car !== undefined ? text(req.body.wanted_car) : entry.wanted_car;
    const comment = req.body.comment !== undefined ? text(req.body.comment) : entry.comment;
    await pool.query(
      'UPDATE driver_waitlist SET full_name = $1, phone = $2, wanted_car = $3, comment = $4 WHERE id = $5',
      [fullName, phone, wantedCar, comment, entry.id]
    );
    await writeAudit(pool, req.user.id, 'WAITLIST_UPDATED', 'driver_waitlist', entry.id,
      { full_name: entry.full_name, phone: entry.phone, wanted_car: entry.wanted_car, comment: entry.comment },
      { full_name: fullName, phone, wanted_car: wantedCar, comment }, req.ip);
    res.json({ id: entry.id });
  } catch (err) {
    serverError(res, 'Ошибка изменения записи листа ожидания:', err);
  }
});

// POST /:id/close и /:id/reopen — Закрыть (машину нашли / неактуально) или вернуть в ожидание
router.post('/:id/:action(close|reopen)', async (req, res) => {
  try {
    const entry = await loadEntry(req, res);
    if (!entry) return;
    const closing = req.params.action === 'close';
    await pool.query(
      `UPDATE driver_waitlist SET status = $1, closed_at = ${closing ? "datetime('now')" : 'NULL'} WHERE id = $2`,
      [closing ? 'DONE' : 'WAITING', entry.id]
    );
    await writeAudit(pool, req.user.id, closing ? 'WAITLIST_CLOSED' : 'WAITLIST_REOPENED', 'driver_waitlist',
      entry.id, { status: entry.status }, { status: closing ? 'DONE' : 'WAITING' }, req.ip);
    res.json({ id: entry.id });
  } catch (err) {
    serverError(res, 'Ошибка изменения статуса листа ожидания:', err);
  }
});

// DELETE /:id — Удалить запись
router.delete('/:id', async (req, res) => {
  try {
    const entry = await loadEntry(req, res);
    if (!entry) return;
    await pool.query('DELETE FROM driver_waitlist WHERE id = $1', [entry.id]);
    await writeAudit(pool, req.user.id, 'WAITLIST_DELETED', 'driver_waitlist', entry.id, entry, null, req.ip);
    res.json({ ok: true });
  } catch (err) {
    serverError(res, 'Ошибка удаления записи листа ожидания:', err);
  }
});

export default router;
