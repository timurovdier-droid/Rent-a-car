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
import { CarVisual } from '../components/CarTile';
import DayCalendar from '../components/DayCalendar';
import { CarRentStatus } from '../components/RentStatus';
import TxList from '../components/TxList';
import DateInput from '../components/DateInput';
import NavIcon from '../components/NavIcon';
import {
  EXPENSE_CATEGORIES, INCOME_CATEGORIES, PAY_METHODS,
  FUEL_LABELS, SERVICE_TYPES, fmtMoney, fmtNumber, fmtDay, localDayOf, todayLocal,
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

function DriverPanel({ hub, canWrite, onChanged }) {
  const { car, current, free_drivers: drivers, assignments, today } = hub;
  const [driverId, setDriverId] = useState('');
  const [day, setDay] = useState(today);
  const [mileage, setMileage] = useState(car.mileage != null ? String(car.mileage) : '');
  const [releasing, setReleasing] = useState(false);
  const [dating, setDating] = useState(false);
  const [payFromOpen, setPayFromOpen] = useState(false);
  const [payFrom, setPayFrom] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setMileage(car.mileage != null ? String(car.mileage) : '');
  }, [car.mileage]);

  async function cancelAssignment() {
    const text = `Убрать ${current.driver_name || 'водителя'} с машины ${car.plate}, как будто выдачи не было?\n\n`
      + 'Используйте, если записали по ошибке. Аренда за эти дни не будет начислена, а запись пропадёт из истории. '
      + 'Если водитель реально ездил и вернул машину — нажмите «Принять машину».';
    if (!window.confirm(text)) return;
    setError('');
    try {
      await api.delete(`/cars/${car.id}/assignments/${current.id}`);
      onChanged();
    } catch (err) {
      setError(errText(err, 'Не удалось убрать водителя'));
    }
  }

  async function assign(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.post(`/cars/${car.id}/assign`, { driver_id: driverId, date: day, mileage, pay_from: payFrom || null });
      setDriverId('');
      setPayFrom('');
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
          <div className="avatar"><NavIcon name="users" size={24} /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="person__name">{current.driver_name || 'Удалённый водитель'}</div>
            <div className="person__sub">
              с {fmtDay(localDayOf(current.start_at))} · выдана с пробегом {fmtNumber(current.mileage_start)} км
              {current.driver_phone ? ` · ${current.driver_phone}` : ''}
            </div>
            {current.pay_from && (
              <div className="person__sub">
                <b>{`Платит с ${fmtDay(current.pay_from)}`}</b>
                {localDayOf(current.start_at) < current.pay_from && (
                  <span className="muted"> · до этой даты аренда не начисляется, хотя машина у водителя</span>
                )}
              </div>
            )}
          </div>
          {canWrite && (
            <div className="driver-actions">
              <button className="btn btn--quiet btn--sm" onClick={() => setReleasing(true)}>Принять машину</button>
              <button className="btn btn--ghost btn--sm" onClick={() => setDating(true)} title="Если водитель взял машину в другой день">Изменить дату</button>
              <button className="btn btn--ghost btn--sm" onClick={() => setPayFromOpen(true)} title="С какого числа водитель платит за машину">Платит с</button>
              <button className="btn btn--ghost btn--sm" onClick={cancelAssignment} title="Если записали водителя по ошибке">Убрать с машины</button>
            </div>
          )}
        </div>
      ) : canWrite ? (
        <form onSubmit={assign}>
          <p className="muted small" style={{ marginTop: 0 }}>Машина свободна. Выдайте её водителю — с этого дня начнётся начисление ставки.</p>
          <div className="field">
            <label className="field__label" htmlFor="as-driver">Водитель</label>
            <Select
              id="as-driver"
              value={driverId}
              onChange={setDriverId}
              required
              placeholder="— выберите свободного водителя —"
              options={drivers.map((d) => ({ value: d.id, label: d.full_name, hint: d.phone }))}
            />
            {drivers.length === 0 && <span className="muted small">Свободных водителей нет. Добавьте их в разделе «Водители».</span>}
          </div>
          <div className="form-grid">
            <div className="field">
              <label className="field__label" htmlFor="as-date">Дата выдачи</label>
              <DateInput id="as-date" className="field__input" value={day} onChange={(e) => setDay(e.target.value)} required />
            </div>
            <div className="field">
              <label className="field__label" htmlFor="as-km">Пробег при выдаче</label>
              <MoneyInput id="as-km" value={mileage} onChange={setMileage} required suffix="км" />
            </div>
            <div className="field">
              <label className="field__label" htmlFor="as-pay">Платит с</label>
              <DateInput id="as-pay" className="field__input" value={payFrom} min={day} onChange={(e) => setPayFrom(e.target.value)} />
              <span className="muted small">Если пусто — с даты выдачи</span>
            </div>
          </div>
          {error && <div className="notice notice--error">{error}</div>}
          <button className="btn" type="submit" disabled={saving || !driverId}>{saving ? 'Выдаю…' : 'Выдать машину'}</button>
        </form>
      ) : (
        <p className="muted">Сейчас без водителя</p>
      )}
      {current && error && <div className="notice notice--error">{error}</div>}

      {releasing && current && (
        <ReleaseModal car={car} current={current} today={today} onClose={() => setReleasing(false)} onDone={() => { setReleasing(false); onChanged(); }} />
      )}
      {dating && current && (
        <StartDateModal car={car} current={current} today={today} onClose={() => setDating(false)} onDone={() => { setDating(false); onChanged(); }} />
      )}
      {payFromOpen && current && (
        <PayFromModal car={car} current={current} onClose={() => setPayFromOpen(false)} onDone={() => { setPayFromOpen(false); onChanged(); }} />
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

function PastAssignmentModal({ car, today, onClose, onDone }) {
  const [drivers, setDrivers] = useState([]);
  const [driverId, setDriverId] = useState('');
  const [startDay, setStartDay] = useState('');
  const [endDay, setEndDay] = useState('');
  const [mileageStart, setMileageStart] = useState(car.mileage != null ? String(car.mileage) : '');
  const [mileageEnd, setMileageEnd] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/drivers')
      .then((data) => setDrivers(Array.isArray(data) ? data : (data?.drivers || data?.items || [])))
      .catch(() => setDrivers([]));
  }, []);

  async function submit(e) {
    e.preventDefault();
    if (!startDay || !endDay) {
      setError('Укажите даты «с» и «по»');
      return;
    }
    if (startDay > endDay) {
      setError('Дата «по» не может быть раньше даты «с»');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const body = {
        driver_id: driverId,
        start_date: startDay,
        end_date: endDay,
        note: note.trim() || undefined,
      };
      if (mileageStart !== '') body.mileage_start = mileageStart;
      if (mileageEnd !== '') body.mileage_end = mileageEnd;
      await api.post(`/cars/${car.id}/assignments/past`, body);
      onDone();
    } catch (err) {
      setError(errText(err, 'Не удалось записать период'));
      setSaving(false);
    }
  }

  return (
    <Modal title="Период работы водителя" onClose={onClose}>
      <form onSubmit={submit}>
        <p className="muted small" style={{ marginTop: 0 }}>
          Отметьте промежуток: с какого по какое число водитель уже ездил (например, с 1 по 10, хотя сегодня 19).
          Аренда начислится за эти дни. Если сейчас на машине другой водитель и даты пересекаются — его выдача сдвинется на день после конца периода.
        </p>
        <div className="field">
          <label className="field__label" htmlFor="pa-driver">Водитель</label>
          <Select
            id="pa-driver"
            value={driverId}
            onChange={setDriverId}
            required
            placeholder="— выберите водителя —"
            options={drivers.map((d) => ({ value: d.id, label: d.full_name || d.name, hint: d.phone }))}
          />
          {drivers.length === 0 && <span className="muted small">Список водителей пуст или не загрузился</span>}
        </div>
        <div className="form-grid">
          <div className="field">
            <label className="field__label" htmlFor="pa-from">Работал с</label>
            <DateInput id="pa-from" className="field__input" value={startDay} max={endDay || today} onChange={(e) => setStartDay(e.target.value)} required />
          </div>
          <div className="field">
            <label className="field__label" htmlFor="pa-to">Работал по</label>
            <DateInput id="pa-to" className="field__input" value={endDay} min={startDay || undefined} max={today} onChange={(e) => setEndDay(e.target.value)} required />
          </div>
        </div>
        <div className="form-grid">
          <div className="field">
            <label className="field__label" htmlFor="pa-km1">Пробег при выдаче</label>
            <MoneyInput id="pa-km1" value={mileageStart} onChange={setMileageStart} suffix="км" />
            <span className="muted small">можно не заполнять</span>
          </div>
          <div className="field">
            <label className="field__label" htmlFor="pa-km2">Пробег при сдаче</label>
            <MoneyInput id="pa-km2" value={mileageEnd} onChange={setMileageEnd} suffix="км" />
            <span className="muted small">можно не заполнять</span>
          </div>
        </div>
        <div className="field">
          <label className="field__label" htmlFor="pa-note">Комментарий</label>
          <input id="pa-note" className="field__input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="необязательно" />
        </div>
        {error && <div className="notice notice--error">{error}</div>}
        <div className="form-actions">
          <button className="btn" type="submit" disabled={saving || !driverId || !startDay || !endDay}>
            {saving ? 'Сохраняю…' : 'Сохранить период'}
          </button>
          <button className="btn btn--quiet" type="button" onClick={onClose}>Отмена</button>
        </div>
      </form>
    </Modal>
  );
}

