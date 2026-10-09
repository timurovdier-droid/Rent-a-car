import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../api';
import { useAuth } from '../auth';
import Plate from '../components/Plate';
import Modal from '../components/Modal';
import MoneyInput from '../components/MoneyInput';
import DriverForm from '../components/DriverForm';
import DriverLedger from '../components/DriverLedger';
import DriverRentStatus from '../components/RentStatus';
import { fmtMoney, fmtNumber, fmtDay, fmtDateTime, localDayOf, initials } from '../labels';

const errText = (err, fallback) => (err instanceof ApiError ? err.message : fallback);

function DepositModal({ driver, onClose, onDone }) {
  const [value, setValue] = useState(String(driver.deposit || 0));
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.post(`/drivers/${driver.id}/deposit`, { deposit: value || 0, reason });
      onDone();
    } catch (err) {
      setError(errText(err, 'Не удалось изменить депозит'));
      setSaving(false);
    }
  }

  return (
    <Modal title="Изменить депозит" onClose={onClose}>
      <form onSubmit={submit}>
        <p className="muted" style={{ marginTop: 0 }}>Сейчас: <b>{fmtMoney(driver.deposit)} сум</b></p>
        <div className="field">
          <label className="field__label" htmlFor="dp-value">Новая сумма депозита</label>
          <MoneyInput id="dp-value" value={value} onChange={setValue} autoFocus />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="dp-reason">Причина</label>
          <input id="dp-reason" className="field__input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="например: доплатил наличными / удержали за ремонт" maxLength={300} />
        </div>
        {error && <div className="notice notice--error">{error}</div>}
        <div className="form-actions">
          <button className="btn" type="submit" disabled={saving}>{saving ? 'Сохраняю…' : 'Сохранить'}</button>
          <button className="btn btn--quiet" type="button" onClick={onClose}>Отмена</button>
        </div>
      </form>
    </Modal>
  );
}

function makePassword() {
  const letters = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const pick = (set, n) => Array.from(crypto.getRandomValues(new Uint32Array(n)), (v) => set[v % set.length]).join('');
  return `${pick(letters, 4)}${pick(digits, 4)}`;
}

function PasswordModal({ driver, onClose, onDone }) {
  const [login, setLogin] = useState(driver.login || '');
  const [password, setPassword] = useState(makePassword);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = await api.put(`/drivers/${driver.id}/password`, { login: login.trim(), password });
      setSaved({ login: res.login, password });
      onDone();
    } catch (err) {
      setError(errText(err, 'Не удалось задать пароль'));
    } finally {
      setSaving(false);
    }
  }

  if (saved) {
    return (
      <Modal title="Пароль задан" onClose={onClose}>
        <p className="muted" style={{ marginTop: 0 }}>Передайте водителю. При первом входе сайт попросит его придумать свой пароль.</p>
        <dl className="kv">
          <div><dt>Сайт</dt><dd>{window.location.origin}</dd></div>
          <div><dt>Логин</dt><dd><b>{saved.login}</b></dd></div>
          <div><dt>Пароль</dt><dd><b>{saved.password}</b></dd></div>
        </dl>
        <div className="form-actions">
          <button className="btn" type="button" onClick={onClose}>Готово</button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Вход в кабинет водителя" onClose={onClose}>
      <form onSubmit={submit}>
        <p className="muted" style={{ marginTop: 0 }}>
          В кабинете водитель видит свою машину, долг по аренде и оплаты по дням. Если долг есть, сайт напоминает ему каждый час.
        </p>
        <div className="field">
          <label className="field__label" htmlFor="pw-login">Логин</label>
          <input id="pw-login" className="field__input" value={login} onChange={(e) => setLogin(e.target.value)} required autoComplete="off" />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="pw-value">Временный пароль</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input id="pw-value" className="field__input" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required autoComplete="off" />
            <button className="btn btn--quiet" type="button" onClick={() => setPassword(makePassword())}>Другой</button>
          </div>
        </div>
        {error && <div className="notice notice--error">{error}</div>}
        <div className="form-actions">
          <button className="btn" type="submit" disabled={saving}>{saving ? 'Сохраняю…' : 'Задать пароль'}</button>
          <button className="btn btn--quiet" type="button" onClick={onClose}>Отмена</button>
        </div>
      </form>
    </Modal>
  );
}

