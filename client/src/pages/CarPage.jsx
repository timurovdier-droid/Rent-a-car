import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../api';
import { useAuth } from '../auth';
import Plate from '../components/Plate';
import StatusMark from '../components/StatusMark';
import Modal from '../components/Modal';
import MoneyInput from '../components/MoneyInput';
import CarForm from '../components/CarForm';
import { CarVisual } from '../components/CarTile';
import DayCalendar from '../components/DayCalendar';
import CarLedger from '../components/CarLedger';
import {
  CATEGORY_LABELS, EXPENSE_CATEGORIES, INCOME_CATEGORIES, METHOD_LABELS, PAY_METHODS,
  FUEL_LABELS, SERVICE_TYPES, fmtMoney, fmtNumber, fmtDay, localDayOf, todayLocal,
} from '../labels';

const errText = (err, fallback) => (err instanceof ApiError ? err.message : fallback);

function Stat({ label, value, hint, tone, suffix = 'сум' }) {
  return (
    <div className={`stat ${tone ? `stat--${tone}` : ''}`}>
      <div className="stat__label">{label}</div>
      <div className="stat__value">{fmtMoney(value)}{suffix && <small>{suffix}</small>}</div>
      {hint && <div className="stat__hint">{hint}</div>}
    </div>
  );
}

function DueBadge({ state, soon, overdue }) {
  if (!state) return null;
  return <span className={`badge ${state === 'OVERDUE' ? 'badge--danger' : 'badge--warn'}`}>{state === 'OVERDUE' ? overdue : soon}</span>;
}

function Summary({ role, s }) {
  if (role === 'OWNER') {
    return (
      <div className="stats">
        <Stat label="Доход" value={s.income} tone="ok" />
        <Stat label="Расходы" value={s.expenses} />
        <Stat label="Прибыль" value={s.profit} tone="accent" />
      </div>
    );
  }
  return (
    <div className="stats">
      <Stat label="Начислено" value={s.accrued} hint={`за ${s.accrued_days} дн. аренды`} />
      <Stat label="Получено" value={s.received} tone="ok" hint={s.pending ? `ещё ${fmtMoney(s.pending)} ждёт подтверждения` : 'подтверждено'} />
      <Stat label={s.overpaid ? 'Переплата' : 'Долг'} value={s.overpaid || s.debt} tone={s.debt ? 'danger' : 'ok'} />
      {role === 'ADMIN' && <Stat label="Расходы" value={s.expenses} />}
      {role === 'ADMIN' && <Stat label="Прибыль" value={s.profit} tone="accent" hint="доход − расходы" />}
    </div>
  );
}

