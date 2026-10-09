import { Router } from 'express';
import { pool } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { writeAudit } from '../middleware/audit.js';
import { carScope, defaultBranchId, isDay } from '../carMoney.js';

const router = Router();

const FUEL_TYPES = ['PETROL', 'GAS', 'METHANE', 'PROPANE', 'DIESEL', 'ELECTRIC', 'HYBRID'];

// Общие поля машины для создания и изменения. Возвращает { values } или { error }.
function readCarFields(body) {
  const values = {};
  const text = (v) => (v === null || v === undefined ? null : String(v).trim() || null);
  if (body.plate !== undefined) values.plate = String(body.plate).toUpperCase().replace(/\s+/g, '');
  if (body.brand !== undefined) values.brand = text(body.brand);
  if (body.model !== undefined) values.model = text(body.model);
  if (body.year !== undefined) values.year = body.year ? Number(body.year) : null;
  if (body.color !== undefined) values.color = text(body.color);
  if (body.vin !== undefined) values.vin = text(body.vin)?.toUpperCase() ?? null;
  if (body.mileage !== undefined) {
    const n = body.mileage === '' || body.mileage === null ? null : Number(body.mileage);
    if (n !== null && (!Number.isFinite(n) || n < 0)) return { error: ['Неверный пробег', 'mileage'] };
    values.mileage = n === null ? null : Math.round(n);
  }
  if (body.fuel_type !== undefined) {
    if (body.fuel_type && !FUEL_TYPES.includes(body.fuel_type)) return { error: ['Неизвестный тип топлива', 'fuel_type'] };
    values.fuel_type = body.fuel_type || null;
  }
  for (const key of ['insurance_expires', 'inspection_expires']) {
    if (body[key] !== undefined) {
      if (body[key] && !isDay(body[key])) return { error: ['Неверная дата', key] };
      values[key] = body[key] || null;
    }
  }
  return { values };
}

router.use(authenticate);

