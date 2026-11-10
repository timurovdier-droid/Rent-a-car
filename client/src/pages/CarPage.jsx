import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../api';
import { useAuth } from '../auth';
import Plate from '../components/Plate';
import StatusMark from '../components/StatusMark';
import Modal from '../components/Modal';
import MoneyInput from '../components/MoneyInput';
import Select, { pairs } from '../components/Select';
import CarForm from '../components/CarForm';
import CarDocuments from '../components/CarDocuments';
import { CarVisual } from '../components/CarTile';
import DayCalendar from '../components/DayCalendar';
import { CarRentStatus, DayReportModal } from '../components/RentStatus';
import TxList from '../components/TxList';
import DateInput from '../components/DateInput';
import NavIcon from '../components/NavIcon';
import {
  EXPENSE_CATEGORIES, INCOME_CATEGORIES, PAY_METHODS,
  FUEL_LABELS, SERVICE_TYPES, fmtMoney, fmtNumber, fmtDay, todayLocal,
} from '../labels';

const errText = (err, fallback) => (err instanceof ApiError ? err.message : fallback);

function Stat({ label, value, hint, tone, suffix = 'сум', onClick }) {
  const body = (
    <>
      <div className="stat__label">{label}</div>
      <div className="stat__value">{fmtMoney(value)}{suffix && <small>{suffix}</small>}</div>
      {hint && <div className="stat__hint">{hint}</div>}
    </>
  );
  const cls = `stat ${tone ? `stat--${tone}` : ''}`;
  return onClick
    ? <button type="button" className={`${cls} stat--link`} onClick={onClick}>{body}</button>
    : <div className={cls}>{body}</div>;
}

const IDLE_REASONS = [
  ['REPAIR', 'На ремонте'],
  ['LEFT', 'Водитель оставил машину'],
  ['OTHER', 'Другое'],
];
const IDLE_LABELS = Object.fromEntries(IDLE_REASONS);

function DebtModal({ carId, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get(`/cars/${carId}/debts`).then(setData).catch((err) => setError(errText(err, 'Не удалось загрузить долг')));
  }, [carId]);

  return (
    <Modal title="Кто и за какие дни должен" onClose={onClose}>
      {error && <div className="notice notice--error">{error}</div>}
      {!data && !error && <div className="muted">Загрузка…</div>}
      {data && (data.days.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>Долгов нет: все дни оплачены.</p>
      ) : (
        <>
          <p className="muted small" style={{ marginTop: 0 }}>
            Дни, за которые водитель не отдал деньги полностью в тот же день.
          </p>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th className="table__th">Дата</th>
                  <th className="table__th">Водитель</th>
                  <th className="table__th table__num">За день</th>
                  <th className="table__th table__num">Должен</th>
                </tr>
              </thead>
              <tbody>
                {data.days.map((d) => (
                  <tr key={d.day} className="table__row">
                    <td className="table__td">{fmtDay(d.day)}</td>
                    <td className="table__td">
                      {d.driver_id && d.driver_name
                        ? <Link to={`/drivers/${d.driver_id}`}>{d.driver_name}</Link>
                        : d.driver_name || '—'}
                    </td>
                    <td className="table__td table__num">{fmtMoney(d.accrued)}</td>
                    <td className="table__td table__num ledger__debt">{fmtMoney(d.left)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                {data.days.reduce((s, d) => s + d.left, 0) > data.debt && (
                  <tr>
                    <td className="table__td" colSpan={3}>Отдал в другие дни (выходные, переплата)</td>
                    <td className="table__td table__num">{`−${fmtMoney(data.days.reduce((s, d) => s + d.left, 0) - data.debt)}`}</td>
                  </tr>
                )}
                <tr>
                  <td className="table__td" colSpan={3}><b>Итого долг</b></td>
                  <td className="table__td table__num ledger__debt"><b>{fmtMoney(data.debt)} сум</b></td>
                </tr>
              </tfoot>
            </table>
          </div>
          {data.pending > 0 && <p className="muted small">{`Ещё ${fmtMoney(data.pending)} сум ждёт подтверждения и пока не учтено.`}</p>}
        </>
      ))}
    </Modal>
  );
}

function IdleModal({ car, today, onClose, onDone }) {
  const [reason, setReason] = useState('REPAIR');
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.post(`/cars/${car.id}/idle`, { reason, from, to: to < from ? from : to });
      onDone();
    } catch (err) {
      setError(errText(err, 'Не удалось отметить простой'));
      setSaving(false);
    }
  }

  return (
    <Modal title="Простой машины" onClose={onClose}>
      <form onSubmit={submit}>
        <p className="muted" style={{ marginTop: 0 }}>
          За дни простоя аренда не начисляется. Снять простой можно во вкладке «Выходные дни».
        </p>
        <div className="field">
          <span className="field__label">Причина</span>
          <div className="chips">
            {IDLE_REASONS.map(([v, l]) => (
              <button type="button" key={v} className={`chip ${reason === v ? 'chip--on' : ''}`} onClick={() => setReason(v)}>{l}</button>
            ))}
          </div>
        </div>
        <div className="form-grid">
          <div className="field">
            <label className="field__label" htmlFor="idle-from">С</label>
            <DateInput id="idle-from" className="field__input" value={from} onChange={(e) => setFrom(e.target.value)} required />
          </div>
          <div className="field">
            <label className="field__label" htmlFor="idle-to">По</label>
            <DateInput id="idle-to" className="field__input" value={to} min={from} onChange={(e) => setTo(e.target.value)} required />
          </div>
        </div>
        {error && <div className="notice notice--error">{error}</div>}
        <div className="form-actions">
          <button className="btn" type="submit" disabled={saving}>{saving ? 'Сохраняю…' : 'Отметить простой'}</button>
          <button className="btn btn--quiet" type="button" onClick={onClose}>Отмена</button>
        </div>
      </form>
    </Modal>
  );
}

