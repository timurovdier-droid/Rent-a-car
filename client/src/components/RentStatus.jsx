import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import Plate from './Plate';
import Modal from './Modal';
import MoneyInput from './MoneyInput';
import { fmtMoney, fmtDay } from '../labels';

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

function CellBody({ state, info }) {
  if (state === 'paid') return <span className="rs-cell__label">Закрыто</span>;
  if (state === 'part') {
    return (
      <>
        <span className="rs-cell__label">Не доплатил</span>
        <Shortfall value={info.left} />
      </>
    );
  }
  if (state === 'unpaid') {
    return (
      <>
        <span className="rs-cell__label">Не оплачено</span>
        <Shortfall value={info.left} />
      </>
    );
  }
  if (state === 'off') return <span className="rs-cell__label">{info?.idle ? 'Простой' : 'Выходной'}</span>;
  if (state === 'ahead') return <span className="rs-cell__label">Оплачено вперёд</span>;
  return null;
}

function DayReportModal({ driverId, status, day, onClose, onDone }) {
  const [date, setDate] = useState(day);
  const info = status.days.find((item) => item.day === date);
  const left = info ? Math.max(info.left || 0, 0) : 0;
  const [cash, setCash] = useState('');
  const [card, setCard] = useState('');
  const [balance, setBalance] = useState('');
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const total = (Number(cash) || 0) + (Number(card) || 0) + (Number(balance) || 0);
  const early = date < status.first_day;

  function payAll(setter) {
    setCash('');
    setCard('');
    setBalance('');
    setter(String(left || status.rate || ''));
  }

  async function submit(e) {
    e.preventDefault();
    if (!total) {
      setError('Впишите сумму: наличными, картой или с баланса');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.post(`/drivers/${driverId}/day-report`, {
        date, cash, card, balance, comment,
      });
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
          <input
            id="drp-date"
            className="field__input"
            type="date"
            value={date}
            max={status.today}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </div>
        {early && (
          <div className="notice">
            Водителя учли в системе позже. Отчёт запишется задним числом, а аренда будет считаться с этой даты.
          </div>
        )}
        <div className="pay-day__info">
          <dl className="kv">
            <div><dt>Аренда в день</dt><dd>{fmtMoney(status.rate)} сум</dd></div>
            {info && <div><dt>Уже закрыто</dt><dd>{fmtMoney(info.covered)} сум</dd></div>}
            {left > 0 && <div><dt>Не хватает</dt><dd className="ledger__debt">{fmtMoney(left)} сум</dd></div>}
          </dl>
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
        </div>
        {(left > 0 || status.rate > 0) && (
          <div className="chips">
            <button type="button" className="chip" onClick={() => payAll(setCash)}>Всё наличными</button>
            <button type="button" className="chip" onClick={() => payAll(setCard)}>Всё картой</button>
            <button type="button" className="chip" onClick={() => payAll(setBalance)}>Всё с баланса</button>
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

function DebtTile({ hasDebt, onOpen, children }) {
  if (!hasDebt) return <div className="rs-tile rs-tile--ok">{children}</div>;
  return <button type="button" className="rs-tile rs-tile--bad rs-tile--link" onClick={onOpen}>{children}</button>;
}

function DebtDaysModal({ status, onClose }) {
  const days = status.days.filter((d) => d.left > 0).reverse();
  return (
    <Modal title="За какие дни долг" onClose={onClose}>
      <p className="muted small" style={{ marginTop: 0 }}>
        Деньги закрывают самые старые дни первыми. Ниже — дни, которые ещё не закрыты.
      </p>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th className="table__th">Дата</th>
              <th className="table__th">Машина</th>
              <th className="table__th table__num">За день</th>
              <th className="table__th table__num">Должен</th>
            </tr>
          </thead>
          <tbody>
            {days.map((d) => (
              <tr key={d.day} className="table__row">
                <td className="table__td">{fmtDay(d.day)}</td>
                <td className="table__td">{d.plates.map((p) => <Plate key={p} value={p} />)}</td>
                <td className="table__td table__num">{fmtMoney(d.accrued)}</td>
                <td className="table__td table__num ledger__debt">{fmtMoney(d.left)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
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

export function RentStatusView({ status, driverId, canWrite = false, onSaved }) {
  const [month, setMonth] = useState(status.today.slice(0, 7));
  const [reportDay, setReportDay] = useState(null);
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
          {status.car && <span className="rs-tile__hint"><Plate value={status.car.plate} /></span>}
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
            const Tag = openReport ? 'button' : 'div';
            return (
              <Tag
                key={day}
                type={openReport ? 'button' : undefined}
                className={`rs-cell rs-cell--${state} ${day === status.today ? 'rs-cell--today' : ''}`}
                title={openReport ? `${fmtDay(day)}: записать отчёт` : (info ? `${fmtDay(day)}: начислено ${fmtMoney(info.accrued)}, закрыто ${fmtMoney(info.covered)}` : fmtDay(day))}
                onClick={openReport ? () => setReportDay(day) : undefined}
              >
                <span className="rs-cell__num">{Number(day.slice(8))}</span>
                <CellBody state={state} info={info} />
              </Tag>
            );
          })}
        </div>
        <div className="rs-legend">
          <span><i className="rs-dot rs-dot--paid" />Закрыто</span>
          <span><i className="rs-dot rs-dot--part" />Не доплатил</span>
          <span><i className="rs-dot rs-dot--unpaid" />Не оплачено</span>
          <span><i className="rs-dot rs-dot--ahead" />Оплачено вперёд</span>
          <span><i className="rs-dot rs-dot--off" />Выходной / простой</span>
        </div>
        <p className="muted small" style={{ margin: 0 }}>
          {canWrite
            ? 'Нажмите на любой прошедший день и запишите отчёт. Если водитель работал до того, как его добавили, дату можно поставить задним числом.'
            : 'Деньги закрывают самые старые дни первыми: если водитель заплатил сразу за несколько дней, они все станут закрытыми.'}
        </p>
      </div>
      {debtOpen && <DebtDaysModal status={status} onClose={() => setDebtOpen(false)} />}
      {reportDay && driverId && (
        <DayReportModal
          driverId={driverId}
          status={status}
          day={reportDay}
          onClose={() => setReportDay(null)}
          onDone={() => { setReportDay(null); onSaved?.(); }}
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