// GET / — Список автомобилей (?archived=1 — архив)
router.get('/', async (req, res) => {
  try {
    const scope = await carScope(pool, req.user);
    const archived = req.query.archived === '1';
    const query = `
      SELECT c.id, c.plate, c.brand, c.model, c.year, c.color, c.vin, c.status, c.branch_id, c.owner_id,
             c.daily_rate, c.mileage, c.fuel_type, c.insurance_expires, c.inspection_expires, c.photo_version,
             c.archived_at, o.name AS owner_name, b.name AS branch_name,
             (SELECT u.full_name FROM car_assignments ca
                JOIN drivers d ON d.id = ca.driver_id JOIN users u ON u.id = d.user_id
              WHERE ca.car_id = c.id AND ca.end_at IS NULL LIMIT 1) AS driver_name
      FROM cars c
      LEFT JOIN owners o ON c.owner_id = o.id
      LEFT JOIN branches b ON c.branch_id = b.id
      WHERE c.archived_at IS ${archived ? 'NOT NULL' : 'NULL'} ${scope.sql}
      ORDER BY c.plate
    `;
    const { rows } = await pool.query(query, scope.params);
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

// POST / — Создание автомобиля (только ADMIN)
router.post('/', requireRole('ADMIN'), async (req, res) => {
  try {
    const parsed = readCarFields(req.body);
    if (parsed.error) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: parsed.error[0], field: parsed.error[1] } });
    }
    const v = parsed.values;
    if (!v.plate || !v.brand || !v.model) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Укажите госномер, марку и модель' } });
    }
    const branchId = await defaultBranchId(pool);
    const rate = req.body.daily_rate ? Math.round(Number(req.body.daily_rate)) : 0;
    if (!Number.isFinite(rate) || rate < 0) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Неверная ставка', field: 'daily_rate' } });
    }

    const { rows } = await pool.query(
      `INSERT INTO cars (plate, brand, model, year, color, vin, mileage, fuel_type, insurance_expires, inspection_expires,
                         owner_id, branch_id, daily_rate, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'FREE')
       RETURNING *`,
      [v.plate, v.brand, v.model, v.year ?? null, v.color ?? null, v.vin ?? null, v.mileage ?? null,
        v.fuel_type ?? null, v.insurance_expires ?? null, v.inspection_expires ?? null,
        req.body.owner_id ? Number(req.body.owner_id) : null, branchId, rate]
    );

    const car = rows[0];
    await pool.query(
      `INSERT INTO car_rate_history (car_id, rate, valid_from, created_by) VALUES ($1, $2, '2000-01-01', $3)`,
      [car.id, rate, req.user.id]
    );
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
    const parsed = readCarFields(req.body);
    if (parsed.error) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: parsed.error[0], field: parsed.error[1] } });
    }
    const values = parsed.values;
    if (values.plate === '' || values.brand === null || values.model === null) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Госномер, марка и модель обязательны' } });
    }
    if (req.user.role === 'ADMIN' && req.body.owner_id !== undefined) {
      values.owner_id = req.body.owner_id ? Number(req.body.owner_id) : null;
    }

    const keys = Object.keys(values);
    if (keys.length === 0) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Нет данных для обновления' } });
    }
    const params = keys.map((k) => values[k]);
    const updates = keys.map((k, i) => `${k} = $${i + 1}`);
    params.push(carId);
    let where = `id = $${params.length} AND archived_at IS NULL`;
    if (req.user.role === 'DISPATCHER' && req.user.branch_id) {
      params.push(req.user.branch_id);
      where += ` AND branch_id = $${params.length}`;
    }

    const { rows } = await pool.query(
      `UPDATE cars SET ${updates.join(', ')} WHERE ${where} RETURNING *`,
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

// POST /:id/archive — Архивация автомобиля (только ADMIN)
router.post('/:id/archive', requireRole('ADMIN'), async (req, res) => {
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

// POST /:id/restore — Вернуть автомобиль из архива (только ADMIN)
router.post('/:id/restore', requireRole('ADMIN'), async (req, res) => {
  try {
    const carId = parseInt(req.params.id, 10);
    const { rows } = await pool.query(
      `UPDATE cars SET archived_at = NULL, status = 'FREE'
       WHERE id = $1 AND archived_at IS NOT NULL
       RETURNING id, plate, status`,
      [carId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Автомобиль не найден в архиве' } });
    }
    await writeAudit(pool, req.user.id, 'CAR_RESTORED', 'car', carId, null, rows[0], req.ip);
    res.json(rows[0]);
  } catch (err) {
    console.error('Ошибка восстановления автомобиля:', err);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Внутренняя ошибка сервера' } });
  }
});

// DELETE /:id — Полное удаление автомобиля вместе с его историей (только ADMIN)
router.delete('/:id', requireRole('ADMIN'), async (req, res) => {
  try {
    const carId = parseInt(req.params.id, 10);
    const { rows: cars } = await pool.query('SELECT id, plate, brand, model FROM cars WHERE id = $1', [carId]);
    if (cars.length === 0) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Автомобиль не найден' } });
    }
    const { rows: active } = await pool.query(
      'SELECT id FROM car_assignments WHERE car_id = $1 AND end_at IS NULL', [carId]
    );
    if (active.length > 0) {
      return res.status(409).json({ error: { code: 'CONFLICT', message: 'Сначала примите машину у водителя' } });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        'DELETE FROM payments WHERE daily_report_id IN (SELECT id FROM daily_reports WHERE car_id = $1)', [carId]
      );
      for (const table of ['daily_reports', 'car_photos', 'car_transactions', 'car_days_off',
        'car_rate_history', 'service_records', 'car_assignments']) {
        await client.query(`DELETE FROM ${table} WHERE car_id = $1`, [carId]);
      }
      await client.query('DELETE FROM cars WHERE id = $1', [carId]);
      await writeAudit(client, req.user.id, 'CAR_DELETED', 'car', carId, cars[0], null, req.ip);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
    res.json({ id: carId, deleted: true });
  } catch (err) {
    console.error('Ошибка удаления автомобиля:', err);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Внутренняя ошибка сервера' } });
  }
});

export default router;