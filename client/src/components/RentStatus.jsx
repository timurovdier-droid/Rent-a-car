import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import Plate from './Plate';
import Modal from './Modal';
import MoneyInput from './MoneyInput';
import { fmtMoney, fmtDay } from '../labels';
import DateInput from './DateInput';
import TxList from './TxList';

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

function cellState(day, info, status) {
  if (info?.status === 'off' && info.paid > 0) return 'offpaid';
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
    return (
      <>
        <span className="rs-cell__label">{`${info.idle ? 'Простой' : 'Выходной'} · дал`}</span>
        <PaidSum value={info?.paid} />
        <DriverMark info={info} />
      </>
    );
  }
  if (state === 'ahead') return <span className="rs-cell__label">Оплачено вперёд</span>;
  return null;
}

function DayReportModal({ driverId, carId, status, day, onClose, onDone, onRefresh }) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [date, setDate] = useState(day);
  const info = status.days.find((item) => item.day === date);
  const dayRate = info?.accrued > 0 ? info.accrued : (status.rate || 0);
  const covered = info ? Number(info.covered || 0) : 0;
  const [cash, setCash] = useState('');
  const [card, setCard] = useState('');
  const [balance, setBalance] = useState('');
  const [deposit, setDeposit] = useState('');
  const [dayRateEdit, setDayRateEdit] = useState('');
  const [hubDriver, setHubDriver] = useState(null);
  const [depositLeft, setDepositLeft] = useState(Number(status.deposit || 0));
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [rateSaved, setRateSaved] = useState(false);
  const [error, setError] = useState('');
  const editRate = Number(String(dayRateEdit || '').replace(/\D/g, '')) || 0;
  const left = Math.max(editRate - covered, 0);
  const total = (Number(cash) || 0) + (Number(card) || 0) + (Number(balance) || 0) + (Number(deposit) || 0);
  const early = date < status.first_day;
  const who = info?.driver_id || driverId || status.driver?.id || hubDriver?.id || null;
  const whoName = info?.driver_name || status.driver?.name || hubDriver?.name || null;
  const targetCarId = carId || status.car?.id || null;

  useEffect(() => {
    setDayRateEdit(dayRate ? String(dayRate) : '');
    setRateSaved(false);
  }, [date, dayRate]);

  useEffect(() => {
    let alive = true;
    if (!targetCarId) return undefined;
    api.get(`/cars/${targetCarId}/hub`)
      .then((hub) => {
        if (!alive) return;
        const cur = hub.current;
        if (cur?.driver_id) {
          setHubDriver({
            id: Number(cur.driver_id),
            name: cur.driver_name || null,
            deposit: null,
          });
        }
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [targetCarId]);

  useEffect(() => {
    let alive = true;
    const fallback = Number(status.deposit || status.driver?.deposit || 0);
    if (!who) {
      setDepositLeft(fallback);
      return undefined;
    }
    api.get(`/drivers/${who}`)
      .then((d) => { if (alive) setDepositLeft(Number(d.deposit || 0)); })
      .catch(() => { if (alive) setDepositLeft(fallback); });
    return () => { alive = false; };
  }, [who, status.deposit, status.driver?.deposit]);

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
    if (!targetCarId) {
      setError('Нет машины, чтобы изменить ставку');
      return;
    }
    if (!Number.isFinite(editRate) || editRate < 0) {
      setError('Укажите ставку на этот день');
      return;
    }
    setSaving(true);
    setError('');
    setRateSaved(false);
    try {
      await api.post(`/cars/${targetCarId}/rate`, {
        rate: editRate,
        valid_from: date,
        only_day: true,
      });
      setRateSaved(true);
      setSaving(false);
      onRefresh?.();
    } catch (err) {
      setError(err.message || 'Не удалось изменить ставку');
      setSaving(false);
    }
  }

  async function submit(e) {
    e.preventDefault();
    if (!total) {
      setError('Впишите сумму: наличными, картой, с баланса или из депозита');
      return;
    }
    setSaving(true);
    setError('');
    try {
      // Если ставку на день поменяли — сохраняем её вместе с отчётом.
      if (isAdmin && targetCarId && editRate !== dayRate) {
        await api.post(`/cars/${targetCarId}/rate`, {
          rate: editRate,
          valid_from: date,
          only_day: true,
        });
      }
      if (Number(deposit) > 0 && !who) {
        setError('Чтобы списать с депозита, нужен водитель на этот день');
        setSaving(false);
        return;
      }
      if (who) {
        await api.post(`/drivers/${who}/day-report`, { date, cash, card, balance, deposit, comment });
      } else if (targetCarId) {
        const note = comment.trim() || `Отчёт за ${date}`;
        for (const [method, amount] of [['CASH', cash], ['CARD', card], ['BALANCE', balance]]) {
          if (Number(amount) > 0) {
            await api.post(`/cars/${targetCarId}/transactions`, {
              kind: 'INCOME', category: 'RENT', method, amount: Number(amount), tx_date: date, comment: note,
            });
          }
        }
      } else {
        setError('В этот день на машине не было водителя');
        setSaving(false);
        return;
      }
      onDone();
    } catch (err) {
      setError(err.message || 'Не удалось записать отчёт');
      setSaving(false);
    }
  }

  return (
    <Modal title={`Отчёт за ${fmtDay(date)}`} onClose={onClose}>
      <form onSubmit={submit} className="pay-day">
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
          <span className="muted small">Любой прошедший день, в том числе до того, как водителя добавили в систему.</span>
        </div>
        {early && (
          <div className="notice">
            Водителя учли в системе позже. Отчёт запишется задним числом, а аренда будет считаться с этой даты.
          </div>
        )}
        <div className="pay-day__info">
          <dl className="kv pay-day__kv">
            <div>
              <dt>Аренда в день</dt>
              <dd>
                {isAdmin && targetCarId ? (
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
            {whoName && <div><dt>Водитель</dt><dd>{whoName}</dd></div>}
            <div><dt>Уже закрыто</dt><dd>{fmtMoney(covered)} сум</dd></div>
            <div><dt>Не хватает</dt><dd className={left > 0 ? 'ledger__debt' : ''}>{fmtMoney(left)} сум</dd></div>
            <div><dt>Депозит</dt><dd>{fmtMoney(depositLeft)} сум</dd></div>
          </dl>
          {isAdmin && targetCarId && (
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
            <MoneyInput id="drp-deposit" value={deposit} onChange={setDeposit} disabled={!who} />
          </div>
        </div>
        <p className="muted small pay-day__hint">
          {who
            ? '«Из депозита» списывается с депозита водителя и пишется в историю депозита.'
            : 'Чтобы списать с депозита, на этот день должен быть водитель.'}
        </p>
        {(left > 0 || dayRate > 0) && (
          <div className="pay-day__chips">
            <button type="button" className="chip" onClick={() => payAll(setCash)}>Всё наличными</button>
            <button type="button" className="chip" onClick={() => payAll(setCard)}>Всё картой</button>
            <button type="button" className="chip" onClick={() => payAll(setBalance)}>Всё с баланса</button>
            <button
              type="button"
              className="chip"
              disabled={!who || depositLeft <= 0}
              onClick={() => payAll(setDeposit, depositLeft)}
            >
              {who && depositLeft > 0
                ? `Всё из депозита · ${fmtMoney(Math.min(left || dayRate, depositLeft))}`
                : 'Всё из депозита'}
            </button>
          </div>
        )}
        <div className="field">
          <label className="field__label" htmlFor="drp-note">Комментарий</label>
          <input id="drp-note" className="field__input" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="необязательно" maxLength={200} />
        </div>
        {error && <div className="notice notice--error">{error}</div>}
        <div className="form-actions">
          <button className="btn" type="submit" disabled={saving || !date}>{saving ? 'Записываю…' : 'Записать отчёт'}</button>
          <button className="btn btn--quiet" type="button" onClick={onClose}>Отмена</button>
        </div>
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
  const byDay = useMemo(() => new Map(status.days.map((d) => [d.day, d])), [status]);
  const minMonth = shiftMonth(status.today.slice(0, 7), -36);
  const maxMonth = (status.ahead_until && status.ahead_until > status.today ? status.ahead_until : status.today).slice(0, 7);
  const hasDebt = status.debt > 0;
  const [y, m] = month.split('-').map(Number);

  return (
    <div className="rs">
      <div className={`rs-hero ${hasDebt ? 'rs-hero--bad' : 'rs-hero--ok'}`}>
        <div className="rs-hero__main">
          <span className="rs-hero__label">{hasDebt ? 'Аренда закрыта по' : 'Аренда закрыта'}</span>
          <b className="rs-hero__value">
            {hasDebt
              ? (status.paid_through ? fmtDay(status.paid_through) : 'Ещё не платил')
              : (status.ahead_until ? `вперёд до ${fmtDay(status.ahead_until)}` : 'Всё оплачено')}
          </b>
        </div>
        <span className="rs-hero__note">
          {hasDebt
            ? `Должен с ${fmtDay(status.debt_from)} · осталось закрыть ${fmtMoney(status.debt)} сум`
            : 'Долгов нет'}
        </span>
      </div>

      <div className="rs-tiles">
        <div className="rs-tile">
          <span className="rs-tile__label">Закрыто по</span>
          <b className="rs-tile__value">{status.paid_through ? fmtDay(status.paid_through) : '—'}</b>
          {status.ahead_until && <span className="rs-tile__hint rs-tile__hint--ok">{`вперёд до ${fmtDay(status.ahead_until)}`}</span>}
        </div>
        <DebtTile hasDebt={hasDebt} onOpen={() => setDebtOpen(true)}>
          <span className="rs-tile__label">Должен с</span>
          <b className="rs-tile__value">{hasDebt ? fmtDay(status.debt_from) : 'Долгов нет'}</b>
          {hasDebt && <span className="rs-tile__hint">{`${status.debt_days} дн. не закрыто · нажмите`}</span>}
        </DebtTile>
        <DebtTile hasDebt={hasDebt} onOpen={() => setDebtOpen(true)}>
          <span className="rs-tile__label">Осталось закрыть</span>
          <b className="rs-tile__value">{`${fmtMoney(status.debt)} сум`}</b>
          {status.pending > 0 && <span className="rs-tile__hint">{`ещё ждёт подтверждения ${fmtMoney(status.pending)}`}</span>}
        </DebtTile>
        <div className="rs-tile">
          <span className="rs-tile__label">Аренда в день</span>
          <b className="rs-tile__value">{`${fmtMoney(status.rate)} сум`}</b>
          {status.driver?.name
            ? <span className="rs-tile__hint">{status.driver.name}</span>
            : status.car && <span className="rs-tile__hint"><Plate value={status.car.plate} /></span>}
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
            const openReport = canWrite && day <= status.today;
            const hasMoney = (info?.paid || 0) + (info?.pending || 0) > 0;
            const blank = !info || state === 'empty' || state === 'none' || state === 'future';
            const Tag = openReport ? 'button' : 'div';
            return (
              <Tag
                key={day}
                type={openReport ? 'button' : undefined}
                className={`rs-cell rs-cell--${state} ${day === status.today ? 'rs-cell--today' : ''} ${openReport && blank ? 'rs-cell--write' : ''}`}
                title={openReport ? `${fmtDay(day)}: написать отчёт` : (info ? `${fmtDay(day)}: начислено ${fmtMoney(info.accrued)}, закрыто ${fmtMoney(info.covered)}` : fmtDay(day))}
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
          {canWrite
            ? 'Нажмите на любой прошедший день — откроется отчёт. Можно записать и задним числом: если водителя добавили сегодня, а он работал раньше, выберите тот день и впишите сумму. Аренда начнёт считаться с этой даты.'
            : 'День закрыт, если в этот день водитель отдал его сумму полностью. Деньги в выходной уменьшают общий долг.'}
        </p>
      </div>
      {debtOpen && <DebtDaysModal status={status} onClose={() => setDebtOpen(false)} />}
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
      {reportDay && (driverId || carId) && (
        <DayReportModal
          driverId={driverId || byDay.get(reportDay)?.driver_id || status.driver?.id}
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
