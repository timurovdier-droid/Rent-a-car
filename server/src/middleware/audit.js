import { pool } from '../db.js';

/**
 * Функция для записи в журнал аудита.
 * 
 * @param {import('pg').Pool | import('pg').PoolClient} db - Пул или клиент БД
 * @param {number} userId - ID пользователя
 * @param {string} action - Действие (например, 'CAR_CREATED')
 * @param {string} objectType - Тип объекта (например, 'car')
 * @param {number|null} objectId - ID объекта
 * @param {any} oldValue - Старое значение (JSON)
 * @param {any} newValue - Новое значение (JSON)
 * @param {string} ip - IP-адрес пользователя
 */
export async function writeAudit(db, userId, action, objectType, objectId, oldValue, newValue, ip) {
  try {
    await db.query(
      `INSERT INTO audit_log (user_id, action, object_type, object_id, old_value, new_value, ip)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        userId,
        action,
        objectType,
        objectId,
        oldValue ? JSON.stringify(oldValue) : null,
        newValue ? JSON.stringify(newValue) : null,
        ip || null,
      ]
    );
  } catch (err) {
    // Не блокируем основной запрос, если аудит не записался, но логируем ошибку
    console.error('Ошибка записи в журнал аудита:', err);
  }
}