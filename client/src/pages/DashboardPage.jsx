import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import Plate from '../components/Plate';
import BarChart from '../components/BarChart';
import MonthFinance from '../components/MonthFinance';
import PeriodFinance from '../components/PeriodFinance';
import MonthRangePicker, { wholeMonth, rangeLabel } from '../components/MonthRangePicker';
import Select from '../components/Select';
import { alertWeight, CarAlertBadges } from '../components/CarAlerts';
import { useAuth } from '../auth';
import { fmtMoney, fmtDay, todayLocal } from '../labels';

function Stat({ label, value, hint, tone, plain = false }) {
  return (
    <div className={`stat ${tone ? `stat--${tone}` : ''}`}>
      <div className="stat__label">{label}</div>
      <div className="stat__value">{plain ? value : fmtMoney(value)}{!plain && <small>сум</small>}</div>
      {hint && <div className="stat__hint">{hint}</div>}
    </div>
  );
}

function Attention({ cars }) {
  const navigate = useNavigate();
  const list = cars
    .filter((c) => c.debt > 0 || alertWeight(c) > 0)
    .sort((a, b) => alertWeight(b) - alertWeight(a) || b.debt - a.debt);

  return (
    <>
      <div className="section-head">
        <h2>Машины с долгом и напоминаниями</h2>
        <Link to="/cars" className="link-btn">Все автомобили</Link>
      </div>
      {list.length === 0 ? (
        <div className="empty">Долгов и напоминаний нет — всё в порядке</div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th className="table__th">Номер</th>
                <th className="table__th">Водитель</th>
                <th className="table__th table__num">Долг</th>
                <th className="table__th">Что сделать</th>
              </tr>
            </thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id} className="table__row" style={{ cursor: 'pointer' }} onClick={() => navigate(`/cars/${c.id}`)}>
                  <td className="table__td">
                    <Plate value={c.plate} />
                    <div className="muted small">{c.brand} {c.model}</div>
                  </td>
                  <td className="table__td">{c.driver_name || <span className="muted">Без водителя</span>}</td>
                  <td className="table__td table__num">
                    {c.debt > 0 ? <b style={{ color: 'var(--c-danger)' }}>{fmtMoney(c.debt)} сум</b> : <span className="muted">нет</span>}
                  </td>
                  <td className="table__td"><CarAlertBadges car={c} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function SummaryFilters({ value, onChange }) {
  const [owners, setOwners] = useState(null);
  const [cars, setCars] = useState(null);

  useEffect(() => {
    api.get('/owners').then(setOwners).catch(() => setOwners([]));
    api.get('/cars').then(setCars).catch(() => setCars([]));
  }, []);

  const ownerOptions = [
    { value: '', label: 'Все владельцы' },
    ...(owners || []).filter((o) => o.status !== 'ARCHIVED').map((o) => ({ value: String(o.id), label: o.name })),
  ];
  const carOptions = [
    { value: '', label: value.owner ? 'Все машины владельца' : 'Все машины' },
    ...(cars || [])
      .filter((c) => !c.archived_at && (!value.owner || String(c.owner_id) === value.owner))
      .map((c) => ({ value: String(c.id), label: c.plate, hint: `${c.brand} ${c.model}` })),
  ];

  return (
    <div className="sum-filters">
      <div className="field">
        <span className="field__label">Дата или период</span>
        <MonthRangePicker value={value.range} onChange={(range) => onChange({ ...value, range })} />
      </div>
      <div className="field">
        <label className="field__label" htmlFor="sf-owner">Владелец</label>
        <Select
          id="sf-owner"
          value={value.owner}
          onChange={(owner) => onChange({ ...value, owner: String(owner || ''), car: '' })}
          options={ownerOptions}
          disabled={!owners}
        />
      </div>
      <div className="field">
        <label className="field__label" htmlFor="sf-car">Машина</label>
        <Select
          id="sf-car"
          value={value.car}
          onChange={(car) => onChange({ ...value, car: String(car || '') })}
          options={carOptions}
          disabled={!cars}
        />
      </div>
      {(value.owner || value.car) && (
        <button type="button" className="btn btn--quiet sum-filters__reset" onClick={() => onChange({ ...value, owner: '', car: '' })}>
          Сбросить
        </button>
      )}
    </div>
  );
}

function FleetHome({ data, range, filter }) {
  const isAdmin = data.role === 'ADMIN';
  const s = data.stats;
  const chartTotal = data.chart.reduce((sum, d) => sum + d.income, 0);
  const single = isAdmin && s.from === s.to;

  return (
    <>
      <div className="section-head section-head--lead">
        <h2>Сводка</h2>
        {!isAdmin && <span className="muted small">деньги — по вашим записям</span>}
      </div>
      <div className="stats">
        <Stat label="Машин в аренде" value={`${s.cars_rented} из ${s.cars_total}`} plain hint={`свободно ${s.cars_total - s.cars_rented}`} />
        <Stat label="Сегодня получено" value={s.today_income} tone="accent" />
        {isAdmin
          ? <Stat label={single ? 'Получено за день' : 'Получено за период'} value={s.month_income} tone="ok" hint={rangeLabel(range)} />
          : <Stat label="Получено за месяц" value={s.month_income} tone="ok" hint="подтверждено" />}
        <Stat label="Долг водителей" value={s.debt} tone={s.debt ? 'danger' : 'ok'} />
        <Stat
          label="Ждёт подтверждения"
          value={s.pending_amount}
          hint={s.pending_count ? `${s.pending_count} запис.` : 'всё подтверждено'}
        />
      </div>

      {isAdmin ? (
        <>
          <div className="section-head"><h2>Финансы парка</h2></div>
          <MonthFinance
            title="Финансовые показатели парка"
            subtitle={filter ? 'Подтверждённые доходы и расходы по выбранным машинам' : 'Подтверждённые доходы и расходы по всем машинам'}
            range={range}
            filter={filter}
          />
        </>
      ) : (
        <>
          <div className="section-head">
            <h2>Получено за 14 дней</h2>
            <span className="muted small">{fmtMoney(chartTotal)} сум · {fmtDay(data.chart[0]?.day)} — {fmtDay(data.today)}</span>
          </div>
          <BarChart data={data.chart} series={[{ key: 'income', label: 'Получено', className: 'bar--income' }]} />
        </>
      )}

      {!isAdmin && <Attention cars={data.cars} />}
    </>
  );
}

function OwnerHome({ data }) {
  const navigate = useNavigate();
  const s = data.stats;
  return (
    <>
      <div className="section-head section-head--lead"><h2>Сводка за месяц</h2></div>
      <div className="stats">
        <Stat label="Машин" value={data.cars.length} plain />
        <Stat label="Доход" value={s.month_income} tone="ok" />
        <Stat label="Расходы" value={s.month_expenses} />
        <Stat label="Прибыль" value={s.month_profit} tone="accent" />
      </div>

      <div className="section-head"><h2>Финансы</h2></div>
      <MonthFinance title="Финансовые показатели" subtitle="Доход, расходы и прибыль по вашим машинам" />

      <div className="section-head">
        <h2>Прибыль по машинам</h2>
        <Link to="/cars" className="link-btn">Мои автомобили</Link>
      </div>
      {data.cars.length === 0 ? (
        <div className="empty">У вас пока нет автомобилей</div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th className="table__th">Номер</th>
                <th className="table__th table__num">Доход</th>
                <th className="table__th table__num">Расходы</th>
                <th className="table__th table__num">Прибыль</th>
              </tr>
            </thead>
            <tbody>
              {[...data.cars].sort((a, b) => b.profit - a.profit).map((c) => (
                <tr key={c.id} className="table__row" style={{ cursor: 'pointer' }} onClick={() => navigate(`/cars/${c.id}`)}>
                  <td className="table__td">
                    <Plate value={c.plate} />
                    <div className="muted small">{c.brand} {c.model}</div>
                  </td>
                  <td className="table__td table__num">{fmtMoney(c.income)}</td>
                  <td className="table__td table__num">{fmtMoney(c.expenses)}</td>
                  <td className="table__td table__num"><b>{fmtMoney(c.profit)}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <PeriodFinance />
    </>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [filters, setFilters] = useState(() => ({ range: wholeMonth(todayLocal().slice(0, 7)), owner: '', car: '' }));
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const filter = `${filters.owner ? `&owner=${filters.owner}` : ''}${filters.car ? `&car=${filters.car}` : ''}`;
  const query = isAdmin ? `?from=${filters.range.from}&to=${filters.range.to}${filter}` : '';

  const load = useCallback(() => {
    setError('');
    api.get(`/dashboard${query}`).then(setData).catch(() => setError('Не удалось загрузить данные'));
  }, [query]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      {isAdmin && <SummaryFilters value={filters} onChange={setFilters} />}
      {error && <div className="notice notice--error">{error}</div>}
      {!data && !error && <div className="muted">Загрузка…</div>}
      {data && <Home data={data} range={filters.range} filter={filter} />}
    </div>
  );
}

function Home({ data, range, filter }) {
  return (
    <div>
      {(data.role === 'ADMIN' || data.role === 'DISPATCHER') && <FleetHome data={data} range={range} filter={filter} />}
      {data.role === 'OWNER' && <OwnerHome data={data} />}
    </div>
  );
}