function AddEntry({ carId, isAdmin, onDone }) {
  const [kind, setKind] = useState('INCOME');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('CASH');
  const [category, setCategory] = useState('RENT');
  const [day, setDay] = useState(todayLocal());
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);

  function switchKind(next) {
    setKind(next);
    setCategory(next === 'INCOME' ? 'RENT' : 'FUEL');
    setNotice(null);
  }

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setNotice(null);
    try {
      await api.post(`/cars/${carId}/transactions`, { kind, amount, method, category, tx_date: day, comment });
      setNotice({
        ok: true,
        text: `${kind === 'INCOME' ? 'Доход' : 'Расход'} ${fmtMoney(amount)} сум ${isAdmin ? 'записан' : 'отправлен админу на подтверждение'}`,
      });
      setAmount('');
      setComment('');
      onDone();
    } catch (err) {
      setNotice({ ok: false, text: errText(err, 'Не удалось записать') });
    } finally {
      setSaving(false);
    }
  }

  const categories = kind === 'INCOME' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  return (
    <form className="panel" onSubmit={submit}>
      <h3 className="panel__title">Добавить в отчёт</h3>
      <div className="seg" role="tablist">
        <button type="button" className={`seg__btn seg__btn--income ${kind === 'INCOME' ? 'seg__btn--on' : ''}`} onClick={() => switchKind('INCOME')}>+ Доход</button>
        <button type="button" className={`seg__btn seg__btn--expense ${kind === 'EXPENSE' ? 'seg__btn--on' : ''}`} onClick={() => switchKind('EXPENSE')}>− Расход</button>
      </div>

      <div className="field">
        <label className="field__label" htmlFor="tx-amount">Сумма</label>
        <MoneyInput id="tx-amount" value={amount} onChange={setAmount} required placeholder="500 000" />
      </div>

      <div className="field">
        <span className="field__label">{kind === 'INCOME' ? 'За что' : 'На что'}</span>
        <div className="chips">
          {categories.map(([v, l]) => (
            <button type="button" key={v} className={`chip ${category === v ? 'chip--on' : ''}`} onClick={() => setCategory(v)}>{l}</button>
          ))}
        </div>
      </div>

      <div className="field">
        <span className="field__label">Способ</span>
        <div className="chips">
          {PAY_METHODS.map(([v, l]) => (
            <button type="button" key={v} className={`chip ${method === v ? 'chip--on' : ''}`} onClick={() => setMethod(v)}>{l}</button>
          ))}
        </div>
      </div>

      <div className="form-grid">
        <div className="field">
          <label className="field__label" htmlFor="tx-date">Дата</label>
          <input id="tx-date" className="field__input" type="date" value={day} onChange={(e) => setDay(e.target.value)} required />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="tx-comment">Комментарий</label>
          <input id="tx-comment" className="field__input" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="необязательно" maxLength={500} />
        </div>
      </div>

      {notice && <div className={`notice ${notice.ok ? 'notice--ok' : 'notice--error'}`}>{notice.text}</div>}
      <div className="form-actions">
        <button className="btn" type="submit" disabled={saving || !amount}>{saving ? 'Записываю…' : 'Записать'}</button>
        {!isAdmin && <span className="muted small">Сумма попадёт в отчёт после подтверждения админом</span>}
      </div>
    </form>
  );
}

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
          <select id="etx-cat" className="field__input" value={category} onChange={(e) => setCategory(e.target.value)}>
            {categories.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div className="field">
          <label className="field__label" htmlFor="etx-method">Способ</label>
          <select id="etx-method" className="field__input" value={method} onChange={(e) => setMethod(e.target.value)}>
            {PAY_METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div className="field">
          <label className="field__label" htmlFor="etx-date">Дата</label>
          <input id="etx-date" className="field__input" type="date" value={day} onChange={(e) => setDay(e.target.value)} required />
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

function TxList({ carId, items, role, onChanged }) {
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

  async function act(tx, action) {
    if (action === 'delete' && !window.confirm(`Удалить ${tx.kind === 'INCOME' ? 'доход' : 'расход'} ${fmtMoney(tx.amount)} сум?`)) return;
    setBusy(tx.id);
    setError('');
    try {
      if (action === 'confirm') await api.post(`/cars/${carId}/transactions/${tx.id}/confirm`);
      if (action === 'delete') await api.delete(`/cars/${carId}/transactions/${tx.id}`);
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
                  <div className="tx__title">{CATEGORY_LABELS[t.category] || t.category} · {METHOD_LABELS[t.method] || t.method}</div>
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
        <EditTx carId={carId} tx={editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); onChanged(); }} />
      )}
    </div>
  );
}

function DriverPanel({ hub, canWrite, onChanged }) {
  const { car, current, free_drivers: drivers, assignments, today } = hub;
  const [driverId, setDriverId] = useState('');
  const [day, setDay] = useState(today);
  const [mileage, setMileage] = useState(car.mileage != null ? String(car.mileage) : '');
  const [releasing, setReleasing] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setMileage(car.mileage != null ? String(car.mileage) : '');
  }, [car.mileage]);

  async function assign(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.post(`/cars/${car.id}/assign`, { driver_id: driverId, date: day, mileage });
      setDriverId('');
      onChanged();
    } catch (err) {
      setError(errText(err, 'Не удалось выдать машину'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="panel">
      <h3 className="panel__title">Водитель</h3>
      {current ? (
        <div className="person__head" style={{ marginBottom: 12 }}>
          <div className="avatar">{(current.driver_name || '?').slice(0, 1)}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="person__name">{current.driver_name || 'Удалённый водитель'}</div>
            <div className="person__sub">
              с {fmtDay(localDayOf(current.start_at))} · выдана с пробегом {fmtNumber(current.mileage_start)} км
              {current.driver_phone ? ` · ${current.driver_phone}` : ''}
            </div>
          </div>
          {canWrite && <button className="btn btn--quiet btn--sm" onClick={() => setReleasing(true)}>Принять машину</button>}
        </div>
      ) : canWrite ? (
        <form onSubmit={assign}>
          <p className="muted small" style={{ marginTop: 0 }}>Машина свободна. Выдайте её водителю — с этого дня начнётся начисление ставки.</p>
          <div className="field">
            <label className="field__label" htmlFor="as-driver">Водитель</label>
            <select id="as-driver" className="field__input" value={driverId} onChange={(e) => setDriverId(e.target.value)} required>
              <option value="">— выберите свободного водителя —</option>
              {drivers.map((d) => <option key={d.id} value={d.id}>{d.full_name}{d.phone ? ` · ${d.phone}` : ''}</option>)}
            </select>
            {drivers.length === 0 && <span className="muted small">Свободных водителей нет. Добавьте их в разделе «Водители».</span>}
          </div>
          <div className="form-grid">
            <div className="field">
              <label className="field__label" htmlFor="as-date">Дата выдачи</label>
              <input id="as-date" className="field__input" type="date" value={day} onChange={(e) => setDay(e.target.value)} required />
            </div>
            <div className="field">
              <label className="field__label" htmlFor="as-km">Пробег при выдаче</label>
              <MoneyInput id="as-km" value={mileage} onChange={setMileage} required suffix="км" />
            </div>
          </div>
          {error && <div className="notice notice--error">{error}</div>}
          <button className="btn" type="submit" disabled={saving || !driverId}>{saving ? 'Выдаю…' : 'Выдать машину'}</button>
        </form>
      ) : (
        <p className="muted">Сейчас без водителя</p>
      )}

      {releasing && current && (
        <ReleaseModal car={car} current={current} today={today} onClose={() => setReleasing(false)} onDone={() => { setReleasing(false); onChanged(); }} />
      )}
    </div>
  );
}

function daysBetween(from, to) {
  const [y1, m1, d1] = from.split('-').map(Number);
  const [y2, m2, d2] = to.split('-').map(Number);
  return Math.max(1, Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000));
}

