import { Router } from 'express';
import { pool } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { writeAudit } from '../middleware/audit.js';

const router = Router();

router.use(authenticate);

// GET /my — Мои отчёты (только DRIVER)
router.get('/my', requireRole('DRIVER'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT dr.id, dr.report_date, dr.mileage_start, dr.mileage_end, 
              dr.cash_on_hand, dr.comment, dr.created_at,
              c.plate, c.brand, c.model
       FROM daily_reports dr
       JOIN cars c ON dr.car_id = c.id
       WHERE dr.driver_id = (SELECT id FROM drivers WHERE user_id = $1)
       ORDER BY dr.report_date DESC, dr.created_at DESC
       LIMIT 50`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error('Ошибка получения моих отчётов:', err);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Внутренняя ошибка сервера' } });
  }
});

// GET / — Отчёты филиала (DISPATCHER, ADMIN)
router.get('/', requireRole('DISPATCHER', 'ADMIN'), async (req, res) => {
  try {
    const { date, driver_id } = req.query;

    let query = `
      SELECT dr.id, dr.report_date, dr.mileage_start, dr.mileage_end, 
             dr.cash_on_hand, dr.comment, dr.created_at,
             c.plate, c.brand, c.model,
             u.full_name AS driver_name,
             b.name AS branch_name
      FROM daily_reports dr
      JOIN cars c ON dr.car_id = c.id
      JOIN drivers d ON dr.driver_id = d.id
      JOIN users u ON d.user_id = u.id
      JOIN branches b ON c.branch_id = b.id
      WHERE 1=1
    `;

    const params = [];
    let idx = 1;

    if (date) {
      params.push(date);
      query += ` AND dr.report_date = $${idx++}`;
    }

    if (driver_id) {
      params.push(driver_id);
      query += ` AND dr.driver_id = $${idx++}`;
    }

    // Диспетчер видит только свой филиал
    if (req.user.role === 'DISPATCHER' && req.user.branch_id) {
      params.push(req.user.branch_id);
      query += ` AND c.branch_id = $${idx++}`;
    }

    query += ' ORDER BY dr.report_date DESC, dr.created_at DESC LIMIT 200';

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error('Ошибка получения отчётов:', err);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Внутренняя ошибка сервера' } });
  }
});

// POST / — Создание отчёта (DRIVER — за себя, DISPATCHER/ADMIN — за любого водителя своего филиала)
router.post('/', async (req, res) => {
  try {
    const { driver_id, car_id, report_date, mileage_start, mileage_end, cash_on_hand, comment } = req.body;

    if (!car_id || !report_date || mileage_start === undefined || mileage_end === undefined) {
      return res.status(400).json({
        error: { code: 'BAD_REQUEST', message: 'Укажите car_id, report_date, mileage_start и mileage_end' }
      });
    }

    if (mileage_end < mileage_start) {
      return res.status(400).json({
        error: { code: 'BAD_REQUEST', message: 'Конечный пробег не может быть меньше начального', field: 'mileage_end' }
      });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      let targetDriverId = driver_id;

      if (req.user.role === 'DRIVER') {
        // Водитель может создавать отчёты только за себя
        const { rows: drivers } = await client.query(
          'SELECT id FROM drivers WHERE user_id = $1',
          [req.user.id]
        );
        if (drivers.length === 0) {
          await client.query('ROLLBACK');
          return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Профиль водителя не найден' } });
        }
        targetDriverId = drivers[0].id;

        // Проверяем, что автомобиль назначен этому водителю
        const { rows: assignments } = await client.query(
          `SELECT id FROM car_assignments 
           WHERE car_id = $1 AND driver_id = $2 AND end_at IS NULL`,
          [car_id, targetDriverId]
        );
        if (assignments.length === 0) {
          await client.query('ROLLBACK');
          return res.status(409).json({
            error: { code: 'CONFLICT', message: 'Этот автомобиль не назначен вам'
          }});
        }
      } else {
        // Диспетчер/админ должны указать driver_id
        if (!targetDriverId) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Укажите driver_id', field: 'driver_id' } });
        }
      }

      // Проверяем, что отчёт за эту дату ещё не создан
      const { rows: existing } = await client.query(
        `SELECT id FROM daily_reports 
         WHERE driver_id = $1 AND car_id = $2 AND report_date = $3`,
        [targetDriverId, car_id, report_date]
      );
      if (existing.length > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: { code: 'CONFLICT', message: 'Отчёт за эту дату уже существует' }
        });
      }

      const { rows } = await client.query(
        `INSERT INTO daily_reports 
         (driver_id, car_id, report_date, mileage_start, mileage_end, cash_on_hand, comment, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, report_date, mileage_start, mileage_end, cash_on_hand, created_at`,
        [targetDriverId, car_id, report_date, mileage_start, mileage_end, cash_on_hand || 0, comment || null, req.user.id]
      );

      await writeAudit(client, req.user.id, 'DAILY_REPORT_CREATED', 'daily_report', rows[0].id, null,
        { driver_id: targetDriverId, car_id, report_date, mileage_start, mileage_end, cash_on_hand },
        req.ip);

      await client.query('COMMIT');
      res.status(201).json(rows[0]);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Ошибка создания отчёта:', err);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Внутренняя ошибка сервера' } });
  }
});

export default router;