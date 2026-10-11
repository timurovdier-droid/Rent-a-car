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
          <div className="field">
            <label className="field__label" htmlFor="pd-balance">С баланса</label>
            <MoneyInput id="pd-balance" value={balance} onChange={setBalance} />
          </div>
        </div>
        {left > 0 && (
          <div className="chips">
            <button type="button" className="chip" onClick={() => payAll(setCash)}>
              {`Всё наличными: ${fmtMoney(left)}`}
            </button>
            <button type="button" className="chip" onClick={() => payAll(setCard)}>
              {`Всё картой: ${fmtMoney(left)}`}
            </button>
            <button type="button" className="chip" onClick={() => payAll(setBalance)}>
              {`Всё с баланса: ${fmtMoney(left)}`}
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
              ? 'Если водитель принёс деньги за день — нажмите «Дал» и впишите, сколько наличными, картой или с баланса.'
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

  const drivers = [...data.drivers].sort((a, b) => b.debt - a.debt);
  const debtors = drivers.filter((d) => d.debt > 0).length;

  return (
    <div className="ledger-box">
      <div className="dcard-sum">
        <div className="dcard-sum__item">
          <span className="dcard-sum__label">Начислено</span>
          <b>{fmtMoney(sum('accrued'))} <small>сум</small></b>
        </div>
        <div className="dcard-sum__item">
          <span className="dcard-sum__label">Получено</span>
          <b>{fmtMoney(sum('cash') + sum('transfer'))} <small>сум</small></b>
        </div>
        <div className={`dcard-sum__item ${debtors ? 'dcard-sum__item--debt' : 'dcard-sum__item--ok'}`}>
          <span className="dcard-sum__label">{debtors ? `Должны ${debtors} из ${drivers.length}` : 'Долгов нет'}</span>
          <b>{fmtMoney(sum('debt'))} <small>сум</small></b>
        </div>
      </div>

      <div className="ledger-box__head">
        <p className="muted small ledger-box__note">Нажмите на карточку — откроются дни: когда и сколько водитель не доплатил.</p>
        <button type="button" className="btn btn--quiet" onClick={exportAll}>Скачать в Excel</button>
      </div>

      <div className="dcards">
        {drivers.map((d) => {
          const debt = d.debt > 0;
          return (
            <button
              key={d.driver_id}
              type="button"
              className={`dcard ${debt ? 'dcard--debt' : 'dcard--ok'}`}
              onClick={() => onPick(d.driver_id)}
            >
              <div className="dcard__head">
                <div className="dcard__who">
                  <b className="dcard__name">{d.full_name}</b>
                  {d.phone && <span className="muted small">{d.phone}</span>}
                </div>
                <div className="dcard__plates">
                  {d.cars.map((plate) => <Plate key={plate} value={plate} />)}
                </div>
              </div>

              <div className={`dcard__status ${debt ? 'dcard__status--debt' : 'dcard__status--ok'}`}>
                {debt ? (
                  <>
                    <span className="dcard__status-label">Должен</span>
                    <b className="dcard__status-sum">{fmtMoney(d.debt)} <small>сум</small></b>
                    <span className="dcard__status-days">{`${d.debt_days} дн. с долгом`}</span>
                  </>
                ) : (
                  <>
                    <span className="dcard__status-label">Долгов нет</span>
                    <b className="dcard__status-sum">✓ Всё оплачено</b>
                  </>
                )}
              </div>

              <dl className="dcard__nums">
                <div><dt>Начислено</dt><dd>{fmtMoney(d.accrued)}</dd></div>
                <div><dt>Наличные</dt><dd>{fmtMoney(d.cash)}</dd></div>
                <div><dt>Карта / баланс</dt><dd>{fmtMoney(d.transfer)}</dd></div>
              </dl>
            </button>
          );
        })}
      </div>
    </div>
  );
}
