import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import Plate from './Plate';
import Modal from './Modal';
import MoneyInput from './MoneyInput';
import PeriodPicker, { defaultPeriod } from './PeriodPicker';
import { LedgerSummary, LedgerTable, exportLedger } from './CarLedger';
import { fmtMoney, fmtDay, downloadCsv } from '../labels';

function PayDayModal({ row, driverName, isAdmin, onClose, onDone }) {
  const left = Math.max(row.accrued - row.paid - row.pending, 0);
  const [cash, setCash] = useState('');
  const [card, setCard] = useState('');
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const total = (Number(cash) || 0) + (Number(card) || 0);

  async function submit(e) {
    e.preventDefault();
    if (!total) {
      setError('Впишите сумму: наличными, картой или обе');
      return;
    }
    setSaving(true);
    setError('');
    const note = [`Оплата за ${fmtDay(row.day)}`, driverName, comment.trim()].filter(Boolean).join(' · ');
    try {
      for (const [method, amount] of [['CASH', cash], ['CARD', card]]) {
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
          <span><Plate value={row.plate} /> <span className="muted small">{row.brand} {row.model}</span></span>
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
        </div>
        {left > 0 && (
          <div className="chips">
            <button type="button" className="chip" onClick={() => { setCash(String(left)); setCard(''); }}>
              {`Всё наличными: ${fmtMoney(left)}`}
            </button>
            <button type="button" className="chip" onClick={() => { setCard(String(left)); setCash(''); }}>
              {`Всё картой: ${fmtMoney(left)}`}
            </button>
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

// Таблица по дням для одного водителя: в какой день, на какой машине, сколько начислено, оплачено и долг.
export default function DriverLedger({ driverId, period: outerPeriod, showName = false, canPay = false, onChanged }) {
  const { user } = useAuth();
  const [ownPeriod, setOwnPeriod] = useState(defaultPeriod);
  const period = outerPeriod || ownPeriod;
  const [ledger, setLedger] = useState(null);
  const [error, setError] = useState('');
  const [paying, setPaying] = useState(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!driverId) return;
    setError('');
    api.get(`/drivers/${driverId}/ledger?from=${period.from}&to=${period.to}`)
      .then(setLedger)
      .catch((err) => setError(err.message || 'Не удалось загрузить таблицу'));
  }, [driverId, period.from, period.to, version]);

  useEffect(() => { setLedger(null); }, [driverId, period.from, period.to]);

  return (
    <div className="ledger-box">
      {!outerPeriod && <PeriodPicker value={ownPeriod} onChange={setOwnPeriod} />}
      {error && <div className="notice notice--error">{error}</div>}
      {!ledger && !error && <div className="muted">Загрузка…</div>}
      {ledger && (
        <>
          {showName && <h2 className="drv__title" style={{ margin: 0 }}>{ledger.driver?.full_name}</h2>}
          <div className="ledger-box__head">
            <LedgerSummary totals={ledger.totals} />
            <button
              type="button"
              className="btn btn--quiet"
              onClick={() => exportLedger(ledger, `водитель_${ledger.driver?.full_name || driverId}`)}
            >
              Скачать в Excel
            </button>
          </div>
          <p className="muted small ledger-box__note">
            {canPay
              ? 'Если водитель принёс деньги за день — нажмите «Дал» и впишите, сколько наличными и сколько картой.'
              : 'Красным — дни, за которые водитель не заплатил полностью. В колонке «Долг за день» — сколько не хватило.'}
          </p>
          {ledger.rows.length === 0
            ? <div className="empty">В этот период водитель не ездил</div>
            : <LedgerTable ledger={ledger} showDriver={false} showCar onPay={canPay ? setPaying : undefined} />}
        </>
      )}
      {paying && (
        <PayDayModal
          row={paying}
          driverName={ledger?.driver?.full_name}
          isAdmin={user?.role === 'ADMIN'}
          onClose={() => setPaying(null)}
          onDone={() => { setPaying(null); setVersion((v) => v + 1); onChanged?.(); }}
        />
      )}
    </div>
  );
}

// Сводка: все водители за период, у кого сколько долга.
export function DriverDebtList({ period, onPick }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setData(null);
    setError('');
    api.get(`/drivers/debts?from=${period.from}&to=${period.to}`)
      .then(setData)
      .catch((err) => setError(err.message || 'Не удалось загрузить отчёт'));
  }, [period.from, period.to]);

  if (error) return <div className="notice notice--error">{error}</div>;
  if (!data) return <div className="muted">Загрузка…</div>;
  if (data.drivers.length === 0) return <div className="empty">В этот период никто не ездил</div>;

  const sum = (key) => data.drivers.reduce((s, d) => s + d[key], 0);

  function exportAll() {
    downloadCsv(`водители_${data.from}_${data.to}.csv`,
      ['Водитель', 'Телефон', 'Машины', 'Начислено', 'Наличные', 'Перевод', 'Долг за период', 'Дней с долгом'],
      data.drivers.map((d) => [d.full_name, d.phone || '', d.cars.join(', '), d.accrued, d.cash, d.transfer, d.debt, d.debt_days]));
  }

  return (
    <div className="ledger-box">
      <div className="ledger-box__head">
        <p className="muted small ledger-box__note">Нажмите на водителя — откроются дни: когда и сколько он не доплатил.</p>
        <button type="button" className="btn btn--quiet" onClick={exportAll}>Скачать в Excel</button>
      </div>
      <div className="table-wrap">
        <table className="table ledger">
          <thead>
            <tr>
              <th className="table__th">Водитель</th>
              <th className="table__th">Машина</th>
              <th className="table__th table__num">Начислено</th>
              <th className="table__th table__num">Наличные</th>
              <th className="table__th table__num">Карта / перевод</th>
              <th className="table__th table__num">Долг за период</th>
              <th className="table__th table__num">Дней с долгом</th>
            </tr>
          </thead>
          <tbody>
            {data.drivers.map((d) => (
              <tr
                key={d.driver_id}
                className={`table__row ${d.debt > 0 ? 'ledger__row--debt' : ''}`}
                style={{ cursor: 'pointer' }}
                onClick={() => onPick(d.driver_id)}
              >
                <td className="table__td">
                  <b>{d.full_name}</b>
                  {d.phone && <div className="muted small">{d.phone}</div>}
                </td>
                <td className="table__td">
                  {d.cars.map((plate) => <span key={plate} className="ledger__plate"><Plate value={plate} /></span>)}
                </td>
                <td className="table__td table__num">{fmtMoney(d.accrued)}</td>
                <td className="table__td table__num">{fmtMoney(d.cash)}</td>
                <td className="table__td table__num">{fmtMoney(d.transfer)}</td>
                <td className="table__td table__num">
                  {d.debt > 0 ? <span className="ledger__debt">{fmtMoney(d.debt)}</span> : <span className="muted">—</span>}
                </td>
                <td className="table__td table__num">{d.debt_days || <span className="muted">—</span>}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="table__td" colSpan={2}><b>Итого</b></td>
              <td className="table__td table__num"><b>{fmtMoney(sum('accrued'))}</b></td>
              <td className="table__td table__num"><b>{fmtMoney(sum('cash'))}</b></td>
              <td className="table__td table__num"><b>{fmtMoney(sum('transfer'))}</b></td>
              <td className="table__td table__num"><b className="ledger__debt">{fmtMoney(sum('debt'))}</b></td>
              <td className="table__td" />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
