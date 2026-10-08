import { Router } from 'express';
import { pool } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { writeAudit } from '../middleware/audit.js';

const router = Router();

router.use(authenticate);

// GET / — Список автомобилей
router.get('/', async (req, res) => {
  try {
    let query = `
      SELECT c.id, c.plate, c.brand, c.model, c.year, c.status, c.branch_id, c.owner_id,
             o.name AS owner_name, b.name AS branch_name
      FROM cars c
      LEFT JOIN owners o ON c.owner_id = o.id
      LEFT JOIN branches b ON c.branch_id = b.id
      WHERE c.archived_at IS NULL
    `;
    const params = [];
    let idx = 1;

    // Диспетчер видит только свой филиал
    if (req.user.role === 'DISPATCHER' && req.user.branch_id) {
      params.push(req.user.branch_id);
      query += ` AND c.branch_id = $${idx++}`;
    }

    // Арендодатель видит только свои автомобили
    if (req.user.role === 'OWNER') {
      const { rows: owners } = await pool.query(
        'SELECT id FROM owners WHERE user_id = $1',
        [req.user.id]
      );
      if (owners.length === 0) return res.json([]);
      params.push(owners[0].id);
      query += ` AND c.owner_id = $${idx++}`;
    }

    query += ' ORDER BY c.plate';

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error('Ошибка получения списка автомобилей:', err);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Внутренняя ошибка сервера' } });
  }
});

// GET /:id — Один автомобиль
router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { rows } = await pool.query(
      `SELECT c.*, o.name AS owner_name, b.name AS branch_name
       FROM cars c
       LEFT JOIN owners o ON c.owner_id = o.id
       LEFT JOIN branches b ON c.branch_id = b.id
       WHERE c.id = $1 AND c.archived_at IS NULL`,
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Автомобиль не найден' } });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error('Ошибка получения автомобиля:', err);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Внутренняя ошибка сервера' } });
  }
});

// POST / — Создание автомобиля (ADMIN, DISPATCHER)
router.post('/', requireRole('ADMIN', 'DISPATCHER'), async (req, res) => {
  try {
    const { plate, brand, model, year, owner_id, branch_id } = req.body;

    if (!plate || !brand || !model) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Укажите plate, brand и model' } });
    }

    // Нормализуем номер
    const normalizedPlate = plate.toUpperCase().replace(/\s+/g, '');

    // Диспетчер может создавать авто только в своём филиале
    const finalBranchId = req.user.role === 'DISPATCHER' ? req.user.branch_id : branch_id;

    if (!finalBranchId) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Укажите branch_id' } });
    }

    const { rows } = await pool.query(
      `INSERT INTO cars (plate, brand, model, year, owner_id, branch_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'FREE')
       RETURNING id, plate, brand, model, year, status, branch_id, owner_id`,
      [normalizedPlate, brand, model, year || null, owner_id || null, finalBranchId]
    );

    const car = rows[0];
    await writeAudit(pool, req.user.id, 'CAR_CREATED', 'car', car.id, null, car, req.ip);

    res.status(201).json(car);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: { code: 'CONFLICT', message: 'Автомобиль с таким номером уже существует' } });
    }
    console.error('Ошибка создания автомобиля:', err);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Внутренняя ошибка сервера' } });
  }
});

// PATCH /:id — Редактирование автомобиля (ADMIN, DISPATCHER)
router.patch('/:id', requireRole('ADMIN', 'DISPATCHER'), async (req, res) => {
  try {
    const carId = parseInt(req.params.id, 10);
    const { plate, brand, model, year, owner_id, branch_id } = req.body;

    const updates = [];
    const params = [];

    if (plate !== undefined) {
      params.push(plate.toUpperCase().replace(/\s+/g, ''));
      updates.push(`plate = $${params.length}`);
    }
    if (brand !== undefined) { params.push(brand); updates.push(`brand = $${params.length}`); }
    if (model !== undefined) { params.push(model); updates.push(`model = $${params.length}`); }
    if (year !== undefined) { params.push(year); updates.push(`year = $${params.length}`); }
    if (owner_id !== undefined) { params.push(owner_id); updates.push(`owner_id = $${params.length}`); }
    if (branch_id !== undefined && req.user.role === 'ADMIN') {
      params.push(branch_id);
      updates.push(`branch_id = $${params.length}`);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Нет данных для обновления' } });
    }

    params.push(carId);

    const { rows } = await pool.query(
      `UPDATE cars SET ${updates.join(', ')}
       WHERE id = $${params.length} AND archived_at IS NULL
       RETURNING id, plate, brand, model, year, status, branch_id, owner_id`,
      params
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Автомобиль не найден' } });
    }

    await writeAudit(pool, req.user.id, 'CAR_UPDATED', 'car', carId, null, rows[0], req.ip);
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: { code: 'CONFLICT', message: 'Автомобиль с таким номером уже существует' } });
    }
    console.error('Ошибка редактирования автомобиля:', err);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Внутренняя ошибка сервера' } });
  }
});

// POST /:id/archive — Архивация автомобиля (ADMIN, DISPATCHER)
router.post('/:id/archive', requireRole('ADMIN', 'DISPATCHER'), async (req, res) => {
  try {
    const carId = parseInt(req.params.id, 10);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Проверяем, есть ли активные назначения
      const { rows: assignments } = await client.query(
        `SELECT id FROM car_assignments WHERE car_id = $1 AND end_at IS NULL`,
        [carId]
      );

      if (assignments.length > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: { code: 'CONFLICT', message: 'Нельзя архивировать автомобиль с активным назначением. Сначала завершите назначение.' }
        });
      }

      const { rows } = await client.query(
        `UPDATE cars SET archived_at = now(), status = 'ARCHIVED'
         WHERE id = $1 AND archived_at IS NULL
         RETURNING id, plate, status`,
        [carId]
      );

      if (rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Автомобиль не найден' } });
      }

      await writeAudit(client, req.user.id, 'CAR_ARCHIVED', 'car', carId, null, rows[0], req.ip);
      await client.query('COMMIT');

      res.json(rows[0]);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Ошибка архивации автомобиля:', err);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Внутренняя ошибка сервера' } });
  }
});

export default router;