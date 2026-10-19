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

const raw = createClient({
  url: env.TURSO_DATABASE_URL,
  authToken: env.TURSO_AUTH_TOKEN,
});

const db = {
  async query(sql, params = []) {
    const text = sql.replace(/\$(\d+)/g, '?');
    const result = await raw.execute({ sql: text, args: params });
    return { rows: result.rows || [] };
  },
};

const cols = await raw.execute("SELECT name FROM pragma_table_info('driver_deposit_history')");
if (![...cols.rows].some((r) => r.name === 'tx_id')) {
  await raw.execute('ALTER TABLE driver_deposit_history ADD COLUMN tx_id INTEGER');
  console.log('Added tx_id column');
}

const { purgeOrphanDepositRentHistory } = await import('../src/depositRent.js');
const removed = await purgeOrphanDepositRentHistory(db);
console.log(`Removed ${removed.length} orphan deposit history rows`);
for (const row of removed) {
  console.log(' -', row);
}
process.exit(0);
