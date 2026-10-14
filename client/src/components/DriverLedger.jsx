import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import Plate from './Plate';
import PeriodPicker, { defaultPeriod } from './PeriodPicker';
import { LedgerSummary, LedgerTable, PayDayModal, exportLedger } from './CarLedger';
import { fmtMoney, downloadCsv } from '../labels';

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
  const accrued = sum('accrued');
  const received = sum('cash') + sum('transfer');
  const share = (part, whole) => (whole > 0 ? Math.min(100, Math.round((part / whole) * 100)) : 100);

  return (
    <div className="ledger-box">
      <section className="dsum">
        <div className="dsum__main">
          <span className="dsum__label">Долг за период</span>
          <span className={`dsum__value ${debtors ? 'dsum__value--debt' : ''}`}>
            {fmtMoney(sum('debt'))}<span className="dsum__unit">сум</span>
          </span>
          <span className="dsum__note">
            {debtors ? `${debtors} из ${drivers.length} водителей не доплатили` : 'Все водители рассчитались'}
          </span>
        </div>
        <div className="dsum__side">
          <div className="dsum__row"><span>Начислено</span><b>{fmtMoney(accrued)}</b></div>
          <div className="dsum__row"><span>Получено</span><b>{fmtMoney(received)}</b></div>
          <div className="dbar" aria-hidden="true"><span style={{ width: `${share(received, accrued)}%` }} /></div>
          <span className="dsum__pct">{`${share(received, accrued)}% собрано`}</span>
        </div>
      </section>

      <div className="ledger-box__head">
        <p className="muted small ledger-box__note">Нажмите на карточку — откроются дни: когда и сколько водитель не доплатил.</p>
        <button type="button" className="btn btn--quiet" onClick={exportAll}>Скачать в Excel</button>
      </div>

      <div className="dcards">
        {drivers.map((d) => {
          const debt = d.debt > 0;
          const paid = d.cash + d.transfer;
          return (
            <button key={d.driver_id} type="button" className="dcard" onClick={() => onPick(d.driver_id)}>
              <div className="dcard__head">
                <div className="dcard__who">
                  <span className="dcard__name">{d.full_name}</span>
                  {d.phone && <span className="dcard__phone">{d.phone}</span>}
                </div>
                <div className="dcard__plates">
                  {d.cars.map((plate) => <Plate key={plate} value={plate} />)}
                </div>
              </div>

              <div className="dcard__money">
                {debt ? (
                  <>
                    <span className="dcard__debt">−{fmtMoney(d.debt)}<span className="dcard__unit">сум</span></span>
                    <span className="dcard__tag dcard__tag--debt">{`долг · ${d.debt_days} дн.`}</span>
                  </>
                ) : (
                  <>
                    <span className="dcard__clear">Рассчитался</span>
                    <span className="dcard__tag">без долга</span>
                  </>
                )}
              </div>

              <div className={`dbar ${debt ? 'dbar--debt' : ''}`} aria-hidden="true">
                <span style={{ width: `${share(paid, d.accrued)}%` }} />
              </div>

              <div className="dcard__foot">
                <span>{`Получено ${fmtMoney(paid)} из ${fmtMoney(d.accrued)}`}</span>
                <span className="dcard__split">{`нал. ${fmtMoney(d.cash)} · карта ${fmtMoney(d.transfer)}`}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
