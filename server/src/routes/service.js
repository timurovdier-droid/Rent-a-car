import { Router } from 'express';
import { pool } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { writeAudit } from '../middleware/audit.js';

const router = Router();

router.use(authenticate, requireRole('DISPATCHER', 'ADMIN'));

// GET / — Список записей обслуживания
router.get('/', async (req, res) => {
  try {
    const { car_id, status } = req.query;

    let query = `
      SELECT s.id, s.car_id, s.type, s.description, s.cost, s.status,
             s.scheduled_at, s.completed_at, s.created_at,
             c.plate, c.brand, c.model,
             b.name AS branch_name
      FROM service_records s
      JOIN cars c ON s.car_id = c.id
      JOIN branches b ON c.branch_id = b.id
      WHERE 1=1
    `;

    const params = [];
    let idx = 1;

    if (car_id) {
      params.push(car_id);
      query += ` AND s.car_id = $${idx++}`;
    }

    if (status) {
      params.push(status);
      query += ` AND s.status = $${idx++}`;
    }

    // Диспетчер видит только свой филиал
    if (req.user.role === 'DISPATCHER' && req.user.branch_id) {
      params.push(req.user.branch_id);
      query += ` AND c.branch_id = $${idx++}`;
    }

    query += ' ORDER BY s.created_at DESC LIMIT 200';

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error('Ошибка получения записей обслуживания:', err);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Внутренняя ошибка сервера' } });
  }
});

// POST / — Создание записи обслуживания
router.post('/', async (req, res) => {
  try {
    const { car_id, type, description, cost, scheduled_at } = req.body;

    if (!car_id || !type) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Укажите car_id и type' } });
    }

    const validTypes = ['OIL_CHANGE', 'REPAIR', 'INSURANCE', 'INSPECTION', 'TIRE', 'OTHER'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: `Тип должен быть одним из: ${validTypes.join(', ')}`, field: 'type' } });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Проверяем существование автомобиля
      const { rows: cars } = await client.query(
        'SELECT id, status FROM cars WHERE id = $1 AND archived_at IS NULL',
        [car_id]
      );

      if (cars.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Автомобиль не найден' } });
      }

      // Создаём запись
      const { rows } = await client.query(
        `INSERT INTO service_records (car_id, type, description, cost, scheduled_at, status, created_by)
         VALUES ($1, $2, $3, $4, $5, 'SCHEDULED', $6)
         RETURNING id, status, created_at`,
        [car_id, type, description || null, cost || 0, scheduled_at || null, req.user.id]
      );

      // Если автомобиль свободен, переводим в SERVICE
      if (cars[0].status === 'FREE') {
        await client.query(`UPDATE cars SET status = 'SERVICE' WHERE id = $1`, [car_id]);
      }

      await writeAudit(client, req.user.id, 'SERVICE_CREATED', 'service_record', rows[0].id, null,
        { car_id, type, description, cost }, req.ip);

      await client.query('COMMIT');
      res.status(201).json(rows[0]);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Ошибка создания записи обслуживания:', err);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Внутренняя ошибка сервера' } });
  }
});

// POST /:id/complete — Завершение обслуживания
router.post('/:id/complete', async (req, res) => {
  try {
    const recordId = parseInt(req.params.id, 10);
    const { cost, description } = req.body;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { rows } = await client.query(
        `SELECT s.id, s.car_id, s.status, s.cost
         FROM service_records s
         WHERE s.id = $1 FOR UPDATE`,
        [recordId]
      );

      if (rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Запись не найдена' } });
      }

      const record = rows[0];

      if (record.status === 'COMPLETED') {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: { code: 'CONFLICT', message: 'Обслуживание уже завершено' } });
      }

      // Обновляем запись
      const finalCost = cost !== undefined ? cost : record.cost;
      const finalDesc = description !== undefined ? description : null;

      await client.query(
        `UPDATE service_records 
         SET status = 'COMPLETED', completed_at = now(), cost = $1, 
             description = COALESCE($2, description)
         WHERE id = $3`,
        [finalCost, finalDesc, recordId]
      );

      // Проверяем, есть ли ещё незавершённые ТО для этого авто
      const { rows: pending } = await client.query(
        `SELECT id FROM service_records 
         WHERE car_id = $1 AND status = 'SCHEDULED' AND id != $2`,
        [record.car_id, recordId]
      );

      // Если нет других незавершённых ТО и авто в статусе SERVICE — возвращаем в FREE
      if (pending.length === 0) {
        await client.query(
          `UPDATE cars SET status = 'FREE' WHERE id = $1 AND status = 'SERVICE'`,
          [record.car_id]
        );
      }

      await writeAudit(client, req.user.id, 'SERVICE_COMPLETED', 'service_record', recordId,
        { status: record.status }, { status: 'COMPLETED', cost: finalCost }, req.ip);

      await client.query('COMMIT');
      res.json({ id: recordId, status: 'COMPLETED', cost: finalCost });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Ошибка завершения обслуживания:', err);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Внутренняя ошибка сервера' } });
  }
});

export default router;