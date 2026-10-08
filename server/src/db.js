import { createClient } from '@libsql/client';
import bcrypt from 'bcryptjs';
import { config } from './config.js';
import { SCHEMA, SCHEMA_VERSION, SCHEMA_V2_COLUMNS, SCHEMA_V2_TABLES } from './schema.js';

let client;
let ready;

function getClient() {
  if (!client) {
    const options = { url: config.tursoUrl };
    if (config.tursoToken) options.authToken = config.tursoToken;
    client = createClient(options);
  }
  return client;
}

function translateDialect(sql) {
  let s = sql;
  s = s.replace(/\s+FOR\s+UPDATE\b/gi, '');
  s = s.replace(/\s+NULLS\s+(FIRST|LAST)\b/gi, '');
  s = s.replace(/::[a-zA-Z_][a-zA-Z0-9_]*/g, '');
  s = s.replace(
    /COUNT\(\s*DISTINCT\s+([\w.]+)\s*\)\s+FILTER\s*\(\s*WHERE\s+([\s\S]*?)\)/gi,
    'COUNT(DISTINCT CASE WHEN $2 THEN $1 END)'
  );
  s = s.replace(/CURRENT_DATE\s*\+\s*INTERVAL\s+'(\d+)\s+days?'/gi, "date('now', '+$1 days')");
  s = s.replace(/CURRENT_TIMESTAMP\s*-\s*INTERVAL\s+'(\d+)\s+days?'/gi, "datetime('now', '-$1 days')");
  s = s.replace(/CURRENT_TIMESTAMP\s*\+\s*INTERVAL\s+'(\d+)\s+days?'/gi, "datetime('now', '+$1 days')");
  s = s.replace(/now\(\)\s*\+\s*INTERVAL\s+'(\d+)\s+hours?'/gi, "datetime('now', '+$1 hours')");
  s = s.replace(/\(\s*\$(\d+)\s*\+\s*INTERVAL\s+'(\d+)\s+days?'\s*\)/gi, "datetime($$$1, '+$2 days')");
  s = s.replace(/\bnow\(\)/gi, "datetime('now')");
  s = s.replace(/\bTRUE\b/g, '1');
  s = s.replace(/\bFALSE\b/g, '0');
  s = s.replace(/\bILIKE\b/gi, 'LIKE');
  return s;
}

function normalize(value) {
  if (value === undefined) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'bigint') return Number(value);
  if (value instanceof Date) return value.toISOString().slice(0, 19).replace('T', ' ');
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) return JSON.stringify(value);
  return value;
}

export function prepareQuery(sql, params = []) {
  const translated = translateDialect(sql);
  const source = Array.isArray(params) ? params : [];
  const out = [];
  const re = /=\s*ANY\(\$(\d+)\)|\$(\d+)/gi;
  let last = 0;
  let result = '';
  let match;
  while ((match = re.exec(translated))) {
    result += translated.slice(last, match.index);
    if (match[1]) {
      const raw = source[Number(match[1]) - 1];
      const list = Array.isArray(raw) ? raw : [raw];
      if (!list.length) {
        result += 'IN (NULL)';
      } else {
        result += `IN (${list.map(() => '?').join(', ')})`;
        for (const value of list) out.push(normalize(value));
      }
    } else {
      result += '?';
      out.push(normalize(source[Number(match[2]) - 1]));
    }
    last = match.index + match[0].length;
  }
  result += translated.slice(last);
  return { sql: result, params: out };
}

function rowsOf(result) {
  return (result.rows || []).map((row) => {
    const obj = {};
    for (const key of Object.keys(row)) {
      const value = row[key];
      obj[key] = typeof value === 'bigint' ? Number(value) : value;
    }
    return obj;
  });
}

async function executeOn(executor, sql, params) {
  const text = String(sql || '').trim().toUpperCase();
  if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') {
    return { rows: [], control: text };
  }
  const prepared = prepareQuery(sql, params);
  try {
    const result = await executor.execute({ sql: prepared.sql, args: prepared.params });
    return { rows: rowsOf(result) };
  } catch (err) {
    if (/UNIQUE constraint failed/i.test(err.message || '')) err.code = '23505';
    throw err;
  }
}

