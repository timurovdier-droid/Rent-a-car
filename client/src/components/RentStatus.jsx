import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import Plate from './Plate';
import Modal from './Modal';
import MoneyInput from './MoneyInput';
import Select from './Select';
import { fmtMoney, fmtDay } from '../labels';
import DateInput from './DateInput';
import TxList from './TxList';
import PeriodPicker from './PeriodPicker';

const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const WEEK = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

function shiftMonth(month, n) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

function monthCells(month) {
  const [y, m] = month.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const lead = (first.getUTCDay() + 6) % 7;
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells = Array.from({ length: lead }, () => null);
  for (let d = 1; d <= count; d += 1) cells.push(`${month}-${String(d).padStart(2, '0')}`);
  while (cells.length % 7) cells.push(null);
  return cells;
}

// Те же правила, что у сервера (closeCalendarDays), но только по дням периода.
function periodStatus(status, period) {
  if (!period) return status;
  const days = status.days.filter((d) => d.day >= period.from && d.day <= period.to);
  const byDriver = new Map();
  let pending = 0;
  for (const d of days) {
    const key = d.driver_id || 0;
    const g = byDriver.get(key) || { accrued: 0, paid: 0 };
    g.accrued += d.accrued || 0;
    g.paid += d.paid || 0;
    byDriver.set(key, g);
    pending += d.pending || 0;
  }
  const debt = [...byDriver.values()].reduce((s, g) => s + Math.max(g.accrued - g.paid, 0), 0);
  let paidThrough = null;
  let debtFrom = null;
  let debtDays = 0;
  for (const d of days) {
    if (!d.accrued) continue;
    if (d.status === 'paid' || d.status === 'covered') {
      if (!debtFrom) paidThrough = d.day;
    } else if (d.status === 'part' || d.status === 'unpaid') {
      if (!debtFrom) debtFrom = d.day;
      debtDays += 1;
    }
  }
  return {
    ...status,
    days,
    debt,
    pending,
    paid_through: paidThrough,
    debt_from: debtFrom,
    debt_days: debtDays,
    ahead_until: null,
  };
}

function cellState(day, info, status) {
  if ((info?.status === 'off' || info?.status === 'none') && info.paid > 0) return 'offpaid';
  if (info) return info.status;
  if (day > status.today && status.ahead_until && day <= status.ahead_until) return 'ahead';
  if (day > status.today) return 'future';
  return 'empty';
}

function Shortfall({ value }) {
  return (
    <>
      <span className="rs-cell__sum rs-cell__sum--full">{`−${fmtMoney(value)}`}</span>
      <span className="rs-cell__sum rs-cell__sum--short">{`−${fmtMoney(Math.round(value / 1000))}k`}</span>
    </>
  );
}

function DriverMark({ info }) {
  if (!info?.driver_name) return null;
  const short = info.driver_name.split(/\s+/)[0];
  return <span className="rs-cell__who">{short}</span>;
}

function PaidSum({ value }) {
  if (!value) return null;
  return (
    <>
      <span className="rs-cell__sum rs-cell__sum--full">{`+${fmtMoney(value)}`}</span>
      <span className="rs-cell__sum rs-cell__sum--short">{`+${fmtMoney(Math.round(value / 1000))}k`}</span>
    </>
  );
}

function CellBody({ state, info }) {
  if (state === 'paid') {
    return (
      <>
        <span className="rs-cell__label">Закрыто</span>
        <PaidSum value={info?.paid} />
        <DriverMark info={info} />
      </>
    );
  }
  if (state === 'covered') {
    return (
      <>
        <span className="rs-cell__label">Из переплаты</span>
        <PaidSum value={info?.paid} />
        <DriverMark info={info} />
      </>
    );
  }
  if (state === 'part') {
    return (
      <>
        <span className="rs-cell__label">Не доплатил</span>
        <Shortfall value={info.left} />
        <DriverMark info={info} />
      </>
    );
  }
  if (state === 'unpaid') {
    return (
      <>
        <span className="rs-cell__label">Не оплачено</span>
        <Shortfall value={info.left} />
        <DriverMark info={info} />
      </>
    );
  }
  if (state === 'off') {
    return (
      <>
        <span className="rs-cell__label">{info?.idle ? 'Простой' : 'Выходной'}</span>
        <DriverMark info={info} />
      </>
    );
  }
  if (state === 'offpaid') {
    const why = info?.idle ? 'Простой' : info?.day_off ? 'Выходной' : null;
    return (
      <>
        <span className="rs-cell__label">{why ? `${why} · дал` : 'Дал'}</span>
        <PaidSum value={info?.paid} />
        <DriverMark info={info} />
      </>
    );
  }
  if (state === 'ahead') return <span className="rs-cell__label">Оплачено вперёд</span>;
  return null;
}

