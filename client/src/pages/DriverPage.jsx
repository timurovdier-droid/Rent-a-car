import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../api';
import { useAuth } from '../auth';
import Plate from '../components/Plate';
import Modal from '../components/Modal';
import MoneyInput from '../components/MoneyInput';
import DriverForm from '../components/DriverForm';
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

export default function DriverPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [driver, setDriver] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);

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
    const texts = {
      archive: `Убрать ${driver.full_name} в архив?`,
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
          {!archived && !driver.car_id && <button className="btn btn--ghost" onClick={() => act('archive')}>В архив</button>}
          {archived && <button className="btn btn--quiet" onClick={() => act('restore')}>Вернуть из архива</button>}
          {isAdmin && !driver.car_id && <button className="btn btn--danger" onClick={() => act('delete')}>Удалить</button>}
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
              <div><dt>Логин</dt><dd>{driver.login}</dd></div>
              <div><dt>Филиал</dt><dd>{driver.branch_name || '—'}</dd></div>
              <div><dt>Добавлен</dt><dd>{fmtDateTime(driver.created_at)}</dd></div>
            </dl>
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

      {editing && <DriverForm driver={driver} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); load(); }} />}
      {depositOpen && <DepositModal driver={driver} onClose={() => setDepositOpen(false)} onDone={() => { setDepositOpen(false); load(); }} />}
    </div>
  );
}