class TxClient {
  constructor(db) {
    this.db = db;
    this.tx = null;
  }

  async query(sql, params) {
    const text = String(sql || '').trim().toUpperCase();
    if (text === 'BEGIN') {
      this.tx = await this.db.transaction('write');
      return { rows: [] };
    }
    if (text === 'COMMIT') {
      if (this.tx) await this.tx.commit();
      this.tx = null;
      return { rows: [] };
    }
    if (text === 'ROLLBACK') {
      if (this.tx) {
        try { await this.tx.rollback(); } catch { /* already closed */ }
      }
      this.tx = null;
      return { rows: [] };
    }
    return executeOn(this.tx || this.db, sql, params);
  }

  release() {}
}

let tail = Promise.resolve();

function lock() {
  let unlock;
  const gate = new Promise((resolve) => { unlock = resolve; });
  const prev = tail;
  tail = gate;
  return prev.then(() => unlock);
}

async function seedIfEmpty(db) {
  const count = await db.execute('SELECT COUNT(*) AS c FROM users');
  if (Number(count.rows[0].c) > 0) return;

  const hash = bcrypt.hashSync('Qween123!', 10);
  await db.executeMultiple(`
    INSERT INTO branches (id, name, address) VALUES
      (1, 'Ташкент, Центральный', 'ул. Амира Темура, 1'),
      (2, 'Самарканд', 'ул. Регистанская, 15');

    INSERT INTO users (id, login, password_hash, full_name, phone, role, status, must_change_password, token_version) VALUES
      (1, 'admin', '${hash}', 'Администратор Системы', '+998901111111', 'ADMIN', 'ACTIVE', 0, 0),
      (2, 'disp1', '${hash}', 'Диспетчер Иванов И.И.', '+998902222222', 'DISPATCHER', 'ACTIVE', 0, 0),
      (3, 'driver1', '${hash}', 'Водитель Петров П.П.', '+998903333333', 'DRIVER', 'ACTIVE', 0, 0),
      (4, 'owner1', '${hash}', 'Арендодатель Сидоров С.С.', '+998904444444', 'OWNER', 'ACTIVE', 0, 0);

    INSERT INTO user_branches (user_id, branch_id) VALUES (2, 1), (3, 1);

    INSERT INTO owners (id, user_id, name, contact_person, phone, bank_details, status) VALUES
      (1, 4, 'ООО "Автопарк Плюс"', 'Сидоров С.С.', '+998904444444', 'ИНН 123456789', 'ACTIVE');

    INSERT INTO cars (id, branch_id, owner_id, plate, brand, model, year, status) VALUES
      (1, 1, 1, '01 A 123 BC', 'Chevrolet', 'Cobalt', 2022, 'RENTED'),
      (2, 1, 1, '01 B 456 DE', 'Chevrolet', 'Spark', 2021, 'FREE');

    INSERT INTO drivers (id, user_id, branch_id, passport, license_no, license_expires, status) VALUES
      (1, 3, 1, 'AA1234567', '90 AA 123456', date('now', '+20 days'), 'RENTED');

    INSERT INTO car_assignments (id, car_id, driver_id, start_at, mileage_start, created_by) VALUES
      (1, 1, 1, datetime('now', '-5 days'), 15000, 1);

    INSERT INTO daily_reports (id, driver_id, car_id, report_date, mileage_start, mileage_end, cash_on_hand, comment, created_by) VALUES
      (1, 1, 1, date('now', '-1 day'), 15000, 15120, 500000, 'Штатная смена', 3),
      (2, 1, 1, date('now'), 15120, 15250, 500000, 'Штатная смена', 3);

    INSERT INTO payments (id, idempotency_key, daily_report_id, driver_id, dispatcher_id, amount_declared, amount_dispatcher, amount_admin, method, status, locked, created_at) VALUES
      (1, 'seed-key-001', 1, 1, 2, 500000, 500000, 500000, 'CASH', 'ADMIN_CONFIRMED', 1, datetime('now', '-1 day')),
      (2, 'seed-key-002', 2, 1, 2, 500000, NULL, NULL, 'TRANSFER', 'DISPATCHER_PENDING', 0, datetime('now', '-4 days'));

    INSERT INTO service_records (car_id, type, description, cost, status, scheduled_at, created_by) VALUES
      (2, 'OIL_CHANGE', 'Плановое ТО', 250000, 'SCHEDULED', date('now', '-2 days'), 2);

    INSERT INTO audit_log (user_id, action, object_type, object_id, new_value, ip) VALUES
      (1, 'SYSTEM_SEED', 'database', 0, '{"message":"Initial seed data loaded"}', '127.0.0.1');
  `);
}

