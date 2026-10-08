import { Router } from 'express';
import { pool } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { writeAudit } from '../middleware/audit.js';
import { forgetReminderSettings } from '../carMoney.js';

const router = Router();

router.use(authenticate, requireRole('ADMIN'));

// Значения по умолчанию (используются, если запись отсутствует в БД)
const DEFAULTS = {
  company_name: 'RENT A CAR GTA',
  min_payment_amount: '1000',
  lock_duration_minutes: '30',
  max_failed_attempts: '5',
  currency: 'UZS',
  timezone: 'Asia/Tashkent',
  remind_days: '7',
  remind_km: '1000',
};

// GET / — Получить все настройки
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT key, value FROM settings');
    
    // Формируем объект настроек, подставляя значения по умолчанию для отсутствующих
    const settings = { ...DEFAULTS };
    rows.forEach((row) => {
      settings[row.key] = row.value;
    });

    res.json(settings);
  } catch (err) {
    // Если таблица ещё не создана, возвращаем значения по умолчанию
    if (err.code === '42P01') {
      return res.json(DEFAULTS);
    }
    console.error('Ошибка получения настроек:', err);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Внутренняя ошибка сервера' } });
  }
});

// PATCH / — Обновить настройки
router.patch('/', async (req, res) => {
  try {
    const updates = req.body;
    
    if (!updates || typeof updates !== 'object' || Object.keys(updates).length === 0) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Передайте объект с настройками' } });
    }

    // Проверяем, что все ключи допустимы
    const allowedKeys = Object.keys(DEFAULTS);
    const invalidKeys = Object.keys(updates).filter((k) => !allowedKeys.includes(k));
    if (invalidKeys.length > 0) {
      return res.status(400).json({
        error: { code: 'BAD_REQUEST', message: `Недопустимые ключи: ${invalidKeys.join(', ')}` }
      });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const oldSettings = { ...DEFAULTS };
      const { rows: existing } = await client.query('SELECT key, value FROM settings');
      existing.forEach((row) => { oldSettings[row.key] = row.value; });

      for (const [key, value] of Object.entries(updates)) {
        await client.query(
          `INSERT INTO settings (key, value) VALUES ($1, $2)
           ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
          [key, String(value)]
        );
      }

      await writeAudit(client, req.user.id, 'SETTINGS_UPDATED', 'settings', null,
        oldSettings, { ...oldSettings, ...updates }, req.ip);

      await client.query('COMMIT');
      forgetReminderSettings();

      // Возвращаем обновлённые настройки
      const { rows } = await client.query('SELECT key, value FROM settings');
      const settings = { ...DEFAULTS };
      rows.forEach((row) => { settings[row.key] = row.value; });

      res.json(settings);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    if (err.code === '42P01') {
      return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Таблица настроек не создана. Выполните миграцию БД.' } });
    }
    console.error('Ошибка обновления настроек:', err);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Внутренняя ошибка сервера' } });
  }
});

export default router;