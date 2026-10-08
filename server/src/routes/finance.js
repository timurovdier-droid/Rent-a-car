import { Router } from 'express';
import { pool } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';

const router = Router();

router.use(authenticate);

// GET /finance/summary — Общая финансовая сводка (только ADMIN)
router.get('/summary', requireRole('ADMIN'), async (req, res) => {
  try {
    const { from, to } = req.query;
    
    let query = `
      SELECT 
        COUNT(*) AS total_payments,
        SUM(p.amount_admin) AS total_confirmed,
        SUM(CASE WHEN p.status = 'ADMIN_CONFIRMED' THEN p.amount_admin ELSE 0 END) AS confirmed_amount,
        SUM(CASE WHEN p.status = 'DISPATCHER_PENDING' THEN p.amount_declared ELSE 0 END) AS pending_dispatcher,
        SUM(CASE WHEN p.status = 'ADMIN_PENDING' THEN p.amount_dispatcher ELSE 0 END) AS pending_admin
      FROM payments p
      WHERE 1=1
    `;
    
    const params = [];
    
    if (from) {
      params.push(from);
      query += ` AND p.created_at >= $${params.length}`;
    }
    if (to) {
      params.push(to);
      query += ` AND p.created_at <= $${params.length}`;
    }

    const { rows } = await pool.query(query, params);
    res.json(rows[0]);
  } catch (err) {
    console.error('Ошибка получения финансовой сводки:', err);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Внутренняя ошибка сервера' } });
  }
});

// GET /finance/owner-summary — Финансовая сводка по арендодателю (ADMIN или OWNER)
router.get('/owner-summary', requireRole('ADMIN', 'OWNER'), async (req, res) => {
  try {
    const { from, to, owner_id } = req.query;
    
    // Если роль OWNER, берём только его данные
    let targetOwnerId = owner_id;
    if (req.user.role === 'OWNER') {
      const { rows: owners } = await pool.query(
        'SELECT id FROM owners WHERE user_id = $1',
        [req.user.id]
      );
      if (owners.length === 0) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Арендодатель не найден' } });
      }
      targetOwnerId = owners[0].id;
    }

    if (!targetOwnerId) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Укажите owner_id' } });
    }

    let query = `
      SELECT 
        c.id AS car_id,
        c.plate,
        c.brand,
        c.model,
        COUNT(p.id) AS payments_count,
        COALESCE(SUM(p.amount_admin), 0) AS total_amount,
        COALESCE(SUM(CASE WHEN p.status = 'ADMIN_CONFIRMED' THEN p.amount_admin ELSE 0 END), 0) AS confirmed_amount
      FROM cars c
      LEFT JOIN daily_reports dr ON c.id = dr.car_id
      LEFT JOIN payments p ON dr.id = p.daily_report_id
      WHERE c.owner_id = $1
        AND c.archived_at IS NULL
    `;
    
    const params = [targetOwnerId];
    let paramIndex = 2;

    if (from) {
      params.push(from);
      query += ` AND p.created_at >= $${paramIndex}`;
      paramIndex++;
    }
    if (to) {
      params.push(to);
      query += ` AND p.created_at <= $${paramIndex}`;
      paramIndex++;
    }

    query += ' GROUP BY c.id, c.plate, c.brand, c.model ORDER BY c.plate';

    const { rows } = await pool.query(query, params);

    // Получаем информацию об арендодателе
    const { rows: ownerInfo } = await pool.query(
      'SELECT id, name, contact_person, phone FROM owners WHERE id = $1',
      [targetOwnerId]
    );

    const totalAmount = rows.reduce((sum, row) => sum + Number(row.confirmed_amount), 0);

    res.json({
      owner: ownerInfo[0],
      cars: rows,
      total_amount: totalAmount,
      period: { from, to }
    });
  } catch (err) {
    console.error('Ошибка получения сводки арендодателя:', err);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Внутренняя ошибка сервера' } });
  }
});

// GET /finance/owners-list — Список арендодателей с суммами (только ADMIN)
router.get('/owners-list', requireRole('ADMIN'), async (req, res) => {
  try {
    const { from, to } = req.query;

    let query = `
      SELECT 
        o.id,
        o.name,
        o.phone,
        COUNT(DISTINCT c.id) AS cars_count,
        COALESCE(SUM(p.amount_admin), 0) AS total_amount
      FROM owners o
      LEFT JOIN cars c ON o.id = c.owner_id AND c.archived_at IS NULL
      LEFT JOIN daily_reports dr ON c.id = dr.car_id
      LEFT JOIN payments p ON dr.id = p.daily_report_id AND p.status = 'ADMIN_CONFIRMED'
      WHERE o.status != 'ARCHIVED'
    `;

    const params = [];
    let paramIndex = 1;

    if (from) {
      params.push(from);
      query += ` AND p.created_at >= $${paramIndex}`;
      paramIndex++;
    }
    if (to) {
      params.push(to);
      query += ` AND p.created_at <= $${paramIndex}`;
      paramIndex++;
    }

    query += ' GROUP BY o.id, o.name, o.phone ORDER BY o.name';

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error('Ошибка получения списка арендодателей с суммами:', err);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Внутренняя ошибка сервера' } });
  }
});

export default router;