function DriverHistory({ hub, linkDrivers, canWrite = false, canDelete = false, onChanged }) {
  const { assignments, today, car } = hub;
  const [pastOpen, setPastOpen] = useState(false);
  const [picked, setPicked] = useState(today);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');

  async function remove(a, from, to) {
    const who = a.driver_name || 'Удалённый водитель';
    const text = `Удалить из истории запись «${who}, ${fmtDay(from)} — ${a.end_at ? fmtDay(to) : 'по сей день'}»?\n\n`
      + 'Аренда за эти дни больше не будет начисляться, долг за них пропадёт. Деньги, которые уже записаны, останутся.';
    if (!window.confirm(text)) return;
    setBusy(a.id);
    setError('');
    try {
      await api.delete(`/cars/${car.id}/assignments/${a.id}`);
      onChanged?.();
    } catch (err) {
      setError(errText(err, 'Не удалось удалить запись'));
    } finally {
      setBusy(null);
    }
  }

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

      {canWrite && (
        <div style={{ marginBottom: 12 }}>
          <button type="button" className="btn btn--sm" onClick={() => setPastOpen(true)}>
            Отметить период работы
          </button>
          <p className="muted small" style={{ margin: '6px 0 0' }}>
            Если водитель ездил раньше (например, с 1 по 10), а вы отмечаете сегодня — укажите даты здесь.
          </p>
        </div>
      )}

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
          {error && <div className="notice notice--error">{error}</div>}
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
                  {canDelete && (
                    <button
                      type="button"
                      className="link-btn link-btn--danger dh__delete"
                      disabled={busy === a.id}
                      onClick={() => remove(a, from, to)}
                    >
                      Удалить из истории
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
        </>
      )}
      {pastOpen && (
        <PastAssignmentModal
          car={car}
          today={today}
          onClose={() => setPastOpen(false)}
          onDone={() => { setPastOpen(false); onChanged?.(); }}
        />
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
          <DateInput id="rl-date" className="field__input" value={day} onChange={(e) => setDay(e.target.value)} required />
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

function StartDateModal({ car, current, today, onClose, onDone }) {
  const [day, setDay] = useState(localDayOf(current.start_at));
  const [endDay, setEndDay] = useState('');
  const [mileageEnd, setMileageEnd] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const closedPeriod = Boolean(endDay);

  async function submit(e) {
    e.preventDefault();
    if (endDay && endDay < day) {
      setError('Дата «работал по» не может быть раньше даты «взял машину»');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const body = { date: day };
      if (endDay) {
        body.end_date = endDay;
        if (mileageEnd !== '') body.mileage_end = mileageEnd;
      }
      await api.patch(`/cars/${car.id}/assignments/${current.id}/start`, body);
      onDone();
    } catch (err) {
      setError(errText(err, 'Не удалось изменить дату'));
      setSaving(false);
    }
  }

  return (
    <Modal title="Дата выдачи" onClose={onClose}>
      <form onSubmit={submit}>
        <p className="muted" style={{ marginTop: 0 }}>
          <span data-no-translate>{current.driver_name}</span> · <span>Сейчас записано с</span> {fmtDay(localDayOf(current.start_at))}
        </p>
        <p className="muted small">
          Укажите, когда водитель взял машину — аренда считается с этого дня по сегодня.
          Если период уже закончился — заполните «Работал по»: будет запись «с … по …», машина освободится.
        </p>
        <div className="date-pair">
          <div className="field">
            <label className="field__label" htmlFor="sd-date">Взял машину</label>
            <DateInput
              id="sd-date"
              className="field__input"
              value={day}
              max={endDay || today}
              onChange={(e) => setDay(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label className="field__label" htmlFor="sd-end">Работал по</label>
            <DateInput
              id="sd-end"
              className="field__input"
              value={endDay}
              min={day || undefined}
              max={today}
              onChange={(e) => setEndDay(e.target.value)}
            />
          </div>
        </div>
        <p className="muted small date-pair__hint">
          {closedPeriod ? `Период: ${fmtDay(day)} — ${fmtDay(endDay)}` : 'Второе поле пустое — считается по сей день'}
        </p>
        {closedPeriod && (
          <div className="field">
            <label className="field__label" htmlFor="sd-km">Пробег при сдаче</label>
            <MoneyInput id="sd-km" value={mileageEnd} onChange={setMileageEnd} suffix="км" />
            <span className="muted small">можно не заполнять</span>
          </div>
        )}
        {error && <div className="notice notice--error">{error}</div>}
        <div className="form-actions">
          <button className="btn" type="submit" disabled={saving || !day}>
            {saving ? 'Сохраняю…' : (closedPeriod ? 'Сохранить период' : 'Сохранить')}
          </button>
          <button className="btn btn--quiet" type="button" onClick={onClose}>Отмена</button>
        </div>
      </form>
    </Modal>
  );
}

function PayFromModal({ car, current, onClose, onDone }) {
  const start = localDayOf(current.start_at);
  const [day, setDay] = useState(current.pay_from || start);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function save(date) {
    setSaving(true);
    setError('');
    try {
      await api.patch(`/cars/${car.id}/assignments/${current.id}/pay-from`, { date });
      onDone();
    } catch (err) {
      setError(errText(err, 'Не удалось сохранить'));
      setSaving(false);
    }
  }

  return (
    <Modal title="С какого числа платит" onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); save(day); }}>
        <p className="muted" style={{ marginTop: 0 }}>
          <span data-no-translate>{current.driver_name}</span> · <span>взял машину</span> {fmtDay(start)}
        </p>
        <p className="muted small">
          Аренда начнёт начисляться с этого числа. Дата выдачи и пробег не меняются, дни до этого числа водитель не должен.
        </p>
        <div className="field">
          <label className="field__label" htmlFor="pf-date">Платит с</label>
          <DateInput id="pf-date" className="field__input" value={day} min={start} onChange={(e) => setDay(e.target.value)} required />
        </div>
        {error && <div className="notice notice--error">{error}</div>}
        <div className="form-actions">
          <button className="btn" type="submit" disabled={saving || !day}>{saving ? 'Сохраняю…' : 'Сохранить'}</button>
          {current.pay_from && (
            <button className="btn btn--quiet" type="button" disabled={saving} onClick={() => save(null)}>С даты выдачи</button>
          )}
          <button className="btn btn--quiet" type="button" onClick={onClose}>Отмена</button>
        </div>
      </form>
    </Modal>
  );
}

function RateModal({ hub, onClose, onDone }) {
  const { car, rates, summary, today } = hub;
  const [rate, setRate] = useState('');
  const [from, setFrom] = useState(today);
  const [scope, setScope] = useState('day'); // day | from
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.post(`/cars/${car.id}/rate`, {
        rate,
        valid_from: from,
        only_day: scope === 'day',
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
            <label className="field__label" htmlFor="rt-from">{scope === 'day' ? 'Дата' : 'Действует с'}</label>
            <DateInput id="rt-from" className="field__input" value={from} onChange={(e) => setFrom(e.target.value)} required />
          </div>
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
          <label className="rate-scope__opt" style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <input type="radio" name="rt-scope" checked={scope === 'from'} onChange={() => setScope('from')} />
            <span>
              <b>С этой даты и дальше</b>
              <span className="muted small" style={{ display: 'block' }}>Как раньше: новая цена с выбранного дня</span>
            </span>
          </label>
        </fieldset>
        {error && <div className="notice notice--error">{error}</div>}
        <div className="form-actions">
          <button className="btn" type="submit" disabled={saving || rate === ''}>{saving ? 'Сохраняю…' : 'Изменить ставку'}</button>
          <button className="btn btn--quiet" type="button" onClick={onClose}>Отмена</button>
        </div>
      </form>
      <p className="muted small">
        {scope === 'day'
          ? 'Цена применится только к выбранной дате. Дни до и после останутся со своей ставкой.'
          : 'Старые дни считаются по старой цене — прошлые отчёты не меняются.'}
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
  const idleToday = (hub.idle_days || []).find((d) => d.day === hub.today);

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
            <button className="btn btn--report" onClick={() => { setFlash(''); setEntryOpen(true); }}>
              <span className="btn--report__plus" aria-hidden="true">+</span>Отчёт
            </button>
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
          <CarRentStatus carId={car.id} onChanged={load} />
        )}
        {tab === 'report' && reportView === 'ops' && (
          <TxList carId={car.id} items={hub.transactions} role={role} onChanged={load} />
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
              <DriverHistory
                hub={hub}
                linkDrivers={role !== 'OWNER'}
                canWrite={canWrite}
                canDelete={role === 'ADMIN'}
                onChanged={load}
              />
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
      {debtOpen && <DebtModal carId={car.id} onClose={() => setDebtOpen(false)} />}
      {idleOpen && (
        <IdleModal car={car} today={hub.today} onClose={() => setIdleOpen(false)} onDone={() => { setIdleOpen(false); load(); }} />
      )}
      {rateOpen && (
        <RateModal hub={hub} onClose={() => setRateOpen(false)} onDone={() => { setRateOpen(false); load(); }} />
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
