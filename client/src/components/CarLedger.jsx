import { useEffect, useState } from 'react';
import { api } from '../api';
import PeriodPicker, { defaultPeriod } from './PeriodPicker';
import Plate from './Plate';
import { fmtMoney, fmtDay, downloadCsv } from '../labels';

const WEEKDAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

function weekday(day) {
  return WEEKDAYS[new Date(`${day}T00:00:00Z`).getUTCDay()];
}

function Money({ value, tone }) {
  if (!value) return <span className="muted">—</span>;
  return <span className={tone ? `ledger__${tone}` : undefined}>{fmtMoney(value)}</span>;
}

export function LedgerSummary({ totals }) {
  return (
    <div className="ledger-sum">
      <div className="ledger-sum__item">
        <span className="ledger-sum__label">Начислено</span>
        <b>{fmtMoney(totals.accrued)}</b>
      </div>
      <div className="ledger-sum__item">
        <span className="ledger-sum__label">Наличные</span>
        <b>{fmtMoney(totals.cash)}</b>
      </div>
      <div className="ledger-sum__item">
        <span className="ledger-sum__label">Карта / баланс</span>
        <b>{fmtMoney(totals.transfer)}</b>
      </div>
      {totals.overpaid > 0 ? (
        <div className="ledger-sum__item ledger-sum__item--ok">
          <span className="ledger-sum__label">Оплачено вперёд</span>
          <b>{fmtMoney(totals.overpaid)}</b>
        </div>
      ) : (
        <div className={`ledger-sum__item ${totals.debt > 0 ? 'ledger-sum__item--debt' : ''}`}>
          <span className="ledger-sum__label">Долг за период</span>
          <b>{fmtMoney(totals.debt)}</b>
          {totals.debt_days > 0 && <span className="ledger-sum__hint">{`${totals.debt_days} дн. без полной оплаты`}</span>}
        </div>
      )}
    </div>
  );
}

export function dayStatus(r) {
  if (r.day_off) return { key: 'off', label: r.idle ? 'Простой' : 'Выходной' };
  if (!r.accrued && !r.paid) return { key: 'none', label: '—' };
  if (r.paid >= r.accrued) return { key: 'paid', label: 'Оплачено' };
  if (r.pending > 0 && r.paid + r.pending >= r.accrued) return { key: 'wait', label: 'Ждёт подтверждения' };
  if (r.paid > 0) return { key: 'part', label: 'Не доплатил' };
  return { key: 'unpaid', label: 'Не дал' };
}

function StatusMark({ row }) {
  const s = dayStatus(row);
  if (s.key === 'none') return <span className="muted">—</span>;
  return <span className={`pay-status pay-status--${s.key}`}>{s.label}</span>;
}