function DueBadge({ state, soon, overdue }) {
  if (!state) return null;
  return <span className={`badge ${state === 'OVERDUE' ? 'badge--danger' : 'badge--warn'}`}>{state === 'OVERDUE' ? overdue : soon}</span>;
}

function Summary({ role, s, rate, onDebt, onRate }) {
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
    <div className="stats stats--3">
      <Stat
        label="Ставка аренды"
        value={rate}
        suffix="сум / день"
        hint={onRate ? 'нажмите, чтобы изменить' : 'за каждый день аренды'}
        onClick={onRate}
      />
      <Stat label="Начислено" value={s.accrued} hint={`за ${s.accrued_days} дн. аренды`} />
      <Stat label="Получено" value={s.received} tone="ok" hint={s.pending ? `ещё ${fmtMoney(s.pending)} ждёт подтверждения` : 'подтверждено'} />
      <Stat
        label={s.debt ? 'Долг' : s.overpaid ? 'Переплата' : 'Долг'}
        value={s.debt || s.overpaid}
        tone={s.debt ? 'danger' : 'ok'}
        hint={s.debt ? 'нажмите — кто и за какие дни' : undefined}
        onClick={s.debt ? onDebt : undefined}
      />
      {role === 'ADMIN' && <Stat label="Расходы" value={s.expenses} />}
      {role === 'ADMIN' && <Stat label="Прибыль" value={s.profit} tone="accent" hint="доход − расходы" />}
    </div>
  );
}

function AddEntry({ carId, isAdmin, onClose, onDone }) {
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
      onDone(`${kind === 'INCOME' ? 'Доход' : 'Расход'} ${fmtMoney(amount)} сум ${isAdmin ? 'записан' : 'отправлен админу на подтверждение'}`);
    } catch (err) {
      setNotice({ ok: false, text: errText(err, 'Не удалось записать') });
      setSaving(false);
    }
  }

  const categories = kind === 'INCOME' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  return (
    <Modal title="Добавить в отчёт" onClose={onClose}>
    <form onSubmit={submit}>
      <div className="seg" role="tablist">
        <button type="button" className={`seg__btn seg__btn--income ${kind === 'INCOME' ? 'seg__btn--on' : ''}`} onClick={() => switchKind('INCOME')}>+ Доход</button>
        <button type="button" className={`seg__btn seg__btn--expense ${kind === 'EXPENSE' ? 'seg__btn--on' : ''}`} onClick={() => switchKind('EXPENSE')}>− Расход</button>
      </div>

      <div className="field">
        <label className="field__label" htmlFor="tx-amount">Сумма</label>
        <MoneyInput id="tx-amount" value={amount} onChange={setAmount} required placeholder="500 000" autoFocus />
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
          <DateInput id="tx-date" className="field__input" value={day} onChange={(e) => setDay(e.target.value)} required />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="tx-comment">Комментарий</label>
          <input id="tx-comment" className="field__input" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="необязательно" maxLength={500} />
        </div>
      </div>

      {notice && <div className={`notice ${notice.ok ? 'notice--ok' : 'notice--error'}`}>{notice.text}</div>}
      <div className="form-actions">
        <button className="btn" type="submit" disabled={saving || !amount}>{saving ? 'Записываю…' : 'Записать'}</button>
        <button className="btn btn--quiet" type="button" onClick={onClose}>Отмена</button>
      </div>
      {!isAdmin && <p className="muted small" style={{ marginBottom: 0 }}>Сумма попадёт в отчёт после подтверждения админом</p>}
    </form>
    </Modal>
  );
}

