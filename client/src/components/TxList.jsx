import { useState } from 'react';
import { api, ApiError } from '../api';
import Modal from './Modal';
import MoneyInput from './MoneyInput';
import Select, { pairs } from './Select';
import DateInput from './DateInput';
import Plate from './Plate';
import {
  CATEGORY_LABELS, EXPENSE_CATEGORIES, INCOME_CATEGORIES, METHOD_LABELS, PAY_METHODS, fmtMoney, fmtDay,
} from '../labels';

const errText = (err, fallback) => (err instanceof ApiError ? err.message : fallback);

function EditTx({ carId, tx, onClose, onDone }) {
  const [amount, setAmount] = useState(String(tx.amount));
  const [method, setMethod] = useState(tx.method || 'CASH');
  const [category, setCategory] = useState(tx.category);
  const [day, setDay] = useState(tx.tx_date);
  const [comment, setComment] = useState(tx.comment || '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const categories = tx.kind === 'INCOME' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.patch(`/cars/${carId}/transactions/${tx.id}`, { amount, method, category, tx_date: day, comment });
      onDone();
    } catch (err) {
      setError(errText(err, 'Не удалось сохранить'));
      setSaving(false);
    }
  }

  return (
    <Modal title={`Изменить ${tx.kind === 'INCOME' ? 'доход' : 'расход'}`} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="field">
          <label className="field__label" htmlFor="etx-amount">Сумма</label>
          <MoneyInput id="etx-amount" value={amount} onChange={setAmount} required autoFocus />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="etx-cat">Категория</label>
          <Select id="etx-cat" value={category} onChange={setCategory} options={pairs(categories)} />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="etx-method">Способ</label>
          <Select
            id="etx-method"
            value={method}
            onChange={setMethod}
            options={[
              ...pairs(PAY_METHODS),
              ...(!PAY_METHODS.some(([v]) => v === tx.method) && tx.method
                ? [{ value: tx.method, label: METHOD_LABELS[tx.method] || tx.method }] : []),
            ]}
          />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="etx-date">Дата</label>
          <DateInput id="etx-date" className="field__input" value={day} onChange={(e) => setDay(e.target.value)} required />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="etx-comment">Комментарий</label>
          <input id="etx-comment" className="field__input" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={500} />
        </div>
        {tx.status === 'CONFIRMED' && <p className="muted small">Запись уже подтверждена — изменение попадёт в журнал аудита.</p>}
        {error && <div className="notice notice--error">{error}</div>}
        <div className="form-actions">
          <button className="btn" type="submit" disabled={saving}>{saving ? 'Сохраняю…' : 'Сохранить'}</button>
          <button className="btn btn--quiet" type="button" onClick={onClose}>Отмена</button>
        </div>
      </form>
    </Modal>
  );
}

// carId — для списка одной машины; в списке водителя у каждой записи свой car_id и номер.
export default function TxList({ carId, items, role, onChanged, showCar = false }) {
  const [filter, setFilter] = useState('ALL');
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');

  const shown = items.filter((t) => (
    filter === 'ALL' ? true
      : filter === 'PENDING' ? t.status === 'PENDING'
        : t.kind === filter
  ));
  const pendingCount = items.filter((t) => t.status === 'PENDING').length;
  const carOf = (tx) => tx.car_id ?? carId;

  async function act(tx, action) {
    if (action === 'delete' && !window.confirm(`Удалить ${tx.kind === 'INCOME' ? 'доход' : 'расход'} ${fmtMoney(tx.amount)} сум?`)) return;
    setBusy(tx.id);
    setError('');
    try {
      if (action === 'confirm') await api.post(`/cars/${carOf(tx)}/transactions/${tx.id}/confirm`);
      if (action === 'delete') await api.delete(`/cars/${carOf(tx)}/transactions/${tx.id}`);
      onChanged();
    } catch (err) {
      setError(errText(err, 'Не получилось'));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="panel">
      <div className="section-head" style={{ marginTop: 0 }}>
        <h3 className="panel__title" style={{ margin: 0 }}>История операций</h3>
        <div className="chips">
          {[['ALL', 'Все'], ['INCOME', 'Доходы'], ['EXPENSE', 'Расходы'], ...(pendingCount ? [['PENDING', `Ждут (${pendingCount})`]] : [])].map(([v, l]) => (
            <button key={v} type="button" className={`chip ${filter === v ? 'chip--on' : ''}`} onClick={() => setFilter(v)}>{l}</button>
          ))}
        </div>
      </div>
      {error && <div className="notice notice--error">{error}</div>}
      {shown.length === 0 ? (
        <div className="empty">Пока нет записей</div>
      ) : (
        <ul className="tx-list">
          {shown.map((t) => {
            const income = t.kind === 'INCOME';
            return (
              <li key={t.id} className={`tx ${t.status === 'PENDING' ? 'tx--pending' : ''}`}>
                <div className={`tx__icon ${income ? 'tx__icon--in' : 'tx__icon--out'}`}>{income ? '+' : '−'}</div>
                <div>
                  <div className="tx__title">
                    {showCar && t.plate && <><Plate value={t.plate} />{' '}</>}
                    {CATEGORY_LABELS[t.category] || t.category} · {METHOD_LABELS[t.method] || t.method}
                  </div>
                  <div className="tx__meta">
                    {fmtDay(t.tx_date)} · {t.author_name || '—'}{t.comment ? ` · ${t.comment}` : ''}
                  </div>
                </div>
                <div className="tx__right">
                  <span className={income ? 'num-plus' : 'num-minus'}>{income ? '+' : '−'}{fmtMoney(t.amount)}</span>
                  {t.status === 'PENDING'
                    ? <span className="badge badge--wait">Ждёт подтверждения</span>
                    : <span className="badge badge--ok">Подтверждено</span>}
                </div>
                {role !== 'OWNER' && (t.can_confirm || t.can_edit || t.can_delete) && (
                  <div className="tx__actions">
                    {t.can_confirm && (
                      <button className="btn btn--ok btn--sm" disabled={busy === t.id} onClick={() => act(t, 'confirm')}>Подтвердить</button>
                    )}
                    {t.can_edit && <button className="link-btn" onClick={() => setEditing(t)}>Изменить</button>}
                    {t.can_delete && <button className="link-btn link-btn--danger" disabled={busy === t.id} onClick={() => act(t, 'delete')}>Удалить</button>}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {editing && (
        <EditTx carId={carOf(editing)} tx={editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); onChanged(); }} />
      )}
    </div>
  );
}
