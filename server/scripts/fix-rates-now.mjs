import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@libsql/client';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const envText = readFileSync(resolve(root, '.env.local'), 'utf8');
const env = Object.fromEntries(
  envText.split(/\r?\n/)
    .filter((line) => line && !line.startsWith('#') && line.includes('='))
    .map((line) => {
      const i = line.indexOf('=');
      return [line.slice(0, i).trim(), line.slice(i + 1).trim().replace(/^"|"$/g, '')];
    })
);

const db = createClient({
  url: env.TURSO_DATABASE_URL,
  authToken: env.TURSO_AUTH_TOKEN,
});

function localDay(ts) {
  if (!ts) return null;
  const text = String(ts);
  const iso = /[zZ]|[+-]\d\d:?\d\d$/.test(text) ? text : `${text.replace(' ', 'T')}Z`;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getTime() + 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

const cars = await db.execute(
  `SELECT id, plate, brand, model, daily_rate FROM cars WHERE archived_at IS NULL ORDER BY id`
);

let fixed = 0;
for (const c of cars.rows) {
  const a = await db.execute({
    sql: 'SELECT MIN(start_at) AS start_at FROM car_assignments WHERE car_id = ?',
    args: [c.id],
  });
  const start = localDay(a.rows[0]?.start_at);
  if (!start) continue;

  const r = await db.execute({
    sql: `SELECT id, rate, valid_from FROM car_rate_history
          WHERE car_id = ? AND rate > 0
          ORDER BY substr(valid_from,1,10) ASC, id ASC LIMIT 1`,
    args: [c.id],
  });
  const first = r.rows[0];
  if (!first) continue;
  const from = String(first.valid_from).slice(0, 10);
  if (from <= start) {
    console.log('ok', c.plate, 'rate from', from, 'assign', start);
    continue;
  }
  await db.execute({
    sql: 'UPDATE car_rate_history SET valid_from = ? WHERE id = ?',
    args: [start, first.id],
  });
  fixed += 1;
  console.log('FIXED', c.plate, first.rate, from, '->', start);
}

console.log('fixed cars:', fixed);
