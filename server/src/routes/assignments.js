import { Router } from 'express';
import { pool } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { writeAudit } from '../middleware/audit.js';

const router = Router();

router.use(authenticate, requireRole('DISPATCHER', 'ADMIN'));

// GET / — Список активных назначений
router.get('/', async (req, res) => {
  try {
    let query = `
      SELECT ca.id, ca.start_at, ca.end_at, ca.mileage_start, ca.mileage_end, ca.note,
             c.id AS car_id, c.plate, c.brand, c.model,
             d.id AS driver_id,
             u.full_name AS driver_name, u.phone AS driver_phone,
             b.name AS branch_name
      FROM car_assignments ca
      JOIN cars c ON ca.car_id = c.id
      JOIN drivers d ON ca.driver_id = d.id
      JOIN users u ON d.user_id = u.id
      JOIN branches b ON c.branch_id = b.id
      WHERE ca.end_at IS NULL
    `;
    
    const params = [];
    
    // Диспетчер видит только назначения своего филиала
    if (req.user.role === 'DISPATCHER' && req.user.branch_id) {
      params.push(req.user.branch_id);
      query += ` AND c.branch_id = $${params.length}`;
    }
    
    query += ' ORDER BY ca.start_at DESC';
    
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error('Ошибка получения списка назначений:', err);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Внутренняя ошибка сервера' } });
  }
});

// GET /available — Автомобили и водители, доступные для назначения
router.get('/available', async (req, res) => {
  try {
    // Свободные автомобили (статус FREE, не архивированы)
    let carsQuery = `
      SELECT id, plate, brand, model, branch_id
      FROM cars
      WHERE status = 'FREE' AND archived_at IS NULL
    `;
    const carsParams = [];
    
    if (req.user.role === 'DISPATCHER' && req.user.branch_id) {
      carsParams.push(req.user.branch_id);
      carsQuery += ` AND branch_id = $${carsParams.length}`;
    }
    
    carsQuery += ' ORDER BY plate';
    
    // Водители без активного назначения (статус FREE)
    let driversQuery = `
      SELECT d.id, u.full_name, u.phone, d.branch_id
      FROM drivers d
      JOIN users u ON d.user_id = u.id
      WHERE d.status = 'FREE' AND d.archived_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM car_assignments ca 
          WHERE ca.driver_id = d.id AND ca.end_at IS NULL
        )
    `;
    const driversParams = [];
    
    if (req.user.role === 'DISPATCHER' && req.user.branch_id) {
      driversParams.push(req.user.branch_id);
      driversQuery += ` AND d.branch_id = $${driversParams.length}`;
    }
    
    driversQuery += ' ORDER BY u.full_name';
    
    const [carsRes, driversRes] = await Promise.all([
      pool.query(carsQuery, carsParams),
      pool.query(driversQuery, driversParams),
    ]);
    
    res.json({ cars: carsRes.rows, drivers: driversRes.rows });
  } catch (err) {
    console.error('Ошибка получения доступных ресурсов:', err);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Внутренняя ошибка сервера' } });
  }
});

// POST / — Создание назначения
router.post('/', async (req, res) => {
  try {
    const { car_id, driver_id, mileage_start, note } = req.body;
    
    if (!car_id || !driver_id) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Укажите car_id и driver_id' } });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Проверяем, что автомобиль свободен
      const { rows: cars } = await client.query(
        `SELECT id, status, branch_id FROM cars WHERE id = $1 AND archived_at IS NULL FOR UPDATE`,
        [car_id]
      );
      if (cars.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Автомобиль не найден' } });
      }
      if (cars[0].status !== 'FREE') {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: { code: 'CONFLICT', message: 'Автомобиль уже назначен' } });
      }

      // Проверяем, что водитель свободен
      const { rows: drivers } = await client.query(
        `SELECT d.id, d.branch_id FROM drivers d
         WHERE d.id = $1 AND d.archived_at IS NULL
           AND NOT EXISTS (SELECT 1 FROM car_assignments ca WHERE ca.driver_id = d.id AND ca.end_at IS NULL)
         FOR UPDATE`,
        [driver_id]
      );
      if (drivers.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Водитель не найден или уже занят' } });
      }

      // Создаём назначение
      const { rows: assignments } = await client.query(
        `INSERT INTO car_assignments (car_id, driver_id, mileage_start, note, created_by)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, start_at, mileage_start`,
        [car_id, driver_id, mileage_start || 0, note || null, req.user.id]
      );

      // Меняем статус автомобиля на RENTED
      await client.query(
        `UPDATE cars SET status = 'RENTED' WHERE id = $1`,
        [car_id]
      );

      // Меняем статус водителя на RENTED
      await client.query(
        `UPDATE drivers SET status = 'RENTED' WHERE id = $1`,
        [driver_id]
      );

      await writeAudit(client, req.user.id, 'ASSIGNMENT_CREATED', 'car_assignment', assignments[0].id, null, 
        { car_id, driver_id, mileage_start }, req.ip);
      
      await client.query('COMMIT');
      res.status(201).json(assignments[0]);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Ошибка создания назначения:', err);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Внутренняя ошибка сервера' } });
  }
});

// POST /:id/end — Завершение назначения
router.post('/:id/end', async (req, res) => {
  try {
    const assignmentId = parseInt(req.params.id, 10);
    const { mileage_end, note } = req.body;

    if (mileage_end === undefined || mileage_end === null) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Укажите mileage_end', field: 'mileage_end' } });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { rows } = await client.query(
        `SELECT ca.id, ca.car_id, ca.driver_id, ca.mileage_start, ca.end_at
         FROM car_assignments ca
         WHERE ca.id = $1 FOR UPDATE`,
        [assignmentId]
      );

      if (rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Назначение не найдено' } });
      }

      const assignment = rows[0];

      if (assignment.end_at !== null) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: { code: 'CONFLICT', message: 'Назначение уже завершено' } });
      }

      if (mileage_end < assignment.mileage_start) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Конечный пробег не может быть меньше начального', field: 'mileage_end' } });
      }

      // Завершаем назначение
      await client.query(
        `UPDATE car_assignments SET end_at = now(), mileage_end = $1, note = COALESCE($2, note)
         WHERE id = $3`,
        [mileage_end, note || null, assignmentId]
      );

      // Возвращаем статусы в FREE
      await client.query(`UPDATE cars SET status = 'FREE' WHERE id = $1`, [assignment.car_id]);
      await client.query(`UPDATE drivers SET status = 'FREE' WHERE id = $1`, [assignment.driver_id]);

      await writeAudit(client, req.user.id, 'ASSIGNMENT_ENDED', 'car_assignment', assignmentId, 
        { mileage_start: assignment.mileage_start }, 
        { mileage_end, note }, 
        req.ip);

      await client.query('COMMIT');
      res.json({ id: assignmentId, mileage_end, ended_at: new Date().toISOString() });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Ошибка завершения назначения:', err);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Внутренняя ошибка сервера' } });
  }
});

export default router;