function RateModal({ hub, onClose, onDone }) {
  const { car, rates, summary, today } = hub;
  const [rate, setRate] = useState('');
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [scope, setScope] = useState('day'); // day | range | from
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const replaced = scope === 'from' ? rates.filter((r) => String(r.valid_from).slice(0, 10) > from) : [];

  async function submit(e) {
    e.preventDefault();
    if (scope === 'range' && to < from) {
      setError('Дата «по» раньше даты «с»');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.post(`/cars/${car.id}/rate`, {
        rate,
        valid_from: from,
        only_day: scope === 'day',
        ...(scope === 'range' ? { valid_to: to } : {}),
      });
      onDone();
    } catch (err) {
      setError(errText(err, 'Не удалось изменить ставку'));
      setSaving(false);
    }
  }

  return (
    <Modal title="Ставка аренды" onClose={onClose}>
      <div className="stat__value" style={{ marginTop: 0 }}>{fmtMoney(car.daily_rate)}<small>сум / день</small></div>
      <p className="muted small" style={{ margin: '4px 0 12px' }}>
        Начисляется за каждый день, пока машина у водителя, кроме выходных. Начислено всего: {fmtMoney(summary.accrued)} сум за {summary.accrued_days} дн.
      </p>
      <form onSubmit={submit}>
        <div className="form-grid">
          <div className="field">
            <label className="field__label" htmlFor="rt-rate">Новая ставка</label>
            <MoneyInput id="rt-rate" value={rate} onChange={setRate} required suffix="сум" autoFocus />
          </div>
          <div className="field">
            <label className="field__label" htmlFor="rt-from">{scope === 'day' ? 'Дата' : scope === 'range' ? 'С' : 'Действует с'}</label>
            <DateInput id="rt-from" className="field__input" value={from} onChange={(e) => setFrom(e.target.value)} required />
          </div>
          {scope === 'range' && (
            <div className="field">
              <label className="field__label" htmlFor="rt-to">По</label>
              <DateInput id="rt-to" className="field__input" value={to} min={from} onChange={(e) => setTo(e.target.value)} required />
            </div>
          )}
        </div>
        <fieldset className="rate-scope" style={{ border: 0, padding: 0, margin: '0 0 12px' }}>
          <legend className="field__label" style={{ marginBottom: 6 }}>На какие дни</legend>
          <label className="rate-scope__opt" style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 6 }}>
            <input type="radio" name="rt-scope" checked={scope === 'day'} onChange={() => setScope('day')} />
            <span>
              <b>Только этот день</b>
              <span className="muted small" style={{ display: 'block' }}>Остальные даты без изменений</span>
            </span>
          </label>
          <label className="rate-scope__opt" style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 6 }}>
            <input type="radio" name="rt-scope" checked={scope === 'range'} onChange={() => setScope('range')} />
            <span>
              <b>За период</b>
              <span className="muted small" style={{ display: 'block' }}>Например, задним числом за прошлые дни. После периода — прежняя цена</span>
            </span>
          </label>
          <label className="rate-scope__opt" style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <input type="radio" name="rt-scope" checked={scope === 'from'} onChange={() => setScope('from')} />
            <span>
              <b>С этой даты и дальше</b>
              <span className="muted small" style={{ display: 'block' }}>Новая цена с выбранного дня по сегодня и далее</span>
            </span>
          </label>
        </fieldset>
        {replaced.length > 0 && (
          <div className="notice">
            {`Более поздние изменения ставки (${replaced.map((r) => `с ${fmtDay(String(r.valid_from).slice(0, 10))} — ${fmtMoney(r.rate)}`).join(', ')}) будут заменены новой ценой.`}
          </div>
        )}
        {error && <div className="notice notice--error">{error}</div>}
        <div className="form-actions">
          <button className="btn" type="submit" disabled={saving || rate === ''}>{saving ? 'Сохраняю…' : 'Изменить ставку'}</button>
          <button className="btn btn--quiet" type="button" onClick={onClose}>Отмена</button>
        </div>
      </form>
      <p className="muted small">
        {scope === 'day'
          ? 'Цена применится только к выбранной дате. Дни до и после останутся со своей ставкой.'
          : scope === 'range'
            ? 'Начисление и долг за эти дни пересчитаются по новой цене. Дни до и после периода не меняются.'
            : 'Дни до выбранной даты считаются по старой цене. Если дата в прошлом, начисление и долг с неё пересчитаются.'}
      </p>
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
    </Modal>
  );
}

