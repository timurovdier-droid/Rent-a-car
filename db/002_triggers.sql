-- ============================================
-- 1. Защита от физического удаления записей
-- ============================================

-- Функция для предотвращения DELETE
CREATE OR REPLACE FUNCTION prevent_delete()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Физическое удаление запрещено. Используйте мягкое удаление через archived_at';
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Применяем к ключевым таблицам
CREATE TRIGGER trg_prevent_delete_users
    BEFORE DELETE ON users
    FOR EACH ROW EXECUTE FUNCTION prevent_delete();

CREATE TRIGGER trg_prevent_delete_cars
    BEFORE DELETE ON cars
    FOR EACH ROW EXECUTE FUNCTION prevent_delete();

CREATE TRIGGER trg_prevent_delete_drivers
    BEFORE DELETE ON drivers
    FOR EACH ROW EXECUTE FUNCTION prevent_delete();

CREATE TRIGGER trg_prevent_delete_owners
    BEFORE DELETE ON owners
    FOR EACH ROW EXECUTE FUNCTION prevent_delete();

CREATE TRIGGER trg_prevent_delete_payments
    BEFORE DELETE ON payments
    FOR EACH ROW EXECUTE FUNCTION prevent_delete();

CREATE TRIGGER trg_prevent_delete_daily_reports
    BEFORE DELETE ON daily_reports
    FOR EACH ROW EXECUTE FUNCTION prevent_delete();

CREATE TRIGGER trg_prevent_delete_car_assignments
    BEFORE DELETE ON car_assignments
    FOR EACH ROW EXECUTE FUNCTION prevent_delete();

-- ============================================
-- 2. Защита LOCKED-платежей от изменений
-- ============================================

CREATE OR REPLACE FUNCTION protect_locked_payments()
RETURNS TRIGGER AS $$
BEGIN
    -- Если платёж заблокирован, запрещаем изменения (кроме установки locked=true)
    IF OLD.locked = TRUE AND NEW.locked = TRUE AND OLD.status = NEW.status THEN
        -- Разрешаем только установку locked=true из false
        IF OLD.locked = FALSE AND NEW.locked = TRUE THEN
            RETURN NEW;
        END IF;
        RAISE EXCEPTION 'Заблокированный платёж не может быть изменён';
    END IF;
    
    -- Разрешаем установку locked=true
    IF OLD.locked = FALSE AND NEW.locked = TRUE THEN
        RETURN NEW;
    END IF;
    
    -- Если пытаемся снять блокировку
    IF OLD.locked = TRUE AND NEW.locked = FALSE THEN
        RAISE EXCEPTION 'Нельзя снять блокировку с платежа';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_protect_locked_payments
    BEFORE UPDATE ON payments
    FOR EACH ROW EXECUTE FUNCTION protect_locked_payments();

-- ============================================
-- 3. Append-only для audit_log
-- ============================================

CREATE OR REPLACE FUNCTION prevent_audit_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Журнал аудита доступен только для добавления записей';
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_prevent_audit_update
    BEFORE UPDATE ON audit_log
    FOR EACH ROW EXECUTE FUNCTION prevent_audit_modification();

CREATE TRIGGER trg_prevent_audit_delete
    BEFORE DELETE ON audit_log
    FOR EACH ROW EXECUTE FUNCTION prevent_audit_modification();

-- ============================================
-- 4. Автоматическая блокировка после 5 неудачных попыток входа
-- ============================================

CREATE OR REPLACE FUNCTION lock_user_after_failed_attempts()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.failed_login_attempts >= 5 AND OLD.failed_login_attempts < 5 THEN
        NEW.locked_until = CURRENT_TIMESTAMP + INTERVAL '30 minutes';
        NEW.status = 'LOCKED';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_auto_lock_user
    BEFORE UPDATE OF failed_login_attempts ON users
    FOR EACH ROW EXECUTE FUNCTION lock_user_after_failed_attempts();

-- ============================================
-- 5. Проверка, что водитель и автомобиль в одном филиале при создании назначения
-- ============================================

CREATE OR REPLACE FUNCTION validate_assignment_branch()
RETURNS TRIGGER AS $$
DECLARE
    car_branch_id INT;
    driver_branch_id INT;
BEGIN
    SELECT branch_id INTO car_branch_id FROM cars WHERE id = NEW.car_id;
    SELECT branch_id INTO driver_branch_id FROM drivers WHERE id = NEW.driver_id;
    
    IF car_branch_id IS DISTINCT FROM driver_branch_id THEN
        RAISE EXCEPTION 'Автомобиль и водитель должны быть в одном филиале';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_assignment_branch
    BEFORE INSERT ON car_assignments
    FOR EACH ROW EXECUTE FUNCTION validate_assignment_branch();

-- ============================================
-- 6. Защита от создания платежа без активного назначения
-- ============================================

CREATE OR REPLACE FUNCTION validate_payment_has_assignment()
RETURNS TRIGGER AS $$
DECLARE
    assignment_count INT;
BEGIN
    SELECT COUNT(*) INTO assignment_count
    FROM car_assignments ca
    JOIN daily_reports dr ON ca.car_id = dr.car_id AND ca.driver_id = dr.driver_id
    WHERE dr.id = NEW.daily_report_id
      AND ca.end_at IS NULL;
    
    IF assignment_count = 0 THEN
        RAISE EXCEPTION 'Платёж можно создать только при активном назначении';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_payment_assignment
    BEFORE INSERT ON payments
    FOR EACH ROW EXECUTE FUNCTION validate_payment_has_assignment();