import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api';
import Modal from './Modal';
import MoneyInput from './MoneyInput';
import Plate from './Plate';
import { CHARGE_KINDS, CHARGE_LABELS, METHOD_LABELS, PAY_METHODS, fmtDay, fmtMoney, todayLocal } from '../labels';

const errText = (err, fallback) => (err instanceof ApiError ? err.message : fallback);

function driverCars(driver) {
  const seen = new Map();
  for (const a of driver.assignments) if (!seen.has(a.car_id)) seen.set(a.car_id, a);
  return [...seen.values()];
}

function ChargeModal({ driver, onClose, onDone }) {
  const cars = driverCars(driver);
  const [kind, setKind] = useState('REPAIR');
  const [amount, setAmount] = useState('');
  const [carId, setCarId] = useState(driver.car_id ? String(driver.car_id) : '');
  const [day, setDay] = useState(todayLocal());
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.post(`/drivers/${driver.id}/charges`, { kind, amount, car_id: carId || undefined, date: day, comment });
      onDone();
    } catch (err) {
      setError(errText(err, 'Не удалось записать долг'));
      setSaving(false);
    }
  }

  return (
    <Modal title="Записать долг" onClose={onClose}>
      <form onSubmit={submit}>
        <p className="muted" style={{ marginTop: 0 }}>
          Долг помимо аренды: ремонт, повреждение, штраф и т. п. Он не смешивается с арендой, водитель гасит его отдельно.
        </p>
        <div className="field">
          <span className="field__label">За что</span>
          <div className="chips">
            {CHARGE_KINDS.map(([v, l]) => (
              <button type="button" key={v} className={`chip ${kind === v ? 'chip--on' : ''}`} onClick={() => setKind(v)}>{l}</button>
            ))}
          </div>
        </div>
        <div className="form-grid">
          <div className="field">
            <label className="field__label" htmlFor="ch-amount">Сумма</label>
            <MoneyInput id="ch-amount" value={amount} onChange={setAmount} required autoFocus suffix="сум" />
          </div>
          <div className="field">
            <label className="field__label" htmlFor="ch-date">Дата</label>
            <input id="ch-date" className="field__input" type="date" value={day} max={todayLocal()} onChange={(e) => setDay(e.target.value)} required />
          </div>
        </div>
        <div className="field">
          <label className="field__label" htmlFor="ch-car">Машина</label>
          <select id="ch-car" className="field__input" value={carId} onChange={(e) => setCarId(e.target.value)}>
            <option value="">— без машины —</option>
            {cars.map((a) => (
              <option key={a.car_id} value={a.car_id}>{`${a.plate} · ${a.brand} ${a.model}`}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="field__label" htmlFor="ch-comment">{kind === 'OTHER' ? 'За что именно' : 'Комментарий'}</label>
          <input
            id="ch-comment"
            className="field__input"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="например: разбил фару, замена бампера"
            maxLength={300}
            required={kind === 'OTHER'}
          />
        </div>
        {error && <div className="notice notice--error">{error}</div>}
        <div className="form-actions">
          <button className="btn" type="submit" disabled={saving}>{saving ? 'Сохраняю…' : 'Записать долг'}</button>
          <button className="btn btn--quiet" type="button" onClick={onClose}>Отмена</button>
        </div>
      </form>
    </Modal>
  );
}

function PayModal({ driver, charge, isAdmin, onClose, onDone }) {
  const [amount, setAmount] = useState(String(charge.left));
  const [method, setMethod] = useState('CASH');
  const [day, setDay] = useState(todayLocal());
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const methods = isAdmin && Number(driver.deposit) > 0
    ? [...PAY_METHODS, ['DEPOSIT', `Из депозита (${fmtMoney(driver.deposit)})`]]
    : PAY_METHODS;

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.post(`/drivers/${driver.id}/charges/${charge.id}/payments`, { amount, method, date: day });
      onDone();
    } catch (err) {
      setError(errText(err, 'Не удалось записать оплату'));
      setSaving(false);
    }
  }

  return (
    <Modal title="Оплата долга" onClose={onClose}>
      <form onSubmit={submit}>
        <p className="muted" style={{ marginTop: 0 }}>
          {`${CHARGE_LABELS[charge.kind] || charge.kind}${charge.comment ? ` · ${charge.comment}` : ''}. Осталось: `}
          <b>{fmtMoney(charge.left)} сум</b>
        </p>
        <div className="field">
          <span className="field__label">Способ</span>
          <div className="chips">
            {methods.map(([v, l]) => (
              <button type="button" key={v} className={`chip ${method === v ? 'chip--on' : ''}`} onClick={() => setMethod(v)}>{l}</button>
            ))}
          </div>
        </div>
        <div className="form-grid">
          <div className="field">
            <label className="field__label" htmlFor="chp-amount">Сумма</label>
            <MoneyInput id="chp-amount" value={amount} onChange={setAmount} required autoFocus suffix="сум" />
          </div>
          <div className="field">
            <label className="field__label" htmlFor="chp-date">Дата</label>
            <input id="chp-date" className="field__input" type="date" value={day} max={todayLocal()} onChange={(e) => setDay(e.target.value)} required />
          </div>
        </div>
        {method === 'DEPOSIT' && <p className="muted small">Сумма спишется с депозита водителя, это попадёт в историю депозита.</p>}
        {error && <div className="notice notice--error">{error}</div>}
        <div className="form-actions">
          <button className="btn" type="submit" disabled={saving}>{saving ? 'Сохраняю…' : 'Принять оплату'}</button>
          <button className="btn btn--quiet" type="button" onClick={onClose}>Отмена</button>
        </div>
      </form>
    </Modal>
  );
}

export default function DriverCharges({ driver, isAdmin, onChanged }) {
  const [adding, setAdding] = useState(false);
  const [paying, setPaying] = useState(null);
  const [error, setError] = useState('');
  const charges = driver.charges || [];
  const total = charges.reduce((s, c) => s + c.left, 0);

  async function remove(url, text) {
    if (!window.confirm(text)) return;
    try {
      await api.delete(url);
      setError('');
      onChanged();
    } catch (err) {
      setError(errText(err, 'Не получилось удалить'));
    }
  }

  return (
    <div className="panel">
      <div className="panel__head">
        <h3 className="panel__title" style={{ margin: 0 }}>Прочие долги</h3>
        <button className="btn btn--quiet btn--sm" onClick={() => setAdding(true)}>+ Записать долг</button>
      </div>
      <div className={`stat__value ${total > 0 ? 'num-minus' : ''}`} style={{ marginTop: 0 }}>
        {fmtMoney(total)}<small>сум</small>
      </div>
      <p className="muted small" style={{ marginTop: 4 }}>Ремонт, повреждения, штрафы — отдельно от аренды.</p>
      {error && <div className="notice notice--error">{error}</div>}
      {charges.length === 0 ? <p className="muted small">Долгов нет</p> : (
        <ul className="charge-list">
          {charges.map((c) => (
            <li key={c.id} className={`charge ${c.left === 0 ? 'charge--closed' : ''}`}>
              <div className="charge__main">
                <div>
                  <div className="charge__title">
                    {CHARGE_LABELS[c.kind] || c.kind}
                    {c.left === 0 && <span className="badge badge--ok" style={{ marginLeft: 8 }}>Закрыт</span>}
                  </div>
                  <div className="charge__meta">
                    {fmtDay(c.day)}
                    {c.plate && <> · <Link to={`/cars/${c.car_id}`}><Plate value={c.plate} /></Link></>}
                    {c.comment ? ` · ${c.comment}` : ''}
                  </div>
                  <div className="charge__meta">{`Записал: ${c.author_name || '—'}`}</div>
                </div>
                <div className="charge__sum">
                  <b className={c.left > 0 ? 'num-minus' : ''}>{fmtMoney(c.left)}</b>
                  <span className="muted small">{`из ${fmtMoney(c.amount)}`}</span>
                </div>
              </div>
              {c.payments.length > 0 && (
                <ul className="charge__pays">
                  {c.payments.map((p) => (
                    <li key={p.id}>
                      <span className="num-plus">{`+${fmtMoney(p.amount)}`}</span>
                      {` · ${fmtDay(p.day)} · ${METHOD_LABELS[p.method] || p.method}${p.author_name ? ` · ${p.author_name}` : ''}`}
                      {isAdmin && (
                        <button
                          type="button"
                          className="link-btn link-btn--danger"
                          onClick={() => remove(`/drivers/${driver.id}/charges/${c.id}/payments/${p.id}`,
                            `Отменить оплату ${fmtMoney(p.amount)} сум?${p.method === 'DEPOSIT' ? ' Сумма вернётся в депозит.' : ''}`)}
                        >
                          отменить
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              <div className="charge__actions">
                {c.left > 0 && <button className="btn btn--sm" onClick={() => setPaying(c)}>Принять оплату</button>}
                {isAdmin && (
                  <button
                    type="button"
                    className="link-btn link-btn--danger"
                    onClick={() => remove(`/drivers/${driver.id}/charges/${c.id}`,
                      `Удалить долг «${CHARGE_LABELS[c.kind] || c.kind}» на ${fmtMoney(c.amount)} сум вместе с его оплатами?`)}
                  >
                    Удалить
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {adding && <ChargeModal driver={driver} onClose={() => setAdding(false)} onDone={() => { setAdding(false); onChanged(); }} />}
      {paying && (
        <PayModal
          driver={driver}
          charge={paying}
          isAdmin={isAdmin}
          onClose={() => setPaying(null)}
          onDone={() => { setPaying(null); onChanged(); }}
        />
      )}
    </div>
  );
}