const MONTHS_GEN_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

function shortDays(list) {
  return [...list].sort().map((d) => `${Number(d.slice(8, 10))} ${MONTHS_GEN_SHORT[Number(d.slice(5, 7)) - 1]}`).join(', ');
}

function DaysOffPanel({ hub, onChanged }) {
  const { car, days_off: saved, today } = hub;
  const savedSet = useMemo(() => new Set(saved), [saved]);
  const idleMap = useMemo(() => new Map((hub.idle_days || []).map((d) => [d.day, d.reason])), [hub.idle_days]);
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
    if (idleMap.has(day)) return 'cal__day--on cal__day--idle';
    return savedSet.has(day) ? 'cal__day--on' : '';
  };

  const upcoming = saved.filter((d) => d >= today && !remove.has(d) && !idleMap.has(d));
  const idleList = [...idleMap.keys()].filter((d) => d >= `${today.slice(0, 7)}-01` && !remove.has(d)).sort();
  const dirty = add.size > 0 || remove.size > 0;

  return (
    <div className="panel">
      <h3 className="panel__title">Выходные и простой (без начисления)</h3>
      <p className="muted small" style={{ margin: '0 0 12px' }}>
        Нажимайте на дни, когда машина не работает: например 1, 3, 6 и 21 число. Повторное нажатие снимает выходной или простой.
        Простой (ремонт, водитель оставил машину) отмечается кнопкой «Простой» вверху и показан оранжевым.
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
          {idleList.length > 0 && <><br />{`Простой: ${shortDays(idleList.slice(-12))}`}</>}
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
              <Select id="sv-type" value={type} onChange={setType} options={pairs(SERVICE_TYPES)} />
            </div>
            <div className="field">
              <label className="field__label" htmlFor="sv-date">{doneNow ? 'Когда сделано' : 'Сделать до даты'}</label>
              <DateInput id="sv-date" className="field__input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
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
          <DateInput id="sd-date" className="field__input" value={day} onChange={(e) => setDay(e.target.value)} required />
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
  const [debtOpen, setDebtOpen] = useState(false);
  const [idleOpen, setIdleOpen] = useState(false);
  const [entryOpen, setEntryOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportKey, setReportKey] = useState(0);
  const [rateOpen, setRateOpen] = useState(false);
  const [flash, setFlash] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab') || 'report';
  const reportView = searchParams.get('view') === 'ops' ? 'ops' : 'days';

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
  const idleToday = (hub.idle_days || []).find((d) => d.day === hub.today);

  const tabs = [
    { key: 'report', label: 'Отчёт', count: pending.length, alert: true },
    canWrite && { key: 'days', label: 'Выходные дни', count: upcomingDaysOff },
    { key: 'service', label: 'Обслуживание', count: dueCount, alert: true },
    { key: 'docs', label: 'Документы', count: (hub.documents || []).length },
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
            {hub.driver && (
              <span className="badge badge--muted">
                {`Водитель: ${hub.driver.name}${hub.driver.day !== hub.today ? ` (${fmtDay(hub.driver.day)})` : ''}`}
              </span>
            )}
            {car.default_driver_id && car.default_driver_name && (
              <span className="badge badge--muted" title="Подставляется в новый отчёт за день">
                {`По умолчанию: ${car.default_driver_name}`}
              </span>
            )}
            {serviceDue && <DueBadge state={serviceDue.due} soon={`Скоро: ${serviceDue.label}`} overdue="Пора на обслуживание" />}
            <DueBadge state={car.insurance_due} soon="Страховка скоро кончится" overdue="Страховка просрочена" />
            <DueBadge state={car.inspection_due} soon="Техосмотр скоро" overdue="Техосмотр просрочен" />
          </div>
          </div>
        </div>
        {canWrite && (
          <div className="form-actions">
            <button className="btn btn--report" onClick={() => { setFlash(''); setReportOpen(true); }}>
              <span className="btn--report__plus" aria-hidden="true">+</span>Отчёт
            </button>
            <button className="btn btn--quiet" onClick={() => { setFlash(''); setEntryOpen(true); }} title="Другой доход или расход по машине">Доход / расход</button>
            <button className="btn btn--quiet" onClick={() => setIdleOpen(true)} title="Машина на ремонте или водитель оставил её — без начисления аренды">Простой</button>
            <button className="btn btn--quiet" onClick={() => setEditing(true)}>Изменить данные</button>
            {role === 'ADMIN' && <button className="btn btn--ghost" onClick={() => removeCar('archive')}>В архив</button>}
            {role === 'ADMIN' && <button className="btn btn--danger" onClick={() => removeCar('delete')}>Удалить</button>}
          </div>
        )}
      </div>

      {error && <div className="notice notice--error">{error}</div>}
      {flash && <div className="notice notice--ok">{flash}</div>}

      {idleToday && (
        <div className="notice notice--idle">
          {`Сегодня простой: ${IDLE_LABELS[idleToday.reason] || 'простой'}. Аренда за этот день не начисляется.`}
        </div>
      )}

      <Summary
        role={role}
        s={hub.summary}
        rate={car.daily_rate}
        onDebt={canWrite ? () => setDebtOpen(true) : undefined}
        onRate={role === 'ADMIN' ? () => setRateOpen(true) : undefined}
      />

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
              className={`view-switch__btn ${reportView === 'days' ? 'view-switch__btn--on' : ''}`}
              onClick={() => setSearchParams({}, { replace: true })}
            >
              По дням
            </button>
            <button
              type="button"
              className={`view-switch__btn ${reportView === 'ops' ? 'view-switch__btn--on' : ''}`}
              onClick={() => setSearchParams({ view: 'ops' }, { replace: true })}
            >
              Операции
            </button>
          </div>
        )}
        {tab === 'report' && reportView === 'days' && (
          <CarRentStatus key={reportKey} carId={car.id} onChanged={load} />
        )}
        {tab === 'report' && reportView === 'ops' && (
          <TxList carId={car.id} items={hub.transactions} role={role} onChanged={load} />
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

        {tab === 'docs' && (
          <div className="tab-narrow">
            <CarDocuments
              carId={car.id}
              documents={hub.documents}
              canWrite={canWrite}
              onChanged={load}
            />
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
      {debtOpen && <DebtModal carId={car.id} onClose={() => setDebtOpen(false)} />}
      {idleOpen && (
        <IdleModal car={car} today={hub.today} onClose={() => setIdleOpen(false)} onDone={() => { setIdleOpen(false); load(); }} />
      )}
      {rateOpen && (
        <RateModal hub={hub} onClose={() => setRateOpen(false)} onDone={() => { setRateOpen(false); load(); }} />
      )}
      {reportOpen && (
        <DayReportModal
          carId={car.id}
          day={hub.today}
          onClose={() => setReportOpen(false)}
          onRefresh={() => { setReportKey((k) => k + 1); load(); }}
          onDone={() => {
            setReportOpen(false);
            setFlash('Отчёт за день записан');
            setReportKey((k) => k + 1);
            openTab('report');
            load();
          }}
        />
      )}
      {entryOpen && (
        <AddEntry
          carId={car.id}
          isAdmin={role === 'ADMIN'}
          onClose={() => setEntryOpen(false)}
          onDone={(text) => { setEntryOpen(false); setFlash(text); openTab('report'); load(); }}
        />
      )}
    </div>
  );
}