async function upgradeToV2(db) {
  for (const [table, columns] of Object.entries(SCHEMA_V2_COLUMNS)) {
    const info = await db.execute(`SELECT name FROM pragma_table_info('${table}')`);
    const existing = new Set(info.rows.map((row) => row.name));
    for (const [column, type] of Object.entries(columns)) {
      if (!existing.has(column)) {
        await db.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
      }
    }
  }
  await db.executeMultiple(SCHEMA_V2_TABLES);
  await db.executeMultiple(`
    INSERT OR IGNORE INTO car_transactions
      (car_id, kind, category, amount, method, tx_date, comment, status, created_by, confirmed_by, confirmed_at, legacy_payment_id, created_at)
    SELECT dr.car_id, 'INCOME', 'RENT', COALESCE(p.amount_admin, p.amount_dispatcher, p.amount_declared),
           UPPER(COALESCE(p.method, p.payment_method, 'CASH')), date(p.created_at, '+5 hours'),
           'Перенесено из очереди платежей', 'CONFIRMED', p.dispatcher_id, p.admin_id,
           COALESCE(p.confirmed_at, p.created_at), p.id, p.created_at
    FROM payments p
    JOIN daily_reports dr ON dr.id = p.daily_report_id
    WHERE p.status = 'ADMIN_CONFIRMED';

    UPDATE cars SET status = 'FREE'
    WHERE status = 'SERVICE'
      AND NOT EXISTS (SELECT 1 FROM car_assignments ca WHERE ca.car_id = cars.id AND ca.end_at IS NULL);

    UPDATE cars SET mileage = (
      SELECT MAX(COALESCE(ca.mileage_end, ca.mileage_start)) FROM car_assignments ca WHERE ca.car_id = cars.id
    ) WHERE mileage IS NULL;

    INSERT INTO settings (key, value) VALUES ('schema_version', '${SCHEMA_VERSION}')
    ON CONFLICT (key) DO UPDATE SET value = excluded.value;
  `);
}

async function migrate() {
  const db = getClient();
  const info = await db.execute("SELECT name FROM pragma_table_info('car_assignments')");
  const columns = info.rows.map((row) => row.name);
  if (columns.length === 0) {
    await db.executeMultiple(SCHEMA);
  } else if (!columns.includes('mileage_end')) {
    await db.execute('ALTER TABLE car_assignments ADD COLUMN mileage_end INTEGER');
  }
  await seedIfEmpty(db);
  const version = await db.execute("SELECT value FROM settings WHERE key = 'schema_version'");
  if (Number(version.rows[0]?.value || 0) < SCHEMA_VERSION) {
    await upgradeToV2(db);
  }
  console.log(`База Qween готова (${config.tursoUrl.startsWith('file:') ? 'локальный файл' : 'Turso'})`);
}

export function initDb() {
  if (!ready) {
    ready = migrate().catch((err) => {
      ready = null;
      throw err;
    });
  }
  return ready;
}

export const pool = {
  async query(sql, params) {
    await initDb();
    const unlock = await lock();
    try {
      return await executeOn(getClient(), sql, params);
    } finally {
      unlock();
    }
  },

  async connect() {
    await initDb();
    const unlock = await lock();
    const tx = new TxClient(getClient());
    tx.release = () => unlock();
    return tx;
  },
};
