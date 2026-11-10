import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { prepareQuery } from './db.js';
import { applyCarRate } from './carMoney.js';

async function makeDb(history) {
  const client = createClient({ url: ':memory:' });
  await client.execute(`CREATE TABLE cars (id INTEGER PRIMARY KEY, daily_rate INTEGER)`);
  await client.execute(`CREATE TABLE car_rate_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT, car_id INTEGER, rate INTEGER, valid_from TEXT, created_by INTEGER,
    created_at TEXT DEFAULT (datetime('now')))`);
  await client.execute(`INSERT INTO cars (id, daily_rate) VALUES (1, 0)`);
  for (const [from, rate] of history) {
    await client.execute({ sql: 'INSERT INTO car_rate_history (car_id, rate, valid_from) VALUES (1, ?, ?)', args: [rate, from] });
  }
  const db = {
    async query(sql, params) {
      const q = prepareQuery(sql, params);
      const res = await client.execute({ sql: q.sql, args: q.params });
      return { rows: res.rows.map((r) => ({ ...r })) };
    },
  };
  const rateOn = async (day) => {
    const { rows } = await db.query(
      `SELECT rate FROM car_rate_history WHERE car_id = 1 AND substr(valid_from, 1, 10) <= $1
       ORDER BY substr(valid_from, 1, 10) DESC, id DESC LIMIT 1`,
      [day]
    );
    return rows[0] ? Number(rows[0].rate) : 0;
  };
  return { db, rateOn };
}

test('за период задним числом: внутри новая цена, после периода — прежняя', async () => {
  const { db, rateOn } = await makeDb([['2026-10-01', 300000], ['2026-10-20', 350000]]);
  await applyCarRate(db, 1, 250000, '2026-10-10', { validTo: '2026-10-22' });
  assert.equal(await rateOn('2026-10-09'), 300000);
  assert.equal(await rateOn('2026-10-10'), 250000);
  assert.equal(await rateOn('2026-10-21'), 250000);
  assert.equal(await rateOn('2026-10-22'), 250000);
  assert.equal(await rateOn('2026-10-23'), 350000);
});

test('с даты и дальше задним числом заменяет более поздние ставки', async () => {
  const { db, rateOn } = await makeDb([['2026-10-01', 300000], ['2026-10-20', 350000]]);
  await applyCarRate(db, 1, 280000, '2026-10-05');
  assert.equal(await rateOn('2026-10-04'), 300000);
  assert.equal(await rateOn('2026-10-05'), 280000);
  assert.equal(await rateOn('2026-10-25'), 280000);
});

test('повторное изменение того же периода не оставляет мусора', async () => {
  const { db, rateOn } = await makeDb([['2026-10-01', 300000]]);
  await applyCarRate(db, 1, 250000, '2026-10-10', { validTo: '2026-10-12' });
  await applyCarRate(db, 1, 200000, '2026-10-10', { validTo: '2026-10-12' });
  assert.equal(await rateOn('2026-10-11'), 200000);
  assert.equal(await rateOn('2026-10-13'), 300000);
});

test('только один день по-прежнему работает', async () => {
  const { db, rateOn } = await makeDb([['2026-10-01', 300000]]);
  await applyCarRate(db, 1, 100000, '2026-10-15', { onlyDay: true });
  assert.equal(await rateOn('2026-10-14'), 300000);
  assert.equal(await rateOn('2026-10-15'), 100000);
  assert.equal(await rateOn('2026-10-16'), 300000);
});