function plural(n, one, few, many) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

function assignmentSpan(a, today) {
  return { from: localDayOf(a.start_at), to: a.end_at ? localDayOf(a.end_at) : today };
}

function DriverName({ a, linkDrivers }) {
  const name = a.driver_name || 'Удалённый водитель';
  return linkDrivers && a.driver_id && a.driver_name
    ? <Link to={`/drivers/${a.driver_id}`} className="dh__name">{name}</Link>
    : <span className="dh__name">{name}</span>;
}

function DriverHistory({ hub, linkDrivers }) {
  const { assignments, today } = hub;
  const [picked, setPicked] = useState(today);
  const [month, setMonth] = useState(today.slice(0, 7));

  const spans = useMemo(
    () => assignments.map((a) => ({ a, ...assignmentSpan(a, today) })),
    [assignments, today]
  );
  const onDay = spans.filter((s) => s.from <= picked && picked <= s.to);

  const dayClass = (day) => {
    if (day === picked) return 'cal__day--pick';
    return spans.some((s) => s.from <= day && day <= s.to) ? 'cal__day--busy' : '';
  };

  return (
    <div className="panel">
      <div className="dh__head">
        <h3 className="panel__title" style={{ margin: 0 }}>Кто ездил на машине</h3>
        {assignments.length > 0 && <span className="muted small">{assignments.length} {plural(assignments.length, 'выдача', 'выдачи', 'выдач')}</span>}
      </div>

      <p className="muted small" style={{ margin: '0 0 12px' }}>Выберите дату — покажем, какой водитель был на машине в этот день. Цветом отмечены дни, когда машина была у водителя.</p>
      <DayCalendar month={month} onMonth={setMonth} onPick={setPicked} dayClass={dayClass} today={today} max={today} label="Дата" />

      <div className="dh-answer">
        <div className="dh-answer__date">{fmtDay(picked)}</div>
        {onDay.length === 0 ? (
          <div className="muted">Машина стояла без водителя</div>
        ) : (
          onDay.map(({ a, from, to }) => (
            <div key={a.id} className="dh-answer__row">
              <DriverName a={a} linkDrivers={linkDrivers} />
              <span className="muted small">
                {' '}· {from === picked ? 'взял(а) машину в этот день' : to === picked && a.end_at ? 'вернул(а) машину в этот день' : `с ${fmtDay(from)} по ${a.end_at ? fmtDay(to) : 'сей день'}`}
              </span>
            </div>
          ))
        )}
      </div>

      {assignments.length === 0 ? (
        <p className="muted small" style={{ margin: '16px 0 0' }}>Машину ещё никому не выдавали</p>
      ) : (
        <>
          <div className="dh__sub">Все выдачи</div>
          <ol className="dh">
            {spans.map(({ a, from, to }) => {
              const days = daysBetween(from, to);
              const km = a.mileage_end != null && a.mileage_start != null ? a.mileage_end - a.mileage_start : null;
              const hit = onDay.some((s) => s.a.id === a.id);
              return (
                <li key={a.id} className={`dh__item ${a.end_at ? '' : 'dh__item--now'} ${hit ? 'dh__item--hit' : ''}`}>
                  <span className="dh__dot" aria-hidden="true" />
                  <button type="button" className="dh__body" onClick={() => { setPicked(from); setMonth(from.slice(0, 7)); }} title="Показать в календаре">
                    <div className="dh__top">
                      <span className="dh__name">{a.driver_name || 'Удалённый водитель'}</span>
                      {!a.end_at && <span className="badge badge--ok">Сейчас</span>}
                    </div>
                    <div className="dh__dates">
                      {fmtDay(from)} — {a.end_at ? fmtDay(to) : 'по сей день'}
                      <span className="muted"> · {days} {plural(days, 'день', 'дня', 'дней')}</span>
                    </div>
                    <div className="dh__meta">
                      {a.end_at
                        ? <>Пробег {fmtNumber(a.mileage_start)} → {fmtNumber(a.mileage_end)} км{km != null && km >= 0 ? ` (+${fmtNumber(km)})` : ''}</>
                        : <>Выдана с пробегом {fmtNumber(a.mileage_start)} км</>}
                      {a.created_by_name ? ` · выдал(а) ${a.created_by_name}` : ''}
                    </div>
                    {a.note && <div className="dh__note">{a.note}</div>}
                  </button>
                </li>
              );
            })}
          </ol>
        </>
      )}
    </div>
  );
}