export function LedgerTable({ ledger, showDriver = true, showCar = false, onPay }) {
  const rows = [...ledger.rows].reverse();
  if (rows.length === 0) return <div className="empty">За этот период дней нет</div>;
  const t = ledger.totals;
  const labelCols = 1 + (showDriver ? 1 : 0) + (showCar ? 1 : 0);
  return (
    <div className="table-wrap">
      <table className="table ledger">
        <thead>
          <tr>
            <th className="table__th">Дата</th>
            {showDriver && <th className="table__th">Водитель</th>}
            {showCar && <th className="table__th">Машина</th>}
            <th className="table__th table__num">Начислено</th>
            <th className="table__th table__num">Наличные</th>
            <th className="table__th table__num">Карта / баланс</th>
            <th className="table__th table__num">Долг за день</th>
            <th className="table__th">Статус</th>
            {onPay && <th className="table__th" aria-label="Действие" />}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.day}-${r.car_id || ''}`} className={`table__row ${r.debt > 0 ? 'ledger__row--debt' : ''}`}>
              <td className="table__td">
                {fmtDay(r.day)} <span className="muted small">{weekday(r.day)}</span>
              </td>
              {showDriver && (
                <td className="table__td">{r.driver_name || <span className="muted">без водителя</span>}</td>
              )}
              {showCar && (
                <td className="table__td">
                  <Plate value={r.plate} /> <span className="muted small">{r.brand} {r.model}</span>
                </td>
              )}
              <td className="table__td table__num">
                {r.day_off ? <span className="ledger__tag">{r.idle ? 'простой' : 'выходной'}</span> : <Money value={r.accrued} />}
              </td>
              <td className="table__td table__num"><Money value={r.cash} /></td>
              <td className="table__td table__num">
                <Money value={r.transfer} />
                {r.pending > 0 && <div className="ledger__pending">{`ждёт ${fmtMoney(r.pending)}`}</div>}
              </td>
              <td className="table__td table__num"><Money value={r.debt} tone="debt" /></td>
              <td className="table__td"><StatusMark row={r} /></td>
              {onPay && (
                <td className="table__td ledger__act">
                  {!r.day_off && (
                    <button
                      type="button"
                      className={`btn btn--sm ${r.debt > 0 ? '' : 'btn--quiet'}`}
                      onClick={() => onPay(r)}
                    >
                      {r.debt > 0 ? 'Дал' : 'Ещё'}
                    </button>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td className="table__td" colSpan={labelCols}><b>Итого</b></td>
            <td className="table__td table__num"><b>{fmtMoney(t.accrued)}</b></td>
            <td className="table__td table__num"><b>{fmtMoney(t.cash)}</b></td>
            <td className="table__td table__num"><b>{fmtMoney(t.transfer)}</b></td>
            <td className="table__td table__num"><b className={t.debt > 0 ? 'ledger__debt' : undefined}>{fmtMoney(t.debt)}</b></td>
            <td className="table__td" colSpan={onPay ? 2 : 1} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export function exportLedger(ledger, name) {
  downloadCsv(`${name}_${ledger.from}_${ledger.to}.csv`,
    ['Дата', 'Водитель', 'Машина', 'Выходной / простой', 'Начислено', 'Наличные', 'Карта / баланс', 'Ждёт подтверждения', 'Долг за день', 'Статус'],
    ledger.rows.map((r) => [
      fmtDay(r.day), r.driver_name || '', r.plate || ledger.car?.plate || '', r.day_off ? (r.idle ? 'простой' : 'выходной') : '',
      r.accrued, r.cash, r.transfer, r.pending, r.debt, dayStatus(r).label,
    ]));
}

export default function CarLedger({ carId, period: outerPeriod }) {
  const [ownPeriod, setOwnPeriod] = useState(defaultPeriod);
  const period = outerPeriod || ownPeriod;
  const [ledger, setLedger] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!carId) return;
    setLedger(null);
    setError('');
    api.get(`/cars/${carId}/ledger?from=${period.from}&to=${period.to}`)
      .then(setLedger)
      .catch((err) => setError(err.message || 'Не удалось загрузить таблицу'));
  }, [carId, period.from, period.to]);

  return (
    <div className="ledger-box">
      {!outerPeriod && <PeriodPicker value={ownPeriod} onChange={setOwnPeriod} />}
      {error && <div className="notice notice--error">{error}</div>}
      {!ledger && !error && <div className="muted">Загрузка…</div>}
      {ledger && (
        <>
          <div className="ledger-box__head">
            <LedgerSummary totals={ledger.totals} />
            <button
              type="button"
              className="btn btn--quiet"
              onClick={() => exportLedger(ledger, `машина_${ledger.car?.plate || carId}`)}
            >
              Скачать в Excel
            </button>
          </div>
          <p className="muted small ledger-box__note">
            Деньги считаются по дате платежа. Залог не входит. «Ждёт» — запись диспетчера, которую ещё не подтвердил админ.
          </p>
          <LedgerTable ledger={ledger} />
        </>
      )}
    </div>
  );
}
