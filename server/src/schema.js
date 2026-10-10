export const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  login TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  full_name TEXT NOT NULL,
  phone TEXT UNIQUE,
  email TEXT,
  role TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  must_change_password INTEGER NOT NULL DEFAULT 1,
  failed_login_attempts INTEGER NOT NULL DEFAULT 0,
  failed_logins INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  token_version INTEGER NOT NULL DEFAULT 0,
  comment TEXT,
  photo_url TEXT,
  last_login_at TEXT,
  archived_at TEXT,
  archived_by INTEGER,
  archive_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS branches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  address TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  archived_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_branches (
  user_id INTEGER NOT NULL,
  branch_id INTEGER NOT NULL,
  PRIMARY KEY (user_id, branch_id)
);

CREATE TABLE IF NOT EXISTS owners (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  name TEXT NOT NULL,
  contact_person TEXT,
  phone TEXT,
  email TEXT,
  bank_details TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  archived_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cars (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plate TEXT UNIQUE NOT NULL,
  brand TEXT NOT NULL,
  model TEXT NOT NULL,
  year INTEGER,
  color TEXT,
  vin TEXT,
  status TEXT NOT NULL DEFAULT 'FREE',
  branch_id INTEGER,
  owner_id INTEGER,
  archived_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS drivers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER UNIQUE,
  passport TEXT,
  license_no TEXT,
  license_expires TEXT,
  pinfl TEXT,
  status TEXT NOT NULL DEFAULT 'FREE',
  branch_id INTEGER,
  archived_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS car_assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  car_id INTEGER NOT NULL,
  driver_id INTEGER NOT NULL,
  start_at TEXT NOT NULL DEFAULT (datetime('now')),
  end_at TEXT,
  mileage_start INTEGER,
  mileage_end INTEGER,
  start_mileage INTEGER,
  end_mileage INTEGER,
  note TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS daily_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  driver_id INTEGER NOT NULL,
  car_id INTEGER NOT NULL,
  report_date TEXT NOT NULL,
  mileage_start INTEGER,
  mileage_end INTEGER,
  fuel_liters REAL,
  notes TEXT,
  cash_on_hand INTEGER,
  comment TEXT,
  created_by INTEGER,
  accrued INTEGER,
  status TEXT DEFAULT 'OPEN',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (driver_id, report_date)
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  idempotency_key TEXT UNIQUE,
  daily_report_id INTEGER,
  driver_id INTEGER,
  dispatcher_id INTEGER,
  amount_declared INTEGER NOT NULL,
  amount_dispatcher INTEGER,
  amount_admin INTEGER,
  method TEXT,
  payment_method TEXT,
  status TEXT NOT NULL DEFAULT 'DISPATCHER_PENDING',
  reject_reason TEXT,
  shortage_reason TEXT,
  receipt_url TEXT,
  admin_id INTEGER,
  locked INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  confirmed_at TEXT
);

CREATE TABLE IF NOT EXISTS service_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  car_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  description TEXT,
  cost INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'SCHEDULED',
  scheduled_at TEXT,
  completed_at TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  action TEXT NOT NULL,
  object_type TEXT,
  object_id INTEGER,
  old_value TEXT,
  new_value TEXT,
  ip TEXT,
  at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS password_resets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  temp_password_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  reset_by INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO settings (key, value) VALUES
  ('company_name', 'RENT A CAR GTA'),
  ('currency', 'UZS'),
  ('timezone', 'Asia/Tashkent'),
  ('min_payment_amount', '1000'),
  ('max_failed_attempts', '5'),
  ('lock_duration_minutes', '30')
ON CONFLICT (key) DO NOTHING;
`;

export const SCHEMA_EXTRA_TABLES = `
CREATE TABLE IF NOT EXISTS driver_waitlist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  wanted_car TEXT,
  comment TEXT,
  branch_id INTEGER,
  status TEXT NOT NULL DEFAULT 'WAITING',
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  closed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_driver_waitlist_status ON driver_waitlist (status, created_at);
CREATE TABLE IF NOT EXISTS driver_charges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  driver_id INTEGER NOT NULL,
  car_id INTEGER,
  kind TEXT NOT NULL,
  amount INTEGER NOT NULL,
  day TEXT NOT NULL,
  comment TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_driver_charges_driver ON driver_charges (driver_id);
CREATE TABLE IF NOT EXISTS driver_charge_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  charge_id INTEGER NOT NULL,
  amount INTEGER NOT NULL,
  method TEXT NOT NULL,
  day TEXT NOT NULL,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_driver_charge_payments_charge ON driver_charge_payments (charge_id);
`;

export const SCHEMA_VERSION = 4;

export const SCHEMA_V2_COLUMNS = {
  cars: {
    daily_rate: 'INTEGER NOT NULL DEFAULT 0',
    mileage: 'INTEGER',
    fuel_type: 'TEXT',
    insurance_expires: 'TEXT',
    inspection_expires: 'TEXT',
    photo_version: 'INTEGER NOT NULL DEFAULT 0',
  },
  drivers: {
    deposit: 'INTEGER NOT NULL DEFAULT 0',
    pinfl: 'TEXT',
  },
  service_records: {
    due_mileage: 'INTEGER',
    done_mileage: 'INTEGER',
    comment: 'TEXT',
  },
};

export const SCHEMA_V2_TABLES = `
CREATE TABLE IF NOT EXISTS car_photos (
  car_id INTEGER PRIMARY KEY REFERENCES cars(id),
  mime TEXT NOT NULL,
  data TEXT NOT NULL,
  updated_by INTEGER REFERENCES users(id),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS car_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  car_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  category TEXT NOT NULL,
  amount INTEGER NOT NULL,
  method TEXT,
  tx_date TEXT NOT NULL,
  comment TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING',
  created_by INTEGER,
  confirmed_by INTEGER,
  confirmed_at TEXT,
  service_record_id INTEGER,
  legacy_payment_id INTEGER UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_car_tx_car ON car_transactions (car_id, tx_date);
CREATE INDEX IF NOT EXISTS idx_car_tx_status ON car_transactions (status);

CREATE TABLE IF NOT EXISTS car_days_off (
  car_id INTEGER NOT NULL,
  day TEXT NOT NULL,
  reason TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (car_id, day)
);

CREATE TABLE IF NOT EXISTS car_rate_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  car_id INTEGER NOT NULL,
  rate INTEGER NOT NULL,
  valid_from TEXT NOT NULL,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_car_rate_car ON car_rate_history (car_id, valid_from);

CREATE TABLE IF NOT EXISTS driver_deposit_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  driver_id INTEGER NOT NULL,
  old_value INTEGER,
  new_value INTEGER NOT NULL,
  reason TEXT,
  changed_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO settings (key, value) VALUES
  ('remind_days', '7'),
  ('remind_km', '1000')
ON CONFLICT (key) DO NOTHING;
`;