function ReleaseModal({ car, current, today, onClose, onDone }) {
  const [day, setDay] = useState(today);
  const [mileage, setMileage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.post(`/cars/${car.id}/release`, { date: day, mileage });
      onDone();
    } catch (err) {
      setError(errText(err, 'Не удалось принять машину'));
      setSaving(false);
    }
  }

  return (
    <Modal title="Принять машину у водителя" onClose={onClose}>
      <form onSubmit={submit}>
        <p className="muted" style={{ marginTop: 0 }}>
          {current.driver_name} · выдана {fmtDay(localDayOf(current.start_at))} с пробегом {fmtNumber(current.mileage_start)} км
        </p>
        <div className="field">
          <label className="field__label" htmlFor="rl-date">Дата сдачи</label>
          <input id="rl-date" className="field__input" type="date" value={day} onChange={(e) => setDay(e.target.value)} required />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="rl-km">Пробег при сдаче</label>
          <MoneyInput id="rl-km" value={mileage} onChange={setMileage} required suffix="км" autoFocus />
        </div>
        {error && <div className="notice notice--error">{error}</div>}
        <div className="form-actions">
          <button className="btn" type="submit" disabled={saving || !mileage}>{saving ? 'Сохраняю…' : 'Принять'}</button>
          <button className="btn btn--quiet" type="button" onClick={onClose}>Отмена</button>
        </div>
      </form>
    </Modal>
  );
}

