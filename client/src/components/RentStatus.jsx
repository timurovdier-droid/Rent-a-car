import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import Plate from './Plate';
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
  if (state === 'off') return <span className="rs-cell__label">Выходной</span>;
  if (state === 'ahead') return <span className="rs-cell__label">Оплачено вперёд</span>;
  return null;
}

export function RentStatusView({ status }) {
  const [month, setMonth] = useState(status.today.slice(0, 7));
  const byDay = useMemo(() => new Map(status.days.map((d) => [d.day, d])), [status]);
  const minMonth = status.first_day.slice(0, 7);
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
        <div className={`rs-tile ${hasDebt ? 'rs-tile--bad' : 'rs-tile--ok'}`}>
          <span className="rs-tile__label">Должен с</span>
          <b className="rs-tile__value">{hasDebt ? fmtDay(status.debt_from) : 'Долгов нет'}</b>
          {hasDebt && <span className="rs-tile__hint">{`${status.debt_days} дн. не закрыто`}</span>}
        </div>
        <div className={`rs-tile ${hasDebt ? 'rs-tile--bad' : 'rs-tile--ok'}`}>
          <span className="rs-tile__label">Осталось закрыть</span>
          <b className="rs-tile__value">{`${fmtMoney(status.debt)} сум`}</b>
          {status.pending > 0 && <span className="rs-tile__hint">{`ещё ждёт подтверждения ${fmtMoney(status.pending)}`}</span>}
        </div>
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
            return (
              <div
                key={day}
                className={`rs-cell rs-cell--${state} ${day === status.today ? 'rs-cell--today' : ''}`}
                title={info ? `${fmtDay(day)}: начислено ${fmtMoney(info.accrued)}, закрыто ${fmtMoney(info.covered)}` : fmtDay(day)}
              >
                <span className="rs-cell__num">{Number(day.slice(8))}</span>
                <CellBody state={state} info={info} />
              </div>
            );
          })}
        </div>
        <div className="rs-legend">
          <span><i className="rs-dot rs-dot--paid" />Закрыто</span>
          <span><i className="rs-dot rs-dot--part" />Не доплатил</span>
          <span><i className="rs-dot rs-dot--unpaid" />Не оплачено</span>
          <span><i className="rs-dot rs-dot--ahead" />Оплачено вперёд</span>
          <span><i className="rs-dot rs-dot--off" />Выходной</span>
        </div>
        <p className="muted small" style={{ margin: 0 }}>
          Деньги закрывают самые старые дни первыми: если водитель заплатил сразу за несколько дней, они все станут закрытыми.
        </p>
      </div>
    </div>
  );
}

export default function DriverRentStatus({ driverId, version = 0 }) {
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
  return <RentStatusView key={driverId} status={data.status} />;
}
