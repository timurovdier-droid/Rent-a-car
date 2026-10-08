-- ============================================
-- Qween: Полная схема базы данных
-- ============================================

-- Удаление таблиц в правильном порядке (для чистого переустановки)
DROP TABLE IF EXISTS audit_log CASCADE;
DROP TABLE IF EXISTS settings CASCADE;
DROP TABLE IF EXISTS service_records CASCADE;
DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS daily_reports CASCADE;
DROP TABLE IF EXISTS car_assignments CASCADE;
DROP TABLE IF EXISTS drivers CASCADE;
DROP TABLE IF EXISTS cars CASCADE;
DROP TABLE IF EXISTS owners CASCADE;
DROP TABLE IF EXISTS user_branches CASCADE;
DROP TABLE IF EXISTS branches CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- ============================================
-- 1. Пользователи системы
-- ============================================
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    login VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    role VARCHAR(20) NOT NULL CHECK (role IN ('ADMIN', 'DISPATCHER', 'DRIVER', 'OWNER')),
    status VARCHAR(20) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'LOCKED', 'ARCHIVED')),
    must_change_password BOOLEAN DEFAULT TRUE,
    failed_login_attempts INT DEFAULT 0,
    locked_until TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 2. Филиалы
-- ============================================
CREATE TABLE branches (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    address TEXT,
    archived_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Связь пользователей с филиалами (для диспетчеров)
CREATE TABLE user_branches (
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    branch_id INT REFERENCES branches(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, branch_id)
);

-- ============================================
-- 3. Арендодатели
-- ============================================
CREATE TABLE owners (
    id SERIAL PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    contact_person VARCHAR(100),
    phone VARCHAR(20) NOT NULL,
    email VARCHAR(100),
    bank_details TEXT,
    status VARCHAR(20) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ARCHIVED')),
    archived_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 4. Автомобили
-- ============================================
CREATE TABLE cars (
    id SERIAL PRIMARY KEY,
    plate VARCHAR(20) UNIQUE NOT NULL,
    brand VARCHAR(50) NOT NULL,
    model VARCHAR(50) NOT NULL,
    year INT,
    status VARCHAR(20) DEFAULT 'FREE' CHECK (status IN ('FREE', 'RENTED', 'SERVICE', 'ARCHIVED')),
    branch_id INT REFERENCES branches(id) ON DELETE RESTRICT,
    owner_id INT REFERENCES owners(id) ON DELETE RESTRICT,
    archived_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 5. Водители
-- ============================================
CREATE TABLE drivers (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE RESTRICT,
    passport VARCHAR(50),
    license_no VARCHAR(50),
    license_expires DATE,
    status VARCHAR(20) DEFAULT 'FREE' CHECK (status IN ('FREE', 'RENTED', 'ARCHIVED')),
    branch_id INT REFERENCES branches(id) ON DELETE RESTRICT,
    archived_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 6. Назначения (Аренда)
-- ============================================
CREATE TABLE car_assignments (
    id SERIAL PRIMARY KEY,
    car_id INT REFERENCES cars(id) ON DELETE RESTRICT,
    driver_id INT REFERENCES drivers(id) ON DELETE RESTRICT,
    start_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    end_at TIMESTAMP WITH TIME ZONE,
    start_mileage INT,
    end_mileage INT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_assignments_active ON car_assignments(car_id, driver_id) WHERE end_at IS NULL;

-- ============================================
-- 7. Дневные отчёты
-- ============================================
CREATE TABLE daily_reports (
    id SERIAL PRIMARY KEY,
    driver_id INT REFERENCES drivers(id) ON DELETE RESTRICT,
    car_id INT REFERENCES cars(id) ON DELETE RESTRICT,
    report_date DATE NOT NULL,
    mileage_start INT,
    mileage_end INT,
    fuel_liters NUMERIC(5,2),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(driver_id, report_date)
);

-- ============================================
-- 8. Платежи
-- ============================================
CREATE TABLE payments (
    id SERIAL PRIMARY KEY,
    daily_report_id INT REFERENCES daily_reports(id) ON DELETE RESTRICT,
    driver_id INT REFERENCES drivers(id) ON DELETE RESTRICT,
    amount_declared INT NOT NULL,
    amount_admin INT,
    status VARCHAR(30) DEFAULT 'DISPATCHER_PENDING' 
        CHECK (status IN ('DISPATCHER_PENDING', 'ADMIN_PENDING', 'ADMIN_CONFIRMED', 'REJECTED')),
    payment_method VARCHAR(50),
    receipt_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    confirmed_at TIMESTAMP WITH TIME ZONE
);

-- ============================================
-- 9. Техническое обслуживание
-- ============================================
CREATE TABLE service_records (
    id SERIAL PRIMARY KEY,
    car_id INT REFERENCES cars(id) ON DELETE RESTRICT,
    type VARCHAR(30) NOT NULL CHECK (type IN ('OIL_CHANGE', 'REPAIR', 'INSURANCE', 'INSPECTION', 'TIRE', 'OTHER')),
    description TEXT,
    cost INT DEFAULT 0,
    status VARCHAR(20) DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED', 'COMPLETED', 'CANCELLED')),
    scheduled_at DATE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_by INT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_service_records_car ON service_records(car_id, status);

-- ============================================
-- 10. Журнал аудита
-- ============================================
CREATE TABLE audit_log (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(50) NOT NULL,
    object_type VARCHAR(50),
    object_id INT,
    old_value JSONB,
    new_value JSONB,
    ip VARCHAR(45),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_log_action ON audit_log(action);
CREATE INDEX idx_audit_log_created ON audit_log(created_at DESC);

-- ============================================
-- 11. Системные настройки
-- ============================================
CREATE TABLE settings (
    key VARCHAR(50) PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Начальные значения настроек
INSERT INTO settings (key, value) VALUES
('company_name', 'Qween'),
('currency', 'UZS'),
('timezone', 'Asia/Tashkent'),
('min_payment_amount', '1000'),
('max_failed_attempts', '5'),
('lock_duration_minutes', '30')
ON CONFLICT (key) DO NOTHING;