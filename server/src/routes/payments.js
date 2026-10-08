import { Router } from 'express';
import { pool } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { writeAudit } from '../middleware/audit.js';

const router = Router();

// GET / — Очередь платежей (для DISPATCHER и ADMIN)
router.get('/', authenticate, requireRole('DISPATCHER', 'ADMIN'), async (req, res) => {
  try {
    const statusParam = req.query.status;
    const statuses = statusParam ? statusParam.split(',') : ['DISPATCHER_PENDING'];
    
    let query = `
      SELECT p.id, p.amount_declared, p.amount_dispatcher, p.status, p.method, p.created_at,
             p.locked, p.reject_reason, p.shortage_reason,
             u.full_name AS driver_name,
             c.plate AS car_plate
      FROM payments p
      JOIN drivers d ON p.driver_id = d.id
      JOIN users u ON d.user_id = u.id
      JOIN daily_reports dr ON p.daily_report_id = dr.id
      JOIN cars c ON dr.car_id = c.id
      WHERE p.status = ANY($1)
    `;
    
    const params = [statuses];
    let paramIndex = 2;

    if (req.user.role === 'DISPATCHER') {
      query += ` AND p.dispatcher_id = $${paramIndex}`;
      params.push(req.user.id);
      paramIndex++;
    }

    query += ' ORDER BY p.created_at DESC';

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error('Ошибка получения очереди платежей:', err);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Внутренняя ошибка сервера' } });
  }
});

// POST / — Создание платежа (только DRIVER)
router.post('/', authenticate, requireRole('DRIVER'), async (req, res) => {
  try {
    const idempotencyKey = req.headers['idempotency-key'];
    if (!idempotencyKey) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Отсутствует обязательный заголовок Idempotency-Key' } });
    }

    const { daily_report_id, amount_declared, method, receipt_url } = req.body;
    
    if (!daily_report_id || !amount_declared || !method) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Укажите daily_report_id, amount_declared и method' } });
    }

    const { rows: reports } = await pool.query(
      'SELECT id, driver_id FROM daily_reports WHERE id = $1',
      [daily_report_id]
    );

    if (reports.length === 0) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Дневной отчёт не найден' } });
    }

    const report = reports[0];
    if (report.driver_id !== req.user.driver_id) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Этот отчёт не принадлежит вам' } });
    }

    const { rows: dispatchers } = await pool.query(
      `SELECT u.id FROM users u
       JOIN user_branches ub ON u.id = ub.user_id
       JOIN drivers d ON ub.branch_id = d.branch_id
       WHERE u.role = 'DISPATCHER' AND u.status = 'ACTIVE' AND d.id = $1
       LIMIT 1`,
      [req.user.driver_id]
    );

    if (dispatchers.length === 0) {
      return res.status(409).json({ error: { code: 'CONFLICT', message: 'Нет доступного диспетчера для приёма платежа' } });
    }
    const dispatcherId = dispatchers[0].id;

    const { rows } = await pool.query(
      `INSERT INTO payments 
       (idempotency_key, daily_report_id, driver_id, dispatcher_id, amount_declared, method, receipt_url, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'DISPATCHER_PENDING')
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING id, status, created_at`,
      [idempotencyKey, daily_report_id, req.user.driver_id, dispatcherId, amount_declared, method, receipt_url || null]
    );

    let payment;
    if (rows.length > 0) {
      payment = rows[0];
      await writeAudit(pool, req.user.id, 'PAYMENT_CREATED', 'payment', payment.id, null, { amount_declared, method }, req.ip);
    } else {
      const { rows: existing } = await pool.query(
        'SELECT id, status, created_at FROM payments WHERE idempotency_key = $1',
        [idempotencyKey]
      );
      payment = existing[0];
    }

    res.status(rows.length > 0 ? 201 : 200).json(payment);
  } catch (err) {
    console.error('Ошибка создания платежа:', err);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Внутренняя ошибка сервера' } });
  }
});