function RatePanel({ hub, role, onChanged }) {
  const { car, rates, summary, today } = hub;
  const [rate, setRate] = useState('');
  const [from, setFrom] = useState(today);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.post(`/cars/${car.id}/rate`, { rate, valid_from: from });
      setRate('');
      onChanged();
    } catch (err) {
      setError(errText(err, 'Не удалось изменить ставку'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="panel">
      <h3 className="panel__title">Ставка аренды</h3>
      <div className="stat__value" style={{ marginTop: 0 }}>{fmtMoney(car.daily_rate)}<small>сум / день</small></div>
      <p className="muted small" style={{ margin: '4px 0 12px' }}>
        Начисляется за каждый день, пока машина у водителя, кроме выходных. Начислено всего: {fmtMoney(summary.accrued)} сум за {summary.accrued_days} дн.
      </p>
      {role === 'ADMIN' && (
        <>
          <form onSubmit={submit}>
            <div className="form-grid">
              <div className="field">
                <label className="field__label" htmlFor="rt-rate">Новая ставка</label>
                <MoneyInput id="rt-rate" value={rate} onChange={setRate} required />
              </div>
              <div className="field">
                <label className="field__label" htmlFor="rt-from">Действует с</label>
                <input id="rt-from" className="field__input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} required />
              </div>
            </div>
            {error && <div className="notice notice--error">{error}</div>}
            <button className="btn btn--quiet btn--sm" type="submit" disabled={saving || rate === ''}>Изменить ставку</button>
          </form>
          <p className="muted small">Старые дни считаются по старой цене — прошлые отчёты не меняются.</p>
          {rates.length > 0 && (
            <details>
              <summary className="muted small" style={{ cursor: 'pointer' }}>История ставок</summary>
              {rates.map((r) => (
                <div key={r.id} className="car-card__row" style={{ padding: '6px 0' }}>
                  <span>{r.valid_from === '2000-01-01' ? 'С самого начала' : `с ${fmtDay(r.valid_from)}`}</span>
                  <b>{fmtMoney(r.rate)} сум</b>
                </div>
              ))}
            </details>
          )}
        </>
      )}
    </div>
  );
}

const MONTHS_GEN_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

function shortDays(list) {
  return [...list].sort().map((d) => `${Number(d.slice(8, 10))} ${MONTHS_GEN_SHORT[Number(d.slice(5, 7)) - 1]}`).join(', ');
}

function DaysOffPanel({ hub, onChanged }) {
  const { car, days_off: saved, today } = hub;
  const savedSet = useMemo(() => new Set(saved), [saved]);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [add, setAdd] = useState(() => new Set());
  const [remove, setRemove] = useState(() => new Set());
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function toggle(day) {
    if (savedSet.has(day)) {
      const next = new Set(remove);
      next.has(day) ? next.delete(day) : next.add(day);
      setRemove(next);
    } else {
      const next = new Set(add);
      next.has(day) ? next.delete(day) : next.add(day);
      setAdd(next);
    }
  }

  function reset() {
    setAdd(new Set());
    setRemove(new Set());
    setError('');
  }

  async function save() {
    setSaving(true);
    setError('');
    try {
      await api.put(`/cars/${car.id}/days-off`, { add: [...add], remove: [...remove] });
      reset();
      onChanged();
    } catch (err) {
      setError(errText(err, 'Не удалось сохранить выходные'));
    } finally {
      setSaving(false);
    }
  }

  const dayClass = (day) => {
    if (add.has(day)) return 'cal__day--on cal__day--new';
    if (remove.has(day)) return 'cal__day--removed';
    return savedSet.has(day) ? 'cal__day--on' : '';
  };

  const upcoming = saved.filter((d) => d >= today && !remove.has(d));
  const dirty = add.size > 0 || remove.size > 0;

  return (
    <div className="panel">
      <h3 className="panel__title">Выходные (без начисления)</h3>
      <p className="muted small" style={{ margin: '0 0 12px' }}>
        Нажимайте на дни, когда машина не работает: например 1, 3, 6 и 21 число. Повторное нажатие снимает выходной.
      </p>
      <DayCalendar month={month} onMonth={setMonth} onPick={toggle} dayClass={dayClass} today={today} label="Выходные дни" />

      {dirty ? (
        <div className="cal-changes">
          {add.size > 0 && <div><b>Добавить:</b> {shortDays(add)}</div>}
          {remove.size > 0 && <div><b>Убрать:</b> {shortDays(remove)}</div>}
          {error && <div className="notice notice--error" style={{ margin: '8px 0 0' }}>{error}</div>}
          <div className="cal-changes__actions">
            <button type="button" className="btn btn--sm" onClick={save} disabled={saving}>{saving ? 'Сохраняю…' : 'Сохранить'}</button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={reset} disabled={saving}>Отменить</button>
          </div>
        </div>
      ) : (
        <p className="muted small" style={{ margin: '12px 0 0' }}>
          {upcoming.length ? `Ближайшие выходные: ${shortDays(upcoming.slice(0, 12))}${upcoming.length > 12 ? '…' : ''}` : 'Выходных впереди нет'}
        </p>
      )}
    </div>
  );
}

function ServicePanel({ hub, canWrite, onChanged }) {
  const { car, services, today } = hub;
  const [type, setType] = useState('OIL_CHANGE');
  const [dueDate, setDueDate] = useState('');
  const [dueKm, setDueKm] = useState('');
  const [comment, setComment] = useState('');
  const [doneNow, setDoneNow] = useState(false);
  const [cost, setCost] = useState('');
  const [doneKm, setDoneKm] = useState('');
  const [finishing, setFinishing] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function add(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.post(`/cars/${car.id}/service`, doneNow
        ? { type, comment, done: true, cost, mileage: doneKm, date: dueDate || today }
        : { type, comment, due_date: dueDate, due_mileage: dueKm });
      setDueDate(''); setDueKm(''); setComment(''); setCost(''); setDoneKm(''); setDoneNow(false);
      onChanged();
    } catch (err) {
      setError(errText(err, 'Не удалось сохранить'));
    } finally {
      setSaving(false);
    }
  }

  async function remove(s) {
    if (!window.confirm(`Удалить «${s.label}»?`)) return;
    try {
      await api.delete(`/cars/${car.id}/service/${s.id}`);
      onChanged();
    } catch (err) {
      setError(errText(err, 'Не удалось удалить'));
    }
  }

  const scheduled = services.filter((s) => s.status === 'SCHEDULED');
  const done = services.filter((s) => s.status === 'COMPLETED');

  return (
    <div className="panel">
      <h3 className="panel__title">Обслуживание</h3>
      <p className="muted small" style={{ marginTop: 0 }}>Пробег сейчас: <b>{fmtNumber(car.mileage)} км</b></p>

      {scheduled.length === 0 ? (
        <p className="muted small">Ничего не запланировано</p>
      ) : (
        <ul className="tx-list">
          {scheduled.map((s) => (
            <li key={s.id} className="tx">
              <div className="tx__icon" style={{ background: 'var(--c-soft)', fontSize: 12 }}>ТО</div>
              <div>
                <div className="tx__title">{s.label}</div>
                <div className="tx__meta">
                  {[s.scheduled_at && `до ${fmtDay(s.scheduled_at)}`, s.due_mileage != null && `на ${fmtNumber(s.due_mileage)} км`].filter(Boolean).join(' или ')}
                  {s.comment ? ` · ${s.comment}` : ''}
                </div>
              </div>
              <div className="tx__right">
                {s.due ? <DueBadge state={s.due} soon="Скоро" overdue="Пора на обслуживание" /> : <span className="badge badge--muted">Запланировано</span>}
              </div>
              {canWrite && (
                <div className="tx__actions">
                  <button className="btn btn--ok btn--sm" onClick={() => setFinishing(s)}>Сделано</button>
                  <button className="link-btn link-btn--danger" onClick={() => remove(s)}>Удалить</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {canWrite && (
        <form onSubmit={add} style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--c-line)' }}>
          <div className="form-grid">
            <div className="field">
              <label className="field__label" htmlFor="sv-type">Что</label>
              <select id="sv-type" className="field__input" value={type} onChange={(e) => setType(e.target.value)}>
                {SERVICE_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div className="field">
              <label className="field__label" htmlFor="sv-date">{doneNow ? 'Когда сделано' : 'Сделать до даты'}</label>
              <input id="sv-date" className="field__input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            {doneNow ? (
              <>
                <div className="field">
                  <label className="field__label" htmlFor="sv-cost">Стоимость</label>
                  <MoneyInput id="sv-cost" value={cost} onChange={setCost} />
                </div>
                <div className="field">
                  <label className="field__label" htmlFor="sv-done-km">Пробег</label>
                  <MoneyInput id="sv-done-km" value={doneKm} onChange={setDoneKm} suffix="км" />
                </div>
              </>
            ) : (
              <div className="field">
                <label className="field__label" htmlFor="sv-km">или на пробеге</label>
                <MoneyInput id="sv-km" value={dueKm} onChange={setDueKm} suffix="км" placeholder={car.mileage ? fmtMoney(Number(car.mileage) + 10000) : '0'} />
              </div>
            )}
          </div>
          <div className="field">
            <label className="field__label" htmlFor="sv-comment">Комментарий</label>
            <input id="sv-comment" className="field__input" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={500} placeholder="например: масло 5W-30, фильтр" />
          </div>
          <label className="small" style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
            <input type="checkbox" checked={doneNow} onChange={(e) => setDoneNow(e.target.checked)} /> Уже сделано (стоимость сразу уйдёт в расходы «ТО»)
          </label>
          {error && <div className="notice notice--error">{error}</div>}
          <button className="btn btn--quiet btn--sm" type="submit" disabled={saving}>{doneNow ? 'Записать обслуживание' : 'Запланировать'}</button>
        </form>
      )}

      {done.length > 0 && (
        <details style={{ marginTop: 12 }}>
          <summary className="muted small" style={{ cursor: 'pointer' }}>Сделано раньше ({done.length})</summary>
          {done.map((s) => (
            <div key={s.id} className="car-card__row" style={{ padding: '8px 0', borderBottom: '1px solid var(--c-line)' }}>
              <span>{s.label} · {fmtDay(s.completed_at)}{s.done_mileage != null ? ` · ${fmtNumber(s.done_mileage)} км` : ''}</span>
              <b>{fmtMoney(s.cost)} сум</b>
            </div>
          ))}
        </details>
      )}

      {finishing && (
        <ServiceDoneModal car={car} record={finishing} today={today} onClose={() => setFinishing(null)} onDone={() => { setFinishing(null); onChanged(); }} />
      )}
    </div>
  );
}

function ServiceDoneModal({ car, record, today, onClose, onDone }) {
  const [cost, setCost] = useState(record.cost ? String(record.cost) : '');
  const [mileage, setMileage] = useState(car.mileage != null ? String(car.mileage) : '');
  const [day, setDay] = useState(today);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.post(`/cars/${car.id}/service/${record.id}/done`, { cost, mileage, date: day });
      onDone();
    } catch (err) {
      setError(errText(err, 'Не удалось сохранить'));
      setSaving(false);
    }
  }

  return (
    <Modal title={`${record.label}: сделано`} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="field">
          <label className="field__label" htmlFor="sd-cost">Стоимость</label>
          <MoneyInput id="sd-cost" value={cost} onChange={setCost} autoFocus />
          <span className="muted small">Сумма автоматически запишется в расходы машины («ТО»).</span>
        </div>
        <div className="field">
          <label className="field__label" htmlFor="sd-km">Пробег</label>
          <MoneyInput id="sd-km" value={mileage} onChange={setMileage} suffix="км" />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="sd-date">Дата</label>
          <input id="sd-date" className="field__input" type="date" value={day} onChange={(e) => setDay(e.target.value)} required />
        </div>
        {error && <div className="notice notice--error">{error}</div>}
        <div className="form-actions">
          <button className="btn" type="submit" disabled={saving}>{saving ? 'Сохраняю…' : 'Сделано'}</button>
          <button className="btn btn--quiet" type="button" onClick={onClose}>Отмена</button>
        </div>
      </form>
    </Modal>
  );
}

function CarInfo({ car }) {
  return (
    <dl className="kv">
      <div><dt>Арендодатель</dt><dd>{car.owner_name || '—'}</dd></div>
      <div><dt>Год / цвет</dt><dd>{[car.year, car.color].filter(Boolean).join(' · ') || '—'}</dd></div>
      <div><dt>VIN</dt><dd>{car.vin || '—'}</dd></div>
      <div><dt>Топливо</dt><dd>{FUEL_LABELS[car.fuel_type] || '—'}</dd></div>
      <div><dt>Пробег</dt><dd>{car.mileage != null ? `${fmtNumber(car.mileage)} км` : '—'}</dd></div>
      <div>
        <dt>Страховка до</dt>
        <dd>{fmtDay(car.insurance_expires)} <DueBadge state={car.insurance_due} soon="скоро" overdue="просрочена" /></dd>
      </div>
      <div>
        <dt>Техосмотр до</dt>
        <dd>{fmtDay(car.inspection_expires)} <DueBadge state={car.inspection_due} soon="скоро" overdue="просрочен" /></dd>
      </div>
    </dl>
  );
}

export default function CarPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const role = user?.role;
  const canWrite = role === 'ADMIN' || role === 'DISPATCHER';
  const [hub, setHub] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [confirmingAll, setConfirmingAll] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab') || 'report';
  const reportView = searchParams.get('view') === 'days' ? 'days' : 'ops';

  function openTab(key) {
    setSearchParams(key === 'report' ? {} : { tab: key }, { replace: true });
  }

  const load = useCallback(async () => {
    try {
      setHub(await api.get(`/cars/${id}/hub`));
      setError('');
    } catch (err) {
      setError(errText(err, 'Не удалось загрузить автомобиль'));
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const pending = useMemo(() => (hub?.transactions || []).filter((t) => t.status === 'PENDING'), [hub]);
  const pendingSum = pending.reduce((s, t) => s + Number(t.amount), 0);

  async function confirmAll() {
    setConfirmingAll(true);
    try {
      await api.post(`/cars/${id}/transactions-confirm-all`);
      await load();
    } catch (err) {
      setError(errText(err, 'Не удалось подтвердить'));
    } finally {
      setConfirmingAll(false);
    }
  }

  async function removeCar(action) {
    if (hub.current) {
      setError(`Сначала примите машину у водителя ${hub.current.driver_name} (вкладка «Водитель»)`);
      return;
    }
    const text = action === 'delete'
      ? `Удалить автомобиль ${hub.car.plate} навсегда вместе со всеми доходами, расходами и историей? Это действие нельзя отменить.`
      : `Убрать автомобиль ${hub.car.plate} в архив? Его можно будет вернуть на странице «Автомобили» → «Архив».`;
    if (!window.confirm(text)) return;
    try {
      if (action === 'delete') await api.delete(`/cars/${id}`);
      else await api.post(`/cars/${id}/archive`);
      navigate('/cars');
    } catch (err) {
      setError(errText(err, action === 'delete' ? 'Не удалось удалить' : 'Не удалось архивировать'));
    }
  }

  if (error && !hub) {
    return (
      <div>
        <Link to="/cars" className="back-link">← Автомобили</Link>
        <div className="notice notice--error">{error}</div>
      </div>
    );
  }
  if (!hub) return <div className="muted">Загрузка…</div>;

  const { car } = hub;
  const serviceDue = hub.services.find((s) => s.due === 'OVERDUE') || hub.services.find((s) => s.due);
  const dueCount = hub.services.filter((s) => s.due).length;
  const upcomingDaysOff = hub.days_off.filter((d) => d >= hub.today).length;

  const tabs = [
    { key: 'report', label: 'Отчёт', count: pending.length, alert: true },
    { key: 'driver', label: 'Водитель', count: hub.assignments.length },
    canWrite && { key: 'days', label: 'Выходные дни', count: upcomingDaysOff },
    { key: 'service', label: 'Обслуживание', count: dueCount, alert: true },
    { key: 'info', label: 'О машине' },
  ].filter(Boolean);
  const tab = tabs.some((t) => t.key === tabParam) ? tabParam : 'report';

  return (
    <div>
      <Link to={role === 'OWNER' ? '/' : '/cars'} className="back-link">← {role === 'OWNER' ? 'Главная' : 'Автомобили'}</Link>
      <div className="page-head">
        <div className="car-head">
          <div className="car-head__visual"><CarVisual car={car} /></div>
          <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <Plate value={car.plate} />
            <h1 className="page-title" style={{ margin: 0 }}>{car.brand} {car.model}</h1>
            <StatusMark status={car.status} />
          </div>
          <div className="badges" style={{ marginTop: 8 }}>
            {hub.current && <span className="badge badge--muted">Водитель: {hub.current.driver_name}</span>}
            {serviceDue && <DueBadge state={serviceDue.due} soon={`Скоро: ${serviceDue.label}`} overdue="Пора на обслуживание" />}
            <DueBadge state={car.insurance_due} soon="Страховка скоро кончится" overdue="Страховка просрочена" />
            <DueBadge state={car.inspection_due} soon="Техосмотр скоро" overdue="Техосмотр просрочен" />
          </div>
          </div>
        </div>
        {canWrite && (
          <div className="form-actions">
            <button className="btn btn--quiet" onClick={() => setEditing(true)}>Изменить данные</button>
            {role === 'ADMIN' && <button className="btn btn--ghost" onClick={() => removeCar('archive')}>В архив</button>}
            {role === 'ADMIN' && <button className="btn btn--danger" onClick={() => removeCar('delete')}>Удалить</button>}
          </div>
        )}
      </div>

      {error && <div className="notice notice--error">{error}</div>}

      <Summary role={role} s={hub.summary} />

      {role === 'ADMIN' && pending.length > 0 && (
        <div className="panel panel--yellow" style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <b>Ждут подтверждения: {pending.length}</b>
            <div className="small">на {fmtMoney(pendingSum)} сум от диспетчера — проверьте ниже в истории</div>
          </div>
          <button className="btn btn--ok" onClick={confirmAll} disabled={confirmingAll}>{confirmingAll ? 'Подтверждаю…' : 'Подтвердить все'}</button>
        </div>
      )}

      <nav className="car-tabs" role="tablist" aria-label="Разделы автомобиля">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            className={`car-tab ${tab === t.key ? 'car-tab--on' : ''}`}
            onClick={() => openTab(t.key)}
          >
            {t.label}
            {t.count ? <span className={`car-tab__count ${t.alert ? 'car-tab__count--alert' : ''}`}>{t.count}</span> : null}
          </button>
        ))}
      </nav>

      <div role="tabpanel">
        {tab === 'report' && (
          <div className="view-switch" role="group" aria-label="Вид отчёта">
            <button
              type="button"
              className={`view-switch__btn ${reportView === 'ops' ? 'view-switch__btn--on' : ''}`}
              onClick={() => setSearchParams({}, { replace: true })}
            >
              Операции
            </button>
            <button
              type="button"
              className={`view-switch__btn ${reportView === 'days' ? 'view-switch__btn--on' : ''}`}
              onClick={() => setSearchParams({ view: 'days' }, { replace: true })}
            >
              По дням
            </button>
          </div>
        )}
        {tab === 'report' && reportView === 'days' && <CarLedger carId={car.id} />}
        {tab === 'report' && reportView === 'ops' && (
          canWrite ? (
            <div className="layout-2">
              <div>
                <AddEntry carId={car.id} isAdmin={role === 'ADMIN'} onDone={load} />
                <div style={{ marginTop: 12 }}>
                  <TxList carId={car.id} items={hub.transactions} role={role} onChanged={load} />
                </div>
              </div>
              <div>
                <RatePanel hub={hub} role={role} onChanged={load} />
              </div>
            </div>
          ) : (
            <TxList carId={car.id} items={hub.transactions} role={role} onChanged={load} />
          )
        )}

        {tab === 'driver' && (
          <div className="layout-2">
            <div>
              {canWrite ? (
                <DriverPanel hub={hub} canWrite={canWrite} onChanged={load} />
              ) : (
                <div className="panel">
                  <h3 className="panel__title">Водитель</h3>
                  <p className="muted" style={{ margin: 0 }}>{hub.current ? `${hub.current.driver_name} · с ${fmtDay(localDayOf(hub.current.start_at))}` : 'Сейчас без водителя'}</p>
                </div>
              )}
            </div>
            <div>
              <DriverHistory hub={hub} linkDrivers={role !== 'OWNER'} />
            </div>
          </div>
        )}

        {tab === 'days' && canWrite && (
          <div className="tab-narrow">
            <DaysOffPanel hub={hub} onChanged={load} />
          </div>
        )}

        {tab === 'service' && (
          <div className="tab-narrow">
            <ServicePanel hub={hub} canWrite={canWrite} onChanged={load} />
          </div>
        )}

        {tab === 'info' && (
          <div className="tab-narrow">
            <div className="panel">
              <h3 className="panel__title">О машине</h3>
              <CarInfo car={car} />
            </div>
          </div>
        )}
      </div>

      {editing && (
        <CarForm car={car} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); load(); }} />
      )}
    </div>
  );
}
