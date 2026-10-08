-- ============================================
-- Тестовые данные для системы Qween
-- ============================================

-- Пароль для всех пользователей: Qween123!
-- Хеш создан через bcrypt (10 раундов)

-- 1. Создаем пользователей
INSERT INTO users (login, password_hash, full_name, phone, role, must_change_password) VALUES
('admin', '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'Администратор Системы', '+998901111111', 'ADMIN', FALSE),
('disp1', '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'Иванов Иван Иванович', '+998902222222', 'DISPATCHER', FALSE),
('driver1', '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'Петров Петр Петрович', '+998903333333', 'DRIVER', FALSE),
('owner1', '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'Сидоров Сидор Сидорович', '+998904444444', 'OWNER', FALSE);

-- 2. Создаем филиал
INSERT INTO branches (name, address) VALUES
('Ташкент, Центральный', 'ул. Амира Темура, 1');

-- 3. Привязываем диспетчера к филиалу
INSERT INTO user_branches (user_id, branch_id)
SELECT u.id, b.id FROM users u, branches b
WHERE u.login = 'disp1' AND b.name = 'Ташкент, Центральный';

-- 4. Создаем арендодателя
INSERT INTO owners (name, contact_person, phone, email) VALUES
('ООО "Автопарк"', 'Сидоров Сидор Сидорович', '+998904444444', 'info@autopark.uz');

-- 5. Создаем автомобиль
INSERT INTO cars (plate, brand, model, year, branch_id, owner_id, status)
SELECT '01A123BC', 'Chevrolet', 'Cobalt', 2022, b.id, o.id, 'FREE'
FROM branches b, owners o
WHERE b.name = 'Ташкент, Центральный' AND o.name = 'ООО "Автопарк"';

-- 6. Создаем водителя (связан с пользователем driver1)
INSERT INTO drivers (user_id, passport, license_no, license_expires, branch_id, status)
SELECT u.id, 'AA1234567', '90 AA 123456', '2028-12-31', b.id, 'FREE'
FROM users u, branches b
WHERE u.login = 'driver1' AND b.name = 'Ташкент, Центральный';

