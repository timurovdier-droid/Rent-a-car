import { Router } from 'express';
import { pool } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { writeAudit } from '../middleware/audit.js';

const router = Router();

router.use(authenticate, requireRole('ADMIN'));

// GET / — Список филиалов (включая архивные)
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT b.id, b.name, b.address, b.archived_at, b.created_at,
             COUNT(DISTINCT c.id) FILTER (WHERE c.archived_at IS NULL) AS active_cars,
             COUNT(DISTINCT d.id) FILTER (WHERE d.archived_at IS NULL) AS active_drivers,
             COUNT(DISTINCT ub.user_id) FILTER (WHERE u.role = 'DISPATCHER' AND u.status = 'ACTIVE') AS active_dispatchers
      FROM branches b
      LEFT JOIN cars c ON c.branch_id = b.id
      LEFT JOIN drivers d ON d.branch_id = b.id
      LEFT JOIN user_branches ub ON ub.branch_id = b.id
      LEFT JOIN users u ON u.id = ub.user_id
      GROUP BY b.id
      ORDER BY b.archived_at ASC NULLS FIRST, b.name ASC
    `);
    res.json(rows);
  } catch (err) {
    console.error('Ошибка получения филиалов:', err);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Внутренняя ошибка сервера' } });
  }
});

// GET /active — Только активные филиалы (для выпадающих списков)
router.get('/active', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name FROM branches WHERE archived_at IS NULL ORDER BY name`,
    );
    res.json(rows);
  } catch (err) {
    console.error('Ошибка получения активных филиалов:', err);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Внутренняя ошибка сервера' } });
  }
});

// POST / — Создание филиала
router.post('/', async (req, res) => {
  try {
    const { name, address } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Укажите название филиала', field: 'name' } });
    }

    const { rows } = await pool.query(
      `INSERT INTO branches (name, address)
       VALUES ($1, $2)
       RETURNING id, name, address, created_at`,
      [name.trim(), address || null]
    );

    await writeAudit(pool, req.user.id, 'BRANCH_CREATED', 'branch', rows[0].id, null, rows[0], req.ip);

    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: { code: 'CONFLICT', message: 'Филиал с таким названием уже существует' } });
    }
    console.error('Ошибка создания филиала:', err);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Внутренняя ошибка сервера' } });
  }
});

// PATCH /:id — Редактирование филиала
router.patch('/:id', async (req, res) => {
  try {
    const branchId = parseInt(req.params.id, 10);
    const { name, address } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Укажите название филиала', field: 'name' } });
    }

    const { rows } = await pool.query(
      `UPDATE branches
       SET name = $1, address = $2
       WHERE id = $3 AND archived_at IS NULL
       RETURNING id, name, address`,
      [name.trim(), address || null, branchId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Филиал не найден или архивирован' } });
    }

    await writeAudit(pool, req.user.id, 'BRANCH_UPDATED', 'branch', branchId, null, rows[0], req.ip);

    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: { code: 'CONFLICT', message: 'Филиал с таким названием уже существует' } });
    }
    console.error('Ошибка редактирования филиала:', err);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Внутренняя ошибка сервера' } });
  }
});

// POST /:id/archive — Архивация филиала
router.post('/:id/archive', async (req, res) => {
  try {
    const branchId = parseInt(req.params.id, 10);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Проверяем наличие активных связей
      const { rows: cars } = await client.query(
        `SELECT COUNT(*) FROM cars WHERE branch_id = $1 AND archived_at IS NULL`,
        [branchId]
      );
      if (Number(cars[0].count) > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: { code: 'CONFLICT', message: `Нельзя архивировать: в филиале ${Number(cars[0].count)} активных автомобилей` }
        });
      }

      const { rows: drivers } = await client.query(
        `SELECT COUNT(*) FROM drivers WHERE branch_id = $1 AND archived_at IS NULL`,
        [branchId]
      );
      if (Number(drivers[0].count) > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: { code: 'CONFLICT', message: `Нельзя архивировать: в филиале ${Number(drivers[0].count)} активных водителей` }
        });
      }

      const { rows: dispatchers } = await client.query(
        `SELECT COUNT(*) FROM user_branches ub
         JOIN users u ON u.id = ub.user_id
         WHERE ub.branch_id = $1 AND u.role = 'DISPATCHER' AND u.status = 'ACTIVE'`,
        [branchId]
      );
      if (Number(dispatchers[0].count) > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: { code: 'CONFLICT', message: `Нельзя архивировать: в филиале ${Number(dispatchers[0].count)} активных диспетчеров` }
        });
      }

      const { rows } = await client.query(
        `UPDATE branches SET archived_at = now()
         WHERE id = $1 AND archived_at IS NULL
         RETURNING id, name`,
        [branchId]
      );

      if (rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Филиал не найден или уже архивирован' } });
      }

      await writeAudit(client, req.user.id, 'BRANCH_ARCHIVED', 'branch', branchId, null, rows[0], req.ip);
      await client.query('COMMIT');

      res.json(rows[0]);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Ошибка архивации филиала:', err);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Внутренняя ошибка сервера' } });
  }
});

export default router;