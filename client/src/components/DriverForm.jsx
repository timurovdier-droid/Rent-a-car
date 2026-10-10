import { useState } from 'react';
import { api, ApiError } from '../api';
import Modal from './Modal';
import MoneyInput from './MoneyInput';

export default function DriverForm({ driver, onClose, onSaved }) {
  const [form, setForm] = useState({
    full_name: driver?.full_name || '',
    phone: driver?.phone || '',
    passport: driver?.passport || '',
    license_no: driver?.license_no || '',
    pinfl: driver?.pinfl || '',
    login: driver?.login || '',
    password: '',
    deposit: '',
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const body = {
        full_name: form.full_name,
        phone: form.phone || null,
        passport: form.passport,
        license_no: form.license_no,
        pinfl: form.pinfl,
        login: form.login,
      };
      if (form.password) body.password = form.password;
      let saved;
      if (driver) {
        await api.patch(`/drivers/${driver.id}`, body);
        saved = { id: driver.id };
      } else {
        body.deposit = form.deposit || 0;
        saved = await api.post('/drivers', body);
      }
      onSaved(saved);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось сохранить');
      setSaving(false);
    }
  }

  return (
    <Modal title={driver ? 'Изменить водителя' : 'Новый водитель'} onClose={onClose} wide>
      <form onSubmit={submit}>
        <div className="field">
          <label className="field__label" htmlFor="df-name">ФИО *</label>
          <input id="df-name" className="field__input" value={form.full_name} onChange={set('full_name')} required placeholder="Иванов Иван Иванович" autoFocus />
        </div>
        <div className="form-grid">
          <div className="field">
            <label className="field__label" htmlFor="df-phone">Телефон</label>
            <input id="df-phone" className="field__input" type="tel" value={form.phone} onChange={set('phone')} placeholder="+998901234567" />
          </div>
          <div className="field">
            <label className="field__label" htmlFor="df-passport">Паспорт</label>
            <input id="df-passport" className="field__input" value={form.passport} onChange={set('passport')} placeholder="AA1234567" />
          </div>
          <div className="field">
            <label className="field__label" htmlFor="df-license">Водительское удостоверение</label>
            <input id="df-license" className="field__input" value={form.license_no} onChange={set('license_no')} placeholder="AF 1234567" />
          </div>
          <div className="field">
            <label className="field__label" htmlFor="df-pinfl">ПИНФЛ</label>
            <input
              id="df-pinfl"
              className="field__input"
              inputMode="numeric"
              value={form.pinfl}
              onChange={(e) => setForm({ ...form, pinfl: e.target.value.replace(/\D/g, '').slice(0, 14) })}
              placeholder="14 цифр"
              maxLength={14}
              pattern="\d{14}"
              title="ПИНФЛ — 14 цифр"
            />
          </div>
          <div className="field">
            <label className="field__label" htmlFor="df-login">Логин *</label>
            <input id="df-login" className="field__input" value={form.login} onChange={set('login')} required autoComplete="off" />
          </div>
          <div className="field">
            <label className="field__label" htmlFor="df-password">{driver ? 'Новый пароль' : 'Пароль *'}</label>
            <input
              id="df-password" className="field__input" type="text" value={form.password} onChange={set('password')}
              required={!driver} minLength={6} autoComplete="new-password" placeholder={driver ? 'оставьте пустым, если не меняете' : 'минимум 6 символов'}
            />
          </div>
          {!driver && (
            <div className="field">
              <label className="field__label" htmlFor="df-deposit">Депозит</label>
              <MoneyInput id="df-deposit" value={form.deposit} onChange={(v) => setForm({ ...form, deposit: v })} />
            </div>
          )}
        </div>
        <p className="muted small" style={{ marginTop: 0 }}>По этому логину и паролю водитель входит в свой кабинет «Моя аренда».</p>
        {error && <div className="notice notice--error">{error}</div>}
        <div className="form-actions">
          <button className="btn" type="submit" disabled={saving}>{saving ? 'Сохраняю…' : driver ? 'Сохранить' : 'Добавить водителя'}</button>
          <button className="btn btn--quiet" type="button" onClick={onClose}>Отмена</button>
        </div>
      </form>
    </Modal>
  );
}
