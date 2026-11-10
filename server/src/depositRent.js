import { driverOnCarDay } from './carMoney.js';

/** ДД.ММ.ГГГГ из ISO-даты YYYY-MM-DD */
export function dayLabelRu(day) {
  if (!day || day.length < 10) return '';
  return `${day.slice(8, 10)}.${day.slice(5, 7)}.${day.slice(0, 4)}`;
}

export function parseDayLabelRu(reason) {
  const match = String(reason || '').match(/Закрыта аренда за (\d{2})\.(\d{2})\.(\d{4}) из депозита/);
  if (!match) return null;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

export async function findDriverIdForCarDay(db, carId, day) {
  const hit = await driverOnCarDay(db, carId, day);
  return hit ? Number(hit.driver_id) : null;
}

/** Убрать запись истории и вернуть сумму в депозит (без новой строки в истории). */
export async function undoDepositRentTx(db, tx) {
  if (!tx || tx.method !== 'DEPOSIT' || tx.kind !== 'INCOME') return null;
  const amount = Number(tx.amount || 0);
  if (!(amount > 0)) return null;

  const day = String(tx.tx_date || '').slice(0, 10);
  const driverId = tx.driver_id != null ? Number(tx.driver_id) : await findDriverIdForCarDay(db, tx.car_id, day);
  if (!driverId) return null;

  let histId = null;
  if (tx.id != null) {
    const { rows } = await db.query(
      'SELECT id FROM driver_deposit_history WHERE tx_id = $1 LIMIT 1',
      [tx.id]
    );
    histId = rows[0]?.id ?? null;
  }
  if (histId == null) {
    const label = dayLabelRu(day);
    const { rows } = await db.query(
      `SELECT id FROM driver_deposit_history
       WHERE driver_id = $1
         AND (COALESCE(old_value, 0) - new_value) = $2
         AND reason LIKE $3
       ORDER BY created_at DESC
       LIMIT 1`,
      [driverId, amount, `Закрыта аренда за ${label} из депозита%`]
    );
    histId = rows[0]?.id ?? null;
  }

  if (histId != null) {
    await db.query('DELETE FROM driver_deposit_history WHERE id = $1', [histId]);
  }
  await db.query('UPDATE drivers SET deposit = deposit + $1 WHERE id = $2', [amount, driverId]);
  return { driverId, amount, historyId: histId };
}

/**
 * Удаляет строки «Закрыта аренда … из депозита», для которых уже нет DEPOSIT-транзакции,
 * и возвращает суммы в депозит.
 */
export async function purgeOrphanDepositRentHistory(db) {
  const { rows: histories } = await db.query(
    `SELECT id, driver_id, old_value, new_value, reason, created_at, tx_id
     FROM driver_deposit_history
     WHERE reason LIKE 'Закрыта аренда за % из депозита%'
     ORDER BY created_at DESC`
  );

  const { rows: txs } = await db.query(
    `SELECT id, car_id, driver_id, amount, tx_date FROM car_transactions
     WHERE kind = 'INCOME' AND method = 'DEPOSIT' AND category = 'RENT'`
  );
  const txById = new Set(txs.map((tx) => Number(tx.id)));
  // Сколько DEPOSIT-операций у водителя за день и сумму: водитель — из операции или тот, кто ездил в этот день.
  const txBucket = new Map();
  for (const tx of txs) {
    const day = String(tx.tx_date || '').slice(0, 10);
    const amount = Number(tx.amount || 0);
    const driverId = tx.driver_id != null ? Number(tx.driver_id) : await findDriverIdForCarDay(db, tx.car_id, day);
    if (!driverId) continue;
    const key = `${driverId}|${day}|${amount}`;
    txBucket.set(key, (txBucket.get(key) || 0) + 1);
  }

  const groups = new Map();
  const removed = [];

  for (const h of histories) {
    if (h.tx_id != null && !txById.has(Number(h.tx_id))) {
      const amount = Number(h.old_value || 0) - Number(h.new_value || 0);
      if (amount > 0) {
        await db.query('DELETE FROM driver_deposit_history WHERE id = $1', [h.id]);
        await db.query('UPDATE drivers SET deposit = deposit + $1 WHERE id = $2', [amount, Number(h.driver_id)]);
        removed.push({ id: h.id, driverId: Number(h.driver_id), amount, via: 'tx_id' });
      }
      continue;
    }
    if (h.tx_id != null) continue; // живая связь — не трогаем

    const day = parseDayLabelRu(h.reason);
    const amount = Number(h.old_value || 0) - Number(h.new_value || 0);
    if (!day || !(amount > 0)) continue;
    const key = `${Number(h.driver_id)}|${day}|${amount}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(h);
  }

  for (const [key, list] of groups) {
    const [driverId, day, amountStr] = key.split('|');
    const amount = Number(amountStr);
    const txCount = txBucket.get(key) || 0;
    const drop = list.slice(txCount);
    for (const h of drop) {
      await db.query('DELETE FROM driver_deposit_history WHERE id = $1', [h.id]);
      await db.query('UPDATE drivers SET deposit = deposit + $1 WHERE id = $2', [amount, Number(driverId)]);
      removed.push({ id: h.id, driverId: Number(driverId), day, amount, via: 'match' });
    }
  }
  return removed;
}
