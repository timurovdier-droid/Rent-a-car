import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import PeriodPicker, { defaultPeriod } from './PeriodPicker';
import Plate from './Plate';
import Modal from './Modal';
import MoneyInput from './MoneyInput';
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
  if (r.from_overpay) return { key: 'covered', label: 'Из переплаты' };
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
            {showDriver && <th className="table__th">Кто платил</th>}
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
                <td className="table__td">
                  {r.driver_name
                    ? (r.driver_id
                      ? <Link to={`/drivers/${r.driver_id}`}>{r.driver_name}</Link>
                      : r.driver_name)
                    : <span className="muted">без водителя</span>}
                </td>
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

export function PayDayModal({ row, driverName, isAdmin, onClose, onDone }) {
  const left = Math.max(row.accrued - row.paid - row.pending, 0);
  const [cash, setCash] = useState('');
  const [card, setCard] = useState('');
  const [balance, setBalance] = useState('');
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const total = (Number(cash) || 0) + (Number(card) || 0) + (Number(balance) || 0);

  function payAll(setter) {
    setCash('');
    setCard('');
    setBalance('');
    setter(String(left));
  }

  async function submit(e) {
    e.preventDefault();
    if (!total) {
      setError('Впишите сумму: наличными, картой или с баланса');
      return;
    }
    setSaving(true);
    setError('');
    const note = [`Оплата за ${fmtDay(row.day)}`, driverName, comment.trim()].filter(Boolean).join(' · ');
    try {
      for (const [method, amount] of [['CASH', cash], ['CARD', card], ['BALANCE', balance]]) {
        if (Number(amount) > 0) {
          await api.post(`/cars/${row.car_id}/transactions`, {
            kind: 'INCOME', category: 'RENT', method, amount: Number(amount), tx_date: row.day, comment: note,
          });
        }
      }
      onDone();
    } catch (err) {
      setError(err.message || 'Не удалось записать оплату');
      setSaving(false);
    }
  }

  return (
    <Modal title={`Дал деньги · ${fmtDay(row.day)}`} onClose={onClose}>
      <form onSubmit={submit} className="pay-day">
        <div className="pay-day__info">
          {row.plate && <span><Plate value={row.plate} /> <span className="muted small">{row.brand} {row.model}</span></span>}
          {driverName && <p className="muted small" style={{ margin: '6px 0 0' }}>{`Водитель: ${driverName}`}</p>}
          <dl className="kv">
            <div><dt>За день</dt><dd>{fmtMoney(row.accrued)} сум</dd></div>
            <div><dt>Уже получено</dt><dd>{fmtMoney(row.paid + row.pending)} сум</dd></div>
            <div><dt>Не хватает</dt><dd className={left ? 'ledger__debt' : undefined}>{fmtMoney(left)} сум</dd></div>
          </dl>
        </div>
        <div className="pay-day__grid">
          <div className="field">
            <label className="field__label" htmlFor="pd-cash">Наличными</label>
            <MoneyInput id="pd-cash" value={cash} onChange={setCash} autoFocus />
          </div>
          <div className="field">
            <label className="field__label" htmlFor="pd-card">Картой</label>
            <MoneyInput id="pd-card" value={card} onChange={setCard} />
          </div>
          <div className="field">
            <label className="field__label" htmlFor="pd-balance">С баланса</label>
            <MoneyInput id="pd-balance" value={balance} onChange={setBalance} />
          </div>
        </div>
        {left > 0 && (
          <div className="chips">
            <button type="button" className="chip" onClick={() => payAll(setCash)}>{`Всё наличными: ${fmtMoney(left)}`}</button>
            <button type="button" className="chip" onClick={() => payAll(setCard)}>{`Всё картой: ${fmtMoney(left)}`}</button>
            <button type="button" className="chip" onClick={() => payAll(setBalance)}>{`Всё с баланса: ${fmtMoney(left)}`}</button>
          </div>
        )}
        <div className="field">
          <label className="field__label" htmlFor="pd-note">Комментарий</label>
          <input id="pd-note" className="field__input" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="необязательно" maxLength={200} />
        </div>
        {total > 0 && left > 0 && total < left && (
          <div className="notice">{`Будет статус «Не доплатил»: не хватит ${fmtMoney(left - total)} сум`}</div>
        )}
        {!isAdmin && <p className="muted small" style={{ margin: 0 }}>Запись уйдёт администратору на подтверждение.</p>}
        {error && <div className="notice notice--error">{error}</div>}
        <div className="form-actions">
          <button className="btn" type="submit" disabled={saving}>{saving ? 'Записываю…' : `Записать ${total ? fmtMoney(total) : ''}`}</button>
          <button className="btn btn--quiet" type="button" onClick={onClose}>Отмена</button>
        </div>
      </form>
    </Modal>
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

export default function CarLedger({ carId, period: outerPeriod, canPay = false, onChanged }) {
  const { user } = useAuth();
  const [ownPeriod, setOwnPeriod] = useState(defaultPeriod);
  const period = outerPeriod || ownPeriod;
  const [ledger, setLedger] = useState(null);
  const [error, setError] = useState('');
  const [paying, setPaying] = useState(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!carId) return;
    setLedger(null);
    setError('');
    api.get(`/cars/${carId}/ledger?from=${period.from}&to=${period.to}`)
      .then((data) => {
        const car = data.car || {};
        setLedger({
          ...data,
          rows: (data.rows || []).map((r) => ({
            ...r,
            car_id: r.car_id || car.id || carId,
            plate: r.plate || car.plate,
            brand: r.brand || car.brand,
            model: r.model || car.model,
          })),
        });
      })
      .catch((err) => setError(err.message || 'Не удалось загрузить таблицу'));
  }, [carId, period.from, period.to, version]);

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
            {canPay
              ? 'Цвет — статус дня. «Кто платил» — водитель, который был на машине в этот день. Если принёс деньги — нажмите «Дал».'
              : 'Цвет — статус дня. «Кто платил» — водитель, который был на машине в этот день. Залог не входит.'}
          </p>
          <LedgerTable ledger={ledger} showDriver onPay={canPay ? setPaying : undefined} />
        </>
      )}
      {paying && (
        <PayDayModal
          row={paying}
          driverName={paying.driver_name}
          isAdmin={user?.role === 'ADMIN'}
          onClose={() => setPaying(null)}
          onDone={() => { setPaying(null); setVersion((v) => v + 1); onChanged?.(); }}
        />
      )}
    </div>
  );
}