export default function DriverPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [driver, setDriver] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [ledgerVersion, setLedgerVersion] = useState(0);

  const load = useCallback(async () => {
    try {
      setDriver(await api.get(`/drivers/${id}`));
      setError('');
    } catch (err) {
      setError(errText(err, 'Не удалось загрузить водителя'));
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function act(action) {
    if (action !== 'restore' && driver.car_id) {
      setError(`Сначала примите у водителя машину ${driver.car_plate} — это делается на странице машины, вкладка «Водитель»`);
      return;
    }
    const texts = {
      archive: `Убрать ${driver.full_name} в архив? Его можно будет вернуть на странице «Водители» → «Архив».`,
      restore: `Вернуть ${driver.full_name} из архива?`,
      delete: `Удалить ${driver.full_name} навсегда? Это действие нельзя отменить.`,
    };
    if (!window.confirm(texts[action])) return;
    try {
      if (action === 'delete') {
        await api.delete(`/drivers/${driver.id}`);
        navigate('/drivers');
        return;
      }
      await api.post(`/drivers/${driver.id}/${action}`);
      load();
    } catch (err) {
      setError(errText(err, 'Не получилось'));
    }
  }

  if (!driver) {
    return (
      <div>
        <Link to="/drivers" className="back-link">← Водители</Link>
        {error ? <div className="notice notice--error">{error}</div> : <div className="muted">Загрузка…</div>}
      </div>
    );
  }

  const archived = Boolean(driver.archived_at);

  return (
    <div>
      <Link to="/drivers" className="back-link">← Водители</Link>
      <div className="page-head">
        <div className="person__head">
          <div className={`avatar avatar--l ${archived ? 'avatar--muted' : ''}`}>{initials(driver.full_name)}</div>
          <div>
            <h1 className="page-title" style={{ margin: 0 }}>{driver.full_name}</h1>
            <div className="badges" style={{ marginTop: 6 }}>
              {archived && <span className="badge badge--muted">В архиве</span>}
              {driver.car_plate
                ? <Link to={`/cars/${driver.car_id}`} className="badge badge--wait" style={{ textDecoration: 'none' }}>На машине {driver.car_plate}</Link>
                : !archived && <span className="badge badge--ok">Свободен</span>}
            </div>
          </div>
        </div>
        <div className="form-actions">
          {!archived && <button className="btn btn--quiet" onClick={() => setEditing(true)}>Изменить данные</button>}
          {!archived && <button className="btn btn--ghost" onClick={() => act('archive')}>В архив</button>}
          {archived && <button className="btn btn--quiet" onClick={() => act('restore')}>Вернуть из архива</button>}
          {isAdmin && <button className="btn btn--danger" onClick={() => act('delete')}>Удалить</button>}
        </div>
      </div>

      {error && <div className="notice notice--error">{error}</div>}

      <div className="layout-2">
        <div>
          <div className="panel">
            <h3 className="panel__title">Данные</h3>
            <dl className="kv">
              <div><dt>Телефон</dt><dd>{driver.phone || '—'}</dd></div>
              <div><dt>Паспорт</dt><dd>{driver.passport || '—'}</dd></div>
              <div><dt>Водительское удостоверение</dt><dd>{driver.license_no || '—'}</dd></div>
              <div><dt>ВУ действует до</dt><dd>{fmtDay(driver.license_expires)}</dd></div>
              <div><dt>Добавлен</dt><dd>{fmtDateTime(driver.created_at)}</dd></div>
            </dl>
          </div>
          <div className="panel">
            <h3 className="panel__title">Вход в кабинет водителя</h3>
            <dl className="kv">
              <div><dt>Логин</dt><dd>{driver.login || '—'}</dd></div>
            </dl>
            {!archived && (
              <button className="btn btn--quiet btn--sm" style={{ marginTop: 10 }} onClick={() => setPasswordOpen(true)}>
                Задать пароль
              </button>
            )}
          </div>
          <div className="panel">
            <h3 className="panel__title">Машины</h3>
            {driver.assignments.length === 0 ? <p className="muted">Ещё не ездил</p> : driver.assignments.map((a) => (
              <Link key={a.id} to={`/cars/${a.car_id}`} className="car-card__row" style={{ padding: '10px 0', borderBottom: '1px solid var(--c-line)', color: 'inherit', textDecoration: 'none', alignItems: 'center' }}>
                <span><Plate value={a.plate} /> <span className="muted small">{a.brand} {a.model}</span></span>
                <span className="muted small" style={{ textAlign: 'right' }}>
                  {fmtDay(localDayOf(a.start_at))} — {a.end_at ? fmtDay(localDayOf(a.end_at)) : 'сейчас'}<br />
                  {fmtNumber(a.mileage_start)} → {a.mileage_end != null ? fmtNumber(a.mileage_end) : '…'} км
                </span>
              </Link>
            ))}
          </div>
        </div>
        <div className="panel">
          <h3 className="panel__title">Депозит</h3>
          <div className="stat__value" style={{ marginTop: 0 }}>{fmtMoney(driver.deposit)}<small>сум</small></div>
          {isAdmin && !archived && (
            <button className="btn btn--quiet btn--sm" style={{ marginTop: 10 }} onClick={() => setDepositOpen(true)}>Изменить депозит</button>
          )}
          {!isAdmin && <p className="muted small">Менять депозит может только администратор.</p>}
          <div style={{ marginTop: 16 }}>
            <div className="muted small" style={{ marginBottom: 6 }}>История изменений</div>
            {driver.deposit_history.length === 0 ? <p className="muted small">Изменений не было</p> : (
              <ul className="tx-list">
                {driver.deposit_history.map((h) => {
                  const up = Number(h.new_value) >= Number(h.old_value || 0);
                  return (
                    <li key={h.id} className="tx">
                      <div className={`tx__icon ${up ? 'tx__icon--in' : 'tx__icon--out'}`}>{up ? '+' : '−'}</div>
                      <div>
                        <div className="tx__title">{fmtMoney(h.old_value)} → {fmtMoney(h.new_value)}</div>
                        <div className="tx__meta">{fmtDateTime(h.created_at)} · {h.author_name || '—'}{h.reason ? ` · ${h.reason}` : ''}</div>
                      </div>
                      <div className="tx__right">
                        <span className={up ? 'num-plus' : 'num-minus'}>{up ? '+' : '−'}{fmtMoney(Math.abs(Number(h.new_value) - Number(h.old_value || 0)))}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <DriverRentStatus driverId={driver.id} version={ledgerVersion} />
      </div>

      <div className="panel" style={{ marginTop: 16 }}>
        <h3 className="panel__title">Оплаты и долг по дням</h3>
        <DriverLedger driverId={driver.id} canPay={!archived} onChanged={() => setLedgerVersion((v) => v + 1)} />
      </div>

      {editing && <DriverForm driver={driver} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); load(); }} />}
      {passwordOpen && <PasswordModal driver={driver} onClose={() => setPasswordOpen(false)} onDone={load} />}
      {depositOpen && <DepositModal driver={driver} onClose={() => setDepositOpen(false)} onDone={() => { setDepositOpen(false); load(); }} />}
    </div>
  );
}