// PATCH /:id/confirm — Подтверждение диспетчером
router.patch('/:id/confirm', authenticate, requireRole('DISPATCHER'), async (req, res) => {
  const client = await pool.connect();
  try {
    const paymentId = parseInt(req.params.id, 10);
    const { amount_dispatcher, shortage_reason } = req.body;

    if (!amount_dispatcher || amount_dispatcher <= 0) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Укажите корректную сумму фактического приёма', field: 'amount_dispatcher' } });
    }

    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT id, dispatcher_id, amount_declared, status, locked
       FROM payments WHERE id = $1 FOR UPDATE`,
      [paymentId]
    );

    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Платёж не найден' } });
    }

    const payment = rows[0];

    if (payment.locked) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: { code: 'LOCKED', message: 'Платёж заблокирован и не может быть изменён' } });
    }

    if (payment.dispatcher_id !== req.user.id) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Это не ваш платёж' } });
    }

    if (payment.status !== 'DISPATCHER_PENDING') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: { code: 'CONFLICT', message: `Платёж уже в статусе ${payment.status}` } });
    }

    let newStatus;
    let rejectReason = null;
    let shortage = null;

    if (amount_dispatcher >= payment.amount_declared) {
      newStatus = 'ADMIN_PENDING';
    } else {
      newStatus = 'DISPATCHER_PENDING';
      shortage = shortage_reason || 'Не указано';
    }

    await client.query(
      `UPDATE payments 
       SET amount_dispatcher = $1, status = $2, shortage_reason = $3, reject_reason = $4
       WHERE id = $5`,
      [amount_dispatcher, newStatus, shortage, rejectReason, paymentId]
    );

    await writeAudit(
      client,
      req.user.id,
      'PAYMENT_DISPATCHER_CONFIRMED',
      'payment',
      paymentId,
      { amount_declared: payment.amount_declared, status: payment.status },
      { amount_dispatcher, status: newStatus, shortage_reason: shortage },
      req.ip
    );

    await client.query('COMMIT');

    res.json({
      id: paymentId,
      amount_dispatcher,
      status: newStatus,
      shortage_reason: shortage,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Ошибка подтверждения диспетчером:', err);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Внутренняя ошибка сервера' } });
  } finally {
    client.release();
  }
});

// PATCH /:id/admin-confirm — Подтверждение или отклонение администратором
router.patch('/:id/admin-confirm', authenticate, requireRole('ADMIN'), async (req, res) => {
  const client = await pool.connect();
  try {
    const paymentId = parseInt(req.params.id, 10);
    const { action, reject_reason, amount_admin } = req.body;

    if (!action || !['CONFIRM', 'REJECT'].includes(action)) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Укажите action: CONFIRM или REJECT', field: 'action' } });
    }

    if (action === 'REJECT' && !reject_reason) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Укажите причину отклонения', field: 'reject_reason' } });
    }

    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT id, status, locked, amount_declared, amount_dispatcher
       FROM payments WHERE id = $1 FOR UPDATE`,
      [paymentId]
    );

    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Платёж не найден' } });
    }

    const payment = rows[0];

    if (payment.locked) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: { code: 'LOCKED', message: 'Платёж заблокирован и не может быть изменён' } });
    }

    if (payment.status !== 'ADMIN_PENDING') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: { code: 'CONFLICT', message: `Платёж уже в статусе ${payment.status}` } });
    }

    let newStatus;
    let locked = false;
    let finalAmountAdmin = null;
    let rejectReason = null;

    if (action === 'CONFIRM') {
      newStatus = 'ADMIN_CONFIRMED';
      locked = true;
      // Администратор может скорректировать сумму (например, если диспетчер ошибся)
      finalAmountAdmin = amount_admin || payment.amount_dispatcher || payment.amount_declared;
    } else {
      newStatus = 'REJECTED';
      rejectReason = reject_reason;
    }

    await client.query(
      `UPDATE payments 
       SET status = $1, locked = $2, amount_admin = $3, reject_reason = $4, admin_id = $5
       WHERE id = $6`,
      [newStatus, locked, finalAmountAdmin, rejectReason, req.user.id, paymentId]
    );

    await writeAudit(
      client,
      req.user.id,
      `PAYMENT_ADMIN_${action}`,
      'payment',
      paymentId,
      { status: payment.status },
      { status: newStatus, locked, amount_admin: finalAmountAdmin, reject_reason: rejectReason },
      req.ip
    );

    await client.query('COMMIT');

    res.json({
      id: paymentId,
      status: newStatus,
      locked,
      amount_admin: finalAmountAdmin,
      reject_reason: rejectReason,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Ошибка подтверждения администратором:', err);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Внутренняя ошибка сервера' } });
  } finally {
    client.release();
  }
});

export default router;