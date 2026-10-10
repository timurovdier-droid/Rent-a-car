import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import PeriodPicker, { defaultPeriod } from '../components/PeriodPicker';
import DriverLedger, { DriverDebtList } from '../components/DriverLedger';
import DriverRentStatus from '../components/RentStatus';

export default function DriverReportPage() {
  const [params, setParams] = useSearchParams();
  const driverId = params.get('driver') || '';
  const [period, setPeriod] = useState(defaultPeriod);
  const [drivers, setDrivers] = useState(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    api.get('/drivers').then(setDrivers).catch(() => setDrivers([]));
  }, []);

  function pick(id) {
    setParams(id ? { driver: String(id) } : {});
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Отчёт по водителям</h1>
          <p className="page-sub">Отмечайте по каждому дню: дал водитель деньги или нет</p>
        </div>
      </div>

      <div className="ledger-pick">
        <div className="field">
          <label className="field__label" htmlFor="dr-driver">Водитель</label>
          <select
            id="dr-driver"
            className="field__input"
            value={driverId}
            onChange={(e) => pick(e.target.value)}
            disabled={!drivers}
          >
            <option value="">{drivers ? 'Все водители' : 'Загрузка…'}</option>
            {(drivers || []).map((d) => (
              <option key={d.id} value={d.id}>
                {d.full_name}{d.car_plate ? ` · ${d.car_plate}` : ''}
              </option>
            ))}
          </select>
        </div>
        {driverId && (
          <>
            <button type="button" className="btn btn--quiet" onClick={() => pick('')}>← Все водители</button>
            <Link to={`/drivers/${driverId}`} className="btn btn--ghost" style={{ textDecoration: 'none' }}>Карточка водителя</Link>
          </>
        )}
      </div>

      {driverId && (
        <div style={{ marginBottom: 24 }}>
          <DriverRentStatus driverId={driverId} version={version} onChanged={() => setVersion((v) => v + 1)} />
        </div>
      )}

      {driverId && <h2 className="drv__title">Оплаты по дням</h2>}
      <PeriodPicker value={period} onChange={setPeriod} />

      <div style={{ marginTop: 16 }}>
        {driverId
          ? <DriverLedger driverId={driverId} period={period} canPay onChanged={() => setVersion((v) => v + 1)} />
          : <DriverDebtList period={period} onPick={pick} />}
      </div>
    </div>
  );
}
