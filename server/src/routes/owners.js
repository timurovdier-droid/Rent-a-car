import { Router } from 'express';
import { pool } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { writeAudit } from '../middleware/audit.js';

const router = Router();

router.use(authenticate, requireRole('ADMIN'));

// GET / — Список арендодателей
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT o.id, o.name, o.contact_person, o.phone, o.email, o.bank_details,
             o.status, o.archived_at, o.created_at,
             COUNT(c.id) FILTER (WHERE c.archived_at IS NULL) AS active_cars_count
      FROM owners o
      LEFT JOIN cars c ON c.owner_id = o.id
      GROUP BY o.id
      ORDER BY o.archived_at ASC NULLS FIRST, o.name ASC
    `);
    res.json(rows);
  } catch (err) {
    console.error('Ошибка получения арендодателей:', err);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Внутренняя ошибка сервера' } });
  }
});

// GET /active — Только активные арендодатели (для выпадающих списков)
router.get('/active', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name FROM owners WHERE status = 'ACTIVE' ORDER BY name`
    );
    res.json(rows);
  } catch (err) {
    console.error('Ошибка получения активных арендодателей:', err);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Внутренняя ошибка сервера' } });
  }
});

// POST / — Создание арендодателя
router.post('/', async (req, res) => {
  try {
    const { name, contact_person, phone, email, bank_details } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Укажите название или ФИО', field: 'name' } });
    }
    if (!phone || !phone.trim()) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Укажите телефон', field: 'phone' } });
    }

    const { rows } = await pool.query(
      `INSERT INTO owners (name, contact_person, phone, email, bank_details, status)
       VALUES ($1, $2, $3, $4, $5, 'ACTIVE')
       RETURNING id, name, contact_person, phone, email, bank_details, status, created_at`,
      [name.trim(), contact_person || null, phone.trim(), email || null, bank_details || null]
    );

    await writeAudit(pool, req.user.id, 'OWNER_CREATED', 'owner', rows[0].id, null, rows[0], req.ip);

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Ошибка создания арендодателя:', err);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Внутренняя ошибка сервера' } });
  }
});

// PATCH /:id — Редактирование арендодателя
router.patch('/:id', async (req, res) => {
  try {
    const ownerId = parseInt(req.params.id, 10);
    const { name, contact_person, phone, email, bank_details } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Укажите название или ФИО', field: 'name' } });
    }
    if (!phone || !phone.trim()) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Укажите телефон', field: 'phone' } });
    }

    const { rows } = await pool.query(
      `UPDATE owners
       SET name = $1, contact_person = $2, phone = $3, email = $4, bank_details = $5
       WHERE id = $6 AND status != 'ARCHIVED'
       RETURNING id, name, contact_person, phone, email, bank_details, status`,
      [name.trim(), contact_person || null, phone.trim(), email || null, bank_details || null, ownerId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Арендодатель не найден или архивирован' } });
    }

    await writeAudit(pool, req.user.id, 'OWNER_UPDATED', 'owner', ownerId, null, rows[0], req.ip);

    res.json(rows[0]);
  } catch (err) {
    console.error('Ошибка редактирования арендодателя:', err);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Внутренняя ошибка сервера' } });
  }
});

// POST /:id/archive — Архивация арендодателя
router.post('/:id/archive', async (req, res) => {
  try {
    const ownerId = parseInt(req.params.id, 10);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Проверяем наличие активных автомобилей
      const { rows: cars } = await client.query(
        `SELECT COUNT(*) AS count FROM cars WHERE owner_id = $1 AND archived_at IS NULL`,
        [ownerId]
      );
      if (Number(cars[0].count) > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: { code: 'CONFLICT', message: `Нельзя архивировать: у арендодателя ${Number(cars[0].count)} активных автомобилей` }
        });
      }

      const { rows } = await client.query(
        `UPDATE owners SET status = 'ARCHIVED', archived_at = now()
         WHERE id = $1 AND status != 'ARCHIVED'
         RETURNING id, name, status`,
        [ownerId]
      );

      if (rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Арендодатель не найден или уже архивирован' } });
      }

      await writeAudit(client, req.user.id, 'OWNER_ARCHIVED', 'owner', ownerId, null, rows[0], req.ip);
      await client.query('COMMIT');

      res.json(rows[0]);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Ошибка архивации арендодателя:', err);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Внутренняя ошибка сервера' } });
  }
});

export default router;