// Водитель по умолчанию: уже в отчёте за день → закреплён за машиной → последний по отчётам.
function defaultDriverFor(days, date, defaultDriver) {
  const own = days.find((d) => d.day === date && !d.extra && d.driver_id);
  if (own) return own.driver_id;
  if (defaultDriver?.id) return defaultDriver.id;
  let last = null;
  for (const d of days) if (d.day < date && !d.extra && d.driver_id) last = d.driver_id;
  return last;
}

export function DayReportModal({ carId, status: givenStatus, day, onClose, onDone, onRefresh }) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [status, setStatus] = useState(givenStatus || null);
  const [drivers, setDrivers] = useState(null);
  const [date, setDate] = useState(day);
  const [driverId, setDriverId] = useState('');
  const [paidMode, setPaidMode] = useState(true);
  const [cash, setCash] = useState('');
  const [card, setCard] = useState('');
  const [balance, setBalance] = useState('');
  const [deposit, setDeposit] = useState('');
  const [dayRateEdit, setDayRateEdit] = useState('');
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [rateSaved, setRateSaved] = useState(false);
  const [error, setError] = useState('');
  const [busyDrivers, setBusyDrivers] = useState([]);
  const [defaultBusy, setDefaultBusy] = useState(false);

  const days = status?.days || [];
  const info = days.find((item) => item.day === date && !item.extra);
  const dayRate = info?.accrued > 0 ? info.accrued : (status?.rate || 0);
  const covered = info ? Number(info.covered || 0) : 0;
  const editRate = Number(String(dayRateEdit || '').replace(/\D/g, '')) || 0;
  const left = Math.max(editRate - covered, 0);
  const total = (Number(cash) || 0) + (Number(card) || 0) + (Number(balance) || 0) + (Number(deposit) || 0);
  const driver = (drivers || []).find((d) => String(d.id) === String(driverId)) || null;
  const depositLeft = Number(driver?.deposit || 0);

  useEffect(() => {
    if (givenStatus) return undefined;
    let alive = true;
    api.get(`/cars/${carId}/rent-status`)
      .then((data) => { if (alive) setStatus(data.status); })
      .catch((err) => { if (alive) setError(err.message || 'Не удалось загрузить календарь'); });
    return () => { alive = false; };
  }, [carId, givenStatus]);

  useEffect(() => {
    let alive = true;
    api.get('/drivers')
      .then((list) => { if (alive) setDrivers(Array.isArray(list) ? list : []); })
      .catch(() => { if (alive) setDrivers([]); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!date) return undefined;
    let alive = true;
    api.get(`/cars/${carId}/busy-drivers?day=${encodeURIComponent(date)}`)
      .then((data) => { if (alive) setBusyDrivers(Array.isArray(data.busy) ? data.busy : []); })
      .catch(() => { if (alive) setBusyDrivers([]); });
    return () => { alive = false; };
  }, [carId, date]);

  const busyById = useMemo(
    () => new Map(busyDrivers.map((b) => [String(b.driver_id), b])),
    [busyDrivers]
  );

  useEffect(() => {
    if (!status) return;
    const dayInfo = days.find((item) => item.day === date && !item.extra);
    const pick = defaultDriverFor(status.days, date, status.default_driver);
    if (dayInfo?.reported) {
      setDriverId(pick ? String(pick) : '');
      return;
    }
    if (pick && busyById.has(String(pick))) {
      setDriverId('');
      return;
    }
    setDriverId(pick ? String(pick) : '');
  }, [status, date, busyById, days]);

  useEffect(() => {
    setDayRateEdit(dayRate ? String(dayRate) : '');
    setRateSaved(false);
  }, [date, dayRate]);

  function payAll(setter, maxAmount) {
    setCash('');
    setCard('');
    setBalance('');
    setDeposit('');
    const need = left || dayRate || 0;
    const value = maxAmount != null ? Math.min(need, maxAmount) : need;
    setter(String(value || ''));
  }

  async function saveDayRate() {
    if (!Number.isFinite(editRate) || editRate < 0) {
      setError('Укажите ставку на этот день');
      return;
    }
    setSaving(true);
    setError('');
    setRateSaved(false);
    try {
      await api.post(`/cars/${carId}/rate`, { rate: editRate, valid_from: date, only_day: true });
      setRateSaved(true);
      setSaving(false);
      onRefresh?.();
    } catch (err) {
      setError(err.message || 'Не удалось изменить ставку');
      setSaving(false);
    }
  }

  async function removeDriver() {
    const who = info?.driver_name || 'водителя';
    if (!window.confirm(`Убрать ${who} с ${fmtDay(date)}? Аренда за этот день больше не будет начисляться. Записанные деньги останутся.`)) return;
    setSaving(true);
    setError('');
    try {
      await api.delete(`/cars/${carId}/day-report/${date}`);
      onDone();
    } catch (err) {
      setError(err.message || 'Не удалось убрать водителя');
      setSaving(false);
    }
  }

  async function submit(e) {
    e.preventDefault();
    if (!driverId) {
      setError('Выберите водителя, который ездил в этот день');
      return;
    }
    if (paidMode && !total) {
      setError('Впишите сумму или отметьте «Не платил»');
      return;
    }
    if (paidMode && Number(deposit) > depositLeft) {
      setError('В депозите водителя меньше этой суммы');
      return;
    }
    setSaving(true);
    setError('');
    try {
      // Если ставку на день поменяли — сохраняем её вместе с отчётом.
      if (isAdmin && editRate !== dayRate) {
        await api.post(`/cars/${carId}/rate`, { rate: editRate, valid_from: date, only_day: true });
      }
      await api.post(`/cars/${carId}/day-report`, paidMode
        ? { date, driver_id: driverId, cash, card, balance, deposit, comment }
        : { date, driver_id: driverId, comment });
      onDone();
    } catch (err) {
      setError(err.message || 'Не удалось записать отчёт');
      setSaving(false);
    }
  }

  if (!status) {
    return (
      <Modal title={`Отчёт за ${fmtDay(date)}`} onClose={onClose}>
        {error ? <div className="notice notice--error">{error}</div> : <div className="muted">Загрузка…</div>}
      </Modal>
    );
  }

  if (info?.report_blocked) {
    return (
      <Modal title={`Отчёт за ${fmtDay(date)}`} onClose={onClose}>
        <div className="notice notice--error" style={{ marginTop: 0 }}>
          {info.report_block_reason || 'В этот день водитель уже записан на другую машину. Отчёт на этой машине недоступен.'}
        </div>
        <div className="form-actions">
          <button className="btn btn--quiet" type="button" onClick={onClose}>Закрыть</button>
        </div>
      </Modal>
    );
  }

  const otherDriver = info?.reported && info.driver_id && String(info.driver_id) !== String(driverId);
  const driverConflict = driverId ? busyById.get(String(driverId)) : null;
  const defaultDriver = status.default_driver;
  const canSaveDefault = (user?.role === 'ADMIN' || user?.role === 'DISPATCHER')
    && driverId && !driverConflict
    && String(defaultDriver?.id || '') !== String(driverId);

  async function saveDefaultDriver() {
    if (!driverId || defaultBusy) return;
    setDefaultBusy(true);
    setError('');
    try {
      await api.patch(`/cars/${carId}`, { default_driver_id: driverId });
      const who = driver?.full_name || 'Водитель';
      setStatus((s) => (s ? { ...s, default_driver: { id: Number(driverId), name: who } } : s));
    } catch (err) {
      setError(err.message || 'Не удалось сохранить водителя по умолчанию');
    } finally {
      setDefaultBusy(false);
    }
  }

  async function clearDefaultDriver() {
    if (defaultBusy) return;
    setDefaultBusy(true);
    setError('');
    try {
      await api.patch(`/cars/${carId}`, { default_driver_id: null });
      setStatus((s) => (s ? { ...s, default_driver: null } : s));
    } catch (err) {
      setError(err.message || 'Не удалось убрать водителя по умолчанию');
    } finally {
      setDefaultBusy(false);
    }
  }

  return (
    <Modal title={`Отчёт за ${fmtDay(date)}`} onClose={onClose}>
      <form onSubmit={submit} className="pay-day">
        <div className="pay-day__head">
          <div className="field">
            <label className="field__label" htmlFor="drp-date">Дата отчёта</label>
            <DateInput
              id="drp-date"
              className="field__input"
              value={date}
              max={status.today}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label className="field__label" htmlFor="drp-driver">Водитель</label>
            <Select
              id="drp-driver"
              value={driverId}
              onChange={setDriverId}
              required
              disabled={!drivers}
              placeholder={drivers ? '— кто ездил в этот день —' : 'Загрузка…'}
              options={(drivers || []).map((d) => {
                const hit = busyById.get(String(d.id));
                if (!hit) return { value: String(d.id), label: d.full_name, hint: d.phone };
                return {
                  value: String(d.id),
                  label: d.full_name,
                  hint: `уже на ${hit.plate} в этот день`,
                  disabled: true,
                };
              })}
            />
          </div>
        </div>
        {defaultDriver?.name && (
          <p className="muted small" style={{ margin: '0 0 8px' }}>
            {`На этой машине по умолчанию: ${defaultDriver.name}. В отчёте можно выбрать другого водителя.`}
            {(user?.role === 'ADMIN' || user?.role === 'DISPATCHER') && (
              <>
                {' '}
                <button type="button" className="link-btn" disabled={defaultBusy} onClick={clearDefaultDriver}>
                  Убрать
                </button>
              </>
            )}
          </p>
        )}
        {canSaveDefault && (
          <p className="muted small" style={{ margin: '0 0 8px' }}>
            <button type="button" className="link-btn" disabled={defaultBusy} onClick={saveDefaultDriver}>
              Запомнить выбранного как водителя по умолчанию для этой машины
            </button>
          </p>
        )}
        {driverConflict && (
          <div className="notice notice--error">
            {`${driverConflict.driver_name || 'Водитель'} уже записан на ${driverConflict.plate} (${driverConflict.brand} ${driverConflict.model}) за ${fmtDay(date)}. Выберите другого водителя или исправьте отчёт на той машине.`}
          </div>
        )}
        {otherDriver && (
          <div className="notice">
            {`На ${fmtDay(date)} записан ${info.driver_name}. После сохранения день и его аренда перейдут к выбранному водителю.`}
          </div>
        )}

        <div className="seg pay-day__seg" role="tablist" aria-label="Оплата за день">
          <button type="button" className={`seg__btn seg__btn--income ${paidMode ? 'seg__btn--on' : ''}`} onClick={() => setPaidMode(true)}>Платил</button>
          <button type="button" className={`seg__btn seg__btn--expense ${!paidMode ? 'seg__btn--on' : ''}`} onClick={() => setPaidMode(false)}>Не платил</button>
        </div>

        <div className="pay-day__info">
          <dl className="kv pay-day__kv">
            <div>
              <dt>Аренда в день</dt>
              <dd>
                {isAdmin ? (
                  <MoneyInput
                    id="drp-rate"
                    value={dayRateEdit}
                    onChange={(v) => { setDayRateEdit(v); setRateSaved(false); }}
                    suffix="сум"
                    placeholder="0"
                  />
                ) : `${fmtMoney(dayRate)} сум`}
              </dd>
            </div>
            <div><dt>Уже закрыто</dt><dd>{fmtMoney(covered)} сум</dd></div>
            <div><dt>Не хватает</dt><dd className={left > 0 ? 'ledger__debt' : ''}>{fmtMoney(left)} сум</dd></div>
            {driver && <div><dt>Депозит водителя</dt><dd>{fmtMoney(depositLeft)} сум</dd></div>}
          </dl>
          {isAdmin && (
            <button
              type="button"
              className="pay-day__rate-link"
              disabled={saving || !editRate || editRate === dayRate}
              onClick={saveDayRate}
            >
              {saving ? 'Сохраняю…' : 'Ставка только на этот день'}
            </button>
          )}
          {rateSaved && <p className="muted small" style={{ margin: 0 }}>Ставка на {fmtDay(date)} сохранена — остальные дни не менялись.</p>}
        </div>

        {paidMode ? (
          <>
            <div className="pay-day__grid">
              <div className="field">
                <label className="field__label" htmlFor="drp-cash">Наличными</label>
                <MoneyInput id="drp-cash" value={cash} onChange={setCash} autoFocus />
              </div>
              <div className="field">
                <label className="field__label" htmlFor="drp-card">Картой</label>
                <MoneyInput id="drp-card" value={card} onChange={setCard} />
              </div>
              <div className="field">
                <label className="field__label" htmlFor="drp-balance">С баланса</label>
                <MoneyInput id="drp-balance" value={balance} onChange={setBalance} />
              </div>
              <div className="field">
                <label className="field__label" htmlFor="drp-deposit">Из депозита</label>
                <MoneyInput id="drp-deposit" value={deposit} onChange={setDeposit} disabled={!driver} />
              </div>
            </div>
            <p className="muted small pay-day__hint">
              «Из депозита» списывается с депозита выбранного водителя и пишется в историю депозита.
            </p>
            {(left > 0 || dayRate > 0) && (
              <div className="pay-day__chips">
                <button type="button" className="chip" onClick={() => payAll(setCash)}>Всё наличными</button>
                <button type="button" className="chip" onClick={() => payAll(setCard)}>Всё картой</button>
                <button type="button" className="chip" onClick={() => payAll(setBalance)}>Всё с баланса</button>
                <button
                  type="button"
                  className="chip"
                  disabled={!driver || depositLeft <= 0}
                  onClick={() => payAll(setDeposit, depositLeft)}
                >
                  {driver && depositLeft > 0
                    ? `Всё из депозита · ${fmtMoney(Math.min(left || dayRate, depositLeft))}`
                    : 'Всё из депозита'}
                </button>
              </div>
            )}
          </>
        ) : (
          <p className="muted pay-day__hint">
            {`Аренда за ${fmtDay(date)} (${fmtMoney(editRate || dayRate)} сум) запишется долгом на выбранного водителя.`}
          </p>
        )}

        <div className="field">
          <label className="field__label" htmlFor="drp-note">Комментарий</label>
          <input id="drp-note" className="field__input" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="необязательно" maxLength={200} />
        </div>
        {error && <div className="notice notice--error">{error}</div>}
        <div className="form-actions">
          <button className="btn" type="submit" disabled={saving || !date || !driverId || Boolean(driverConflict)}>
            {saving ? 'Записываю…' : paidMode ? 'Записать отчёт' : 'Записать: не платил'}
          </button>
          <button className="btn btn--quiet" type="button" onClick={onClose}>Отмена</button>
        </div>
        {info?.reported && (
          <div className="pay-day__remove">
            <button className="link-btn link-btn--danger" type="button" disabled={saving} onClick={removeDriver}>
              Убрать водителя с этого дня
            </button>
          </div>
        )}
      </form>
    </Modal>
  );
}

function DayChoiceModal({ day, info, onAdd, onEdit, onClose }) {
  return (
    <Modal title={`День ${fmtDay(day)}`} onClose={onClose}>
      <p className="muted" style={{ marginTop: 0 }}>
        {`За этот день уже записано ${fmtMoney((info.paid || 0) + (info.pending || 0))} сум. Что сделать?`}
      </p>
      <div className="form-actions">
        <button type="button" className="btn" onClick={onAdd}>Добавить сумму</button>
        <button type="button" className="btn btn--quiet" onClick={onEdit}>Изменить отчёт</button>
      </div>
    </Modal>
  );
}

function DayTxModal({ driverId, carId, day, role, onClose, onChanged }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);

  useEffect(() => {
    setError('');
    const req = carId
      ? api.get(`/cars/${carId}/hub`).then((data) => data.transactions || [])
      : api.get(`/drivers/${driverId}/transactions`).then((data) => data.items || []);
    req
      .then((list) => setItems(list.filter((tx) => String(tx.tx_date).slice(0, 10) === day)))
      .catch((err) => setError(err.message || 'Не удалось загрузить операции'));
  }, [driverId, carId, day, version]);

  return (
    <Modal title={`Отчёт за ${fmtDay(day)}`} onClose={onClose}>
      <p className="muted small" style={{ marginTop: 0 }}>
        Здесь можно исправить сумму, способ или дату записи, либо удалить её. Все изменения попадают в ведомость.
      </p>
      {error && <div className="notice notice--error">{error}</div>}
      {!items && !error && <div className="muted">Загрузка…</div>}
      {items && items.length === 0 && <div className="empty">За этот день записей нет</div>}
      {items && items.length > 0 && (
        <TxList items={items} carId={carId} role={role} showCar={!carId} onChanged={() => { setVersion((v) => v + 1); onChanged?.(); }} />
      )}
    </Modal>
  );
}

function DebtTile({ hasDebt, onOpen, children }) {
  if (!hasDebt) return <div className="rs-tile rs-tile--ok">{children}</div>;
  return <button type="button" className="rs-tile rs-tile--bad rs-tile--link" onClick={onOpen}>{children}</button>;
}

function DebtDaysModal({ status, onClose }) {
  const days = status.days.filter((d) => d.left > 0).reverse();
  const otherPaid = days.reduce((s, d) => s + d.left, 0) - status.debt;
  return (
    <Modal title="За какие дни долг" onClose={onClose}>
      <p className="muted small" style={{ marginTop: 0 }}>
        Дни, за которые водитель не отдал деньги полностью в тот же день.
      </p>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th className="table__th">Дата</th>
              <th className="table__th">{days.some((d) => d.driver_name) ? 'Водитель' : 'Машина'}</th>
              <th className="table__th table__num">За день</th>
              <th className="table__th table__num">Должен</th>
            </tr>
          </thead>
          <tbody>
            {days.map((d) => (
              <tr key={d.day} className="table__row">
                <td className="table__td">{fmtDay(d.day)}</td>
                <td className="table__td">
                  {d.driver_name || (d.plates || []).map((p) => <Plate key={p} value={p} />)}
                </td>
                <td className="table__td table__num">{fmtMoney(d.accrued)}</td>
                <td className="table__td table__num ledger__debt">{fmtMoney(d.left)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            {otherPaid > 0 && (
              <tr>
                <td className="table__td" colSpan={3}>Отдал в другие дни (выходные, переплата)</td>
                <td className="table__td table__num">{`−${fmtMoney(otherPaid)}`}</td>
              </tr>
            )}
            <tr>
              <td className="table__td" colSpan={3}><b>Итого долг</b></td>
              <td className="table__td table__num ledger__debt"><b>{fmtMoney(status.debt)} сум</b></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </Modal>
  );
}

export function RentStatusView({ status, driverId, carId, canWrite = false, onSaved }) {
  const [month, setMonth] = useState(status.today.slice(0, 7));
  const { user } = useAuth();
  const [reportDay, setReportDay] = useState(null);
  const [choiceDay, setChoiceDay] = useState(null);
  const [editDay, setEditDay] = useState(null);
  const [debtOpen, setDebtOpen] = useState(false);
  const byDay = useMemo(() => new Map(status.days.filter((d) => !d.extra).map((d) => [d.day, d])), [status]);
  const minMonth = shiftMonth(status.today.slice(0, 7), -36);
  const maxMonth = (status.ahead_until && status.ahead_until > status.today ? status.ahead_until : status.today).slice(0, 7);
  const [period, setPeriod] = useState(null);
  const shown = useMemo(() => periodStatus(status, period), [status, period]);
  const hasDebt = shown.debt > 0;
  const income = shown.days.reduce((s, d) => s + (d.paid || 0), 0);
  const [y, m] = month.split('-').map(Number);

  function changePeriod(next) {
    setPeriod(next.from <= next.to ? next : { from: next.to, to: next.from });
  }

  return (
    <div className="rs">
      <div className="rs-filter">
        <PeriodPicker value={period || { from: '', to: '' }} onChange={changePeriod} />
        {period && <button type="button" className="btn btn--quiet" onClick={() => setPeriod(null)}>За всё время</button>}
      </div>

      <div className={`rs-hero ${hasDebt ? 'rs-hero--bad' : 'rs-hero--ok'}`}>
        <div className="rs-hero__main">
          <span className="rs-hero__label">{hasDebt ? 'Аренда закрыта по' : 'Аренда закрыта'}</span>
          <b className="rs-hero__value">
            {hasDebt
              ? (shown.paid_through ? fmtDay(shown.paid_through) : 'Ещё не платил')
              : (shown.ahead_until ? `вперёд до ${fmtDay(shown.ahead_until)}` : 'Всё оплачено')}
          </b>
        </div>
        <span className="rs-hero__note">
          {hasDebt
            ? `Должен с ${fmtDay(shown.debt_from)} · осталось закрыть ${fmtMoney(shown.debt)} сум`
            : 'Долгов нет'}
        </span>
      </div>

      <div className="rs-tiles">
        <div className="rs-tile">
          <span className="rs-tile__label">Закрыто по</span>
          <b className="rs-tile__value">{shown.paid_through ? fmtDay(shown.paid_through) : '—'}</b>
          {shown.ahead_until && <span className="rs-tile__hint rs-tile__hint--ok">{`вперёд до ${fmtDay(shown.ahead_until)}`}</span>}
        </div>
        <DebtTile hasDebt={hasDebt} onOpen={() => setDebtOpen(true)}>
          <span className="rs-tile__label">Должен с</span>
          <b className="rs-tile__value">{hasDebt ? fmtDay(shown.debt_from) : 'Долгов нет'}</b>
          {hasDebt && <span className="rs-tile__hint">{`${shown.debt_days} дн. не закрыто · нажмите`}</span>}
        </DebtTile>
        <DebtTile hasDebt={hasDebt} onOpen={() => setDebtOpen(true)}>
          <span className="rs-tile__label">Осталось закрыть</span>
          <b className="rs-tile__value">{`${fmtMoney(shown.debt)} сум`}</b>
          {shown.pending > 0 && <span className="rs-tile__hint">{`ещё ждёт подтверждения ${fmtMoney(shown.pending)}`}</span>}
        </DebtTile>
        <div className="rs-tile">
          <span className="rs-tile__label">Доход за выбранный период</span>
          <b className="rs-tile__value">{`${fmtMoney(income)} сум`}</b>
          {status.car?.plate && <span className="rs-tile__hint"><Plate value={status.car.plate} /></span>}
        </div>
      </div>

      <div className="rs-cal">
        <div className="rs-cal__head">
          <button type="button" className="btn btn--quiet" onClick={() => setMonth(shiftMonth(month, -1))} disabled={month <= minMonth} aria-label="Прошлый месяц">←</button>
          <h3 className="rs-cal__title">{`${MONTHS[m - 1]} ${y}`}</h3>
          <button type="button" className="btn btn--quiet" onClick={() => setMonth(shiftMonth(month, 1))} disabled={month >= maxMonth} aria-label="Следующий месяц">→</button>
        </div>
        <div className="rs-cal__grid">
          {WEEK.map((w) => <div key={w} className="rs-cal__wd">{w}</div>)}
          {monthCells(month).map((day, i) => {
            if (!day) return <div key={`x${i}`} className="rs-cell rs-cell--blank" />;
            const info = byDay.get(day);
            const state = cellState(day, info, status);
            const blocked = Boolean(info?.report_blocked);
            const openReport = canWrite && Boolean(carId) && day <= status.today && !blocked;
            const hasMoney = (info?.paid || 0) + (info?.pending || 0) > 0;
            const blank = !info || state === 'empty' || state === 'none' || state === 'future';
            const Tag = openReport ? 'button' : 'div';
            const title = blocked
              ? (info.report_block_reason || `${fmtDay(day)}: отчёт недоступен — водитель на другой машине`)
              : (openReport ? `${fmtDay(day)}: написать отчёт` : (info ? `${fmtDay(day)}: начислено ${fmtMoney(info.accrued)}, закрыто ${fmtMoney(info.covered)}` : fmtDay(day)));
            return (
              <Tag
                key={day}
                type={openReport ? 'button' : undefined}
                className={`rs-cell rs-cell--${state} ${day === status.today ? 'rs-cell--today' : ''} ${openReport && blank ? 'rs-cell--write' : ''} ${blocked ? 'rs-cell--blocked' : ''}`}
                title={title}
                onClick={openReport ? () => (hasMoney ? setChoiceDay(day) : setReportDay(day)) : undefined}
              >
                <span className="rs-cell__num">{Number(day.slice(8))}</span>
                <CellBody state={state} info={info} />
                {openReport && blank && <span className="rs-cell__label">Отчёт</span>}
              </Tag>
            );
          })}
        </div>
        <div className="rs-legend">
          <span><i className="rs-dot rs-dot--paid" />Закрыто</span>
          <span><i className="rs-dot rs-dot--covered" />Закрыто из переплаты</span>
          <span><i className="rs-dot rs-dot--part" />Не доплатил</span>
          <span><i className="rs-dot rs-dot--unpaid" />Не оплачено</span>
          <span><i className="rs-dot rs-dot--ahead" />Оплачено вперёд</span>
          <span><i className="rs-dot rs-dot--off" />Выходной / простой</span>
          <span><i className="rs-dot rs-dot--offpaid" />Дал деньги в выходной</span>
        </div>
        <p className="muted small" style={{ margin: 0 }}>
          {canWrite && carId
            ? 'Нажмите на любой прошедший день — откроется отчёт: выберите водителя, который ездил, и впишите, сколько он отдал. Если не платил — отметьте «Не платил», аренда за день станет его долгом. Аренда начисляется только за дни с отчётом.'
            : 'День закрыт, если в этот день водитель отдал его сумму полностью. Отчёты за день вносятся на странице машины.'}
        </p>
      </div>
      {debtOpen && <DebtDaysModal status={shown} onClose={() => setDebtOpen(false)} />}
      {choiceDay && (
        <DayChoiceModal
          day={choiceDay}
          info={byDay.get(choiceDay)}
          onAdd={() => { setReportDay(choiceDay); setChoiceDay(null); }}
          onEdit={() => { setEditDay(choiceDay); setChoiceDay(null); }}
          onClose={() => setChoiceDay(null)}
        />
      )}
      {editDay && (driverId || carId) && (
        <DayTxModal
          driverId={driverId || byDay.get(editDay)?.driver_id}
          carId={carId}
          day={editDay}
          role={user?.role}
          onClose={() => setEditDay(null)}
          onChanged={onSaved}
        />
      )}
      {reportDay && carId && (
        <DayReportModal
          carId={carId}
          status={status}
          day={reportDay}
          onClose={() => setReportDay(null)}
          onDone={() => { setReportDay(null); onSaved?.(); }}
          onRefresh={onSaved}
        />
      )}
    </div>
  );
}

export default function DriverRentStatus({ driverId, version = 0, onChanged }) {
  const { user } = useAuth();
  const canWrite = user?.role === 'ADMIN' || user?.role === 'DISPATCHER';
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setError('');
    api.get(`/drivers/${driverId}/rent-status`)
      .then(setData)
      .catch((err) => setError(err.message || 'Не удалось загрузить статус аренды'));
  }, [driverId, version]);

  if (error) return <div className="notice notice--error">{error}</div>;
  if (!data) return <div className="muted">Загрузка…</div>;
  if (!data.status) return <div className="empty">Водитель ещё не брал машину</div>;
  return (
    <RentStatusView
      key={driverId}
      status={data.status}
      driverId={driverId}
      canWrite={canWrite}
      onSaved={onChanged}
    />
  );
}

export function CarRentStatus({ carId, version = 0, onChanged }) {
  const { user } = useAuth();
  const canWrite = user?.role === 'ADMIN' || user?.role === 'DISPATCHER';
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const [tick, setTick] = useState(0);

  useEffect(() => {
    setError('');
    api.get(`/cars/${carId}/rent-status`)
      .then(setData)
      .catch((err) => setError(err.message || 'Не удалось загрузить календарь'));
  }, [carId, version, tick]);

  if (error) return <div className="notice notice--error">{error}</div>;
  if (!data) return <div className="muted">Загрузка…</div>;
  if (!data.status) return <div className="empty">По этой машине ещё нет дней аренды</div>;
  return (
    <RentStatusView
      key={carId}
      status={data.status}
      carId={carId}
      canWrite={canWrite}
      onSaved={() => { setTick((n) => n + 1); onChanged?.(); }}
    />
  );
}
