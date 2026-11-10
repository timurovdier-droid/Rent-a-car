import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@libsql/client';
import { computeAccruals, localDay, localToday } from '../src/carMoney.js';

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

const db = createClient({ url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN });
const carId = 9;
const a = await db.execute({ sql: 'SELECT * FROM car_assignments WHERE car_id = ?', args: [carId] });
const r = await db.execute({ sql: 'SELECT * FROM car_rate_history WHERE car_id = ? ORDER BY valid_from, id', args: [carId] });
const off = await db.execute({ sql: 'SELECT * FROM car_days_off WHERE car_id = ?', args: [carId] });

const inputs = {
  ids: [carId],
  assignments: a.rows.map((row) => ({ ...row, handed_over: 0 })),
  rates: r.rows,
  daysOff: off.rows,
};
const map = computeAccruals(inputs);
const days = map.get(carId).days;
console.log('today', localToday());
console.log('rates in db', r.rows.map((x) => ({ id: x.id, rate: x.rate, from: String(x.valid_from).slice(0, 10) })));
console.log('assign', a.rows.map((x) => ({ start: localDay(x.start_at), pay_from: x.pay_from })));
console.log('first days', days.slice(0, 10));
console.log('accrued_days', days.length, 'total', map.get(carId).total);
console.log('debt days approx', days.filter((d) => d.rate > 0).length, 'x', days[0]?.rate);
