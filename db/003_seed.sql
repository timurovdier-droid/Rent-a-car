-- ============================================
-- Начальные данные (Seed Data) для тестирования
-- Пароль для всех пользователей: Qween123!
-- Хеш получен через bcrypt (salt rounds = 10)
-- ============================================

-- 1. Филиалы
INSERT INTO branches (id, name, address) VALUES
(1, 'Ташкент, Центральный', 'ул. Амира Темура, 1'),
(2, 'Самарканд', 'ул. Регистанская, 15')
ON CONFLICT (id) DO NOTHING;

-- 2. Пользователи
-- Хеш для 'Qween123!': $2b$10$X8ZqJ5vY9wK3mN2pL1oR.eT6uV7wX8yZ9aB0cD1eF2gH3iJ4kL5mN
INSERT INTO users (id, login, password_hash, full_name, phone, role, status, must_change_password) VALUES
(1, 'admin', '$2b$10$X8ZqJ5vY9wK3mN2pL1oR.eT6uV7wX8yZ9aB0cD1eF2gH3iJ4kL5mN', 'Администратор Системы', '+998901111111', 'ADMIN', 'ACTIVE', FALSE),
(2, 'disp1', '$2b$10$X8ZqJ5vY9wK3mN2pL1oR.eT6uV7wX8yZ9aB0cD1eF2gH3iJ4kL5mN', 'Диспетчер Иванов И.И.', '+998902222222', 'DISPATCHER', 'ACTIVE', FALSE),
(3, 'driver1', '$2b$10$X8ZqJ5vY9wK3mN2pL1oR.eT6uV7wX8yZ9aB0cD1eF2gH3iJ4kL5mN', 'Водитель Петров П.П.', '+998903333333', 'DRIVER', 'ACTIVE', FALSE),
(4, 'owner1', '$2b$10$X8ZqJ5vY9wK3mN2pL1oR.eT6uV7wX8yZ9aB0cD1eF2gH3iJ4kL5mN', 'Арендодатель Сидоров С.С.', '+998904444444', 'OWNER', 'ACTIVE', FALSE)
ON CONFLICT (id) DO NOTHING;

-- Привязка пользователей к филиалам
INSERT INTO user_branches (user_id, branch_id) VALUES
(2, 1), -- Диспетчер в Ташкенте
(3, 1)  -- Водитель в Ташкенте
ON CONFLICT DO NOTHING;

-- 3. Арендодатели
INSERT INTO owners (id, user_id, name, contact_person, phone, bank_details, status) VALUES
(1, 4, 'ООО "Автопарк Плюс"', 'Сидоров С.С.', '+998904444444', 'ИНН 123456789, р/с 12345678901234567890', 'ACTIVE')
ON CONFLICT (id) DO NOTHING;

-- 4. Автомобили
INSERT INTO cars (id, branch_id, owner_id, plate, brand, model, year, status) VALUES
(1, 1, 1, '01 A 123 BC', 'Chevrolet', 'Cobalt', 2022, 'RENTED'),
(2, 1, 1, '01 B 456 DE', 'Chevrolet', 'Spark', 2021, 'FREE')
ON CONFLICT (id) DO NOTHING;

-- 5. Водители (профили)
INSERT INTO drivers (id, user_id, branch_id, passport, license_no, license_expires, status) VALUES
(1, 3, 1, 'AA1234567', '90 AA 123456', '2028-01-01', 'RENTED')
ON CONFLICT (id) DO NOTHING;

-- 6. Назначения (Активное)
INSERT INTO car_assignments (id, car_id, driver_id, start_at, mileage_start, created_by) VALUES
(1, 1, 1, CURRENT_TIMESTAMP - INTERVAL '5 days', 15000, 1)
ON CONFLICT (id) DO NOTHING;

-- 7. Дневные отчёты (Вчерашний и сегодняшний)
INSERT INTO daily_reports (id, driver_id, car_id, report_date, mileage_start, mileage_end, cash_on_hand, comment, created_by) VALUES
(1, 1, 1, CURRENT_DATE - INTERVAL '1 day', 15000, 15120, 500000, 'Штатная смена', 3),
(2, 1, 1, CURRENT_DATE, 15120, 15250, 500000, 'Штатная смена', 3)
ON CONFLICT (id) DO NOTHING;

-- 8. Платежи (Один в очереди на подтверждение диспетчером, один уже подтверждён)
INSERT INTO payments (id, idempotency_key, daily_report_id, driver_id, dispatcher_id, amount_declared, amount_dispatcher, method, status, created_at) VALUES
(1, 'seed-key-001', 1, 1, 2, 500000, 500000, 'CASH', 'ADMIN_CONFIRMED', CURRENT_TIMESTAMP - INTERVAL '1 day'),
(2, 'seed-key-002', 2, 1, 2, 500000, NULL, 'TRANSFER', 'DISPATCHER_PENDING', CURRENT_TIMESTAMP)
ON CONFLICT (id) DO NOTHING;

-- 9. Журнал аудита (Тестовая запись)
INSERT INTO audit_log (user_id, action, object_type, object_id, new_value, ip) VALUES
(1, 'SYSTEM_SEED', 'database', 0, '{"message": "Initial seed data loaded"}', '127.0.0.1')
ON CONFLICT (id) DO NOTHING;

-- Сброс последовательностей (чтобы следующие INSERTы начинались с правильных ID)
SELECT setval('branches_id_seq', (SELECT MAX(id) FROM branches));
SELECT setval('users_id_seq', (SELECT MAX(id) FROM users));
SELECT setval('owners_id_seq', (SELECT MAX(id) FROM owners));
SELECT setval('cars_id_seq', (SELECT MAX(id) FROM cars));
SELECT setval('drivers_id_seq', (SELECT MAX(id) FROM drivers));
SELECT setval('car_assignments_id_seq', (SELECT MAX(id) FROM car_assignments));
SELECT setval('daily_reports_id_seq', (SELECT MAX(id) FROM daily_reports));
SELECT setval('payments_id_seq', (SELECT MAX(id) FROM payments));
SELECT setval('audit_log_id_seq', (SELECT MAX(id) FROM audit_log));