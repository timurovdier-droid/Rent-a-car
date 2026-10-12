import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api';
import Modal from './Modal';
import MoneyInput from './MoneyInput';
import Plate from './Plate';
import { fmtMoney, fmtDay, fmtDateTime, METHOD_LABELS } from '../labels';

function errText(err, fallback) {
  return err instanceof ApiError ? err.message : fallback;
}

function ConfirmModal({ request, onClose, onDone }) {
  const [amount, setAmount] = useState(String(request.amount));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.post(`/drivers/payment-requests/${request.id}/confirm`, { amount });
      onDone();
    } catch (err) {
      setError(errText(err, 'Не удалось подтвердить'));
      setSaving(false);
    }
  }

  return (
    <Modal title="Подтвердить оплату" onClose={onClose}>
      <form onSubmit={submit}>
        <p className="muted" style={{ marginTop: 0 }}>
          {`${request.full_name} пишет, что оплатил ${fmtMoney(request.amount)} сум (${METHOD_LABELS[request.method] || request.method}) за ${fmtDay(request.day)}. Если пришло меньше — исправьте сумму.`}
        </p>
        <div className="field">
          <label className="field__label" htmlFor="pr-amount">Сколько получено</label>
          <MoneyInput id="pr-amount" value={amount} onChange={setAmount} required autoFocus />
        </div>
        {error && <div className="notice notice--error">{error}</div>}
        <div className="form-actions">
          <button className="btn btn--ok" type="submit" disabled={saving}>{saving ? 'Сохраняю…' : 'Деньги получены'}</button>
          <button className="btn btn--quiet" type="button" onClick={onClose}>Отмена</button>
        </div>
      </form>
    </Modal>
  );
}

function RejectModal({ request, onClose, onDone }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.post(`/drivers/payment-requests/${request.id}/reject`, { reason });
      onDone();
    } catch (err) {
      setError(errText(err, 'Не удалось отклонить'));
      setSaving(false);
    }
  }

  return (
    <Modal title="Отклонить оплату" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="field">
          <label className="field__label" htmlFor="pr-reason">Причина — водитель увидит её в кабинете</label>
          <input id="pr-reason" className="field__input" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} required autoFocus placeholder="например: перевод не пришёл" />
        </div>
        {error && <div className="notice notice--error">{error}</div>}
        <div className="form-actions">
          <button className="btn btn--danger" type="submit" disabled={saving}>{saving ? 'Сохраняю…' : 'Отклонить'}</button>
          <button className="btn btn--quiet" type="button" onClick={onClose}>Отмена</button>
        </div>
      </form>
    </Modal>
  );
}

export default function DriverPaymentRequests() {
  const [list, setList] = useState([]);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(null);
  const [rejecting, setRejecting] = useState(null);

  const load = useCallback(async () => {
    try {
      setList(await api.get('/drivers/payment-requests'));
      setError('');
    } catch (err) {
      setError(errText(err, 'Не удалось загрузить оплаты от водителей'));
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (!list.length && !error) return null;
  const done = () => { setConfirming(null); setRejecting(null); load(); };

  return (
    <div className="panel panel--yellow" style={{ marginBottom: 16 }}>
      <div className="panel__head">
        <h3 className="panel__title" style={{ margin: 0 }}>Оплаты от водителей ждут проверки</h3>
        <b>{`${list.length} шт. · ${fmtMoney(list.reduce((s, r) => s + Number(r.amount), 0))} сум`}</b>
      </div>
      {error && <div className="notice notice--error">{error}</div>}
      <ul className="tx-list">
        {list.map((r) => (
          <li key={r.id} className="tx">
            <div>
              <div className="tx__title">
                <Link to={`/drivers/${r.driver_id}`}>{r.full_name}</Link>
                {` · ${fmtMoney(r.amount)} сум · ${METHOD_LABELS[r.method] || r.method}`}
              </div>
              <div className="tx__meta">
                {`за ${fmtDay(r.day)} · отправлено ${fmtDateTime(r.created_at)}`}
                {r.plate && <> · <Plate value={r.plate} /></>}
                {r.comment ? ` · ${r.comment}` : ''}
              </div>
            </div>
            <div className="tx__right">
              <button type="button" className="btn btn--ok btn--sm" onClick={() => setConfirming(r)}>Подтвердить</button>
              <button type="button" className="btn btn--quiet btn--sm" onClick={() => setRejecting(r)}>Отклонить</button>
            </div>
          </li>
        ))}
      </ul>
      {confirming && <ConfirmModal request={confirming} onClose={() => setConfirming(null)} onDone={done} />}
      {rejecting && <RejectModal request={rejecting} onClose={() => setRejecting(null)} onDone={done} />}
    </div>
  );
}
