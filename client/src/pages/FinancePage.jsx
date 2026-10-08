import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import Plate from '../components/Plate';
import BarChart from '../components/BarChart';
import PeriodPicker, { defaultPeriod } from '../components/PeriodPicker';
import MonthFinance from '../components/MonthFinance';
import { CATEGORY_LABELS, fmtMoney } from '../labels';

function Stat({ label, value, hint, tone }) {
  return (
    <div className={`stat ${tone ? `stat--${tone}` : ''}`}>
      <div className="stat__label">{label}</div>
      <div className="stat__value">{fmtMoney(value)}<small>сум</small></div>
      {hint && <div className="stat__hint">{hint}</div>}
    </div>
  );
}

export default function FinancePage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [period, setPeriod] = useState(defaultPeriod);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setError('');
    api.get(`/finance/overview?from=${period.from}&to=${period.to}`)
      .then(setData)
      .catch(() => setError('Не удалось загрузить финансы'));
  }, [period]);

  const t = data?.totals;
  const maxCategory = Math.max(1, ...(data?.categories || []).map((c) => c.total));

  return (
    <div>
      <h1 className="page-title">Финансы</h1>
      <p className="page-sub">{isAdmin ? 'Сводка по всему парку: только подтверждённые суммы' : 'Доход, расходы и прибыль по вашим машинам'}</p>

      <MonthFinance
        title={isAdmin ? 'Финансовые показатели парка' : 'Финансовые показатели'}
        subtitle={isAdmin ? 'Подтверждённые доходы и расходы по всем машинам' : 'Доход, расходы и прибыль по вашим машинам'}
      />

      <div className="section-head" style={{ marginTop: 28 }}><h2>Подробно за период</h2></div>
      <PeriodPicker value={period} onChange={setPeriod} />
      {error && <div className="notice notice--error">{error}</div>}
      {!data && !error && <div className="muted">Загрузка…</div>}

      {data && (
        <>
          <div className="stats">
            <Stat label="Доход" value={t.income} tone="ok" />
            <Stat label="Расходы" value={t.expenses} />
            <Stat label="Прибыль" value={t.profit} tone="accent" hint="доход − расходы" />
            {isAdmin && <Stat label="Начислено аренды" value={t.accrued} hint="по ставкам за период" />}
            {isAdmin && <Stat label="Долг сейчас" value={t.debt} tone={t.debt ? 'danger' : 'ok'} hint="за всё время" />}
            {isAdmin && <Stat label="Ждёт подтверждения" value={t.pending} hint={`${t.pending_count} запис.`} />}
          </div>

          <div className="section-head"><h2>По дням</h2></div>
          <BarChart
            data={data.chart}
            series={[{ key: 'income', label: 'Доход', className: 'bar--income' }, { key: 'expense', label: 'Расход', className: 'bar--expense' }]}
          />

          <div className="layout-2" style={{ marginTop: 12 }}>
            <div className="panel">
              <h3 className="panel__title">Куда ушли расходы</h3>
              {data.categories.length === 0 ? (
                <p className="muted">Расходов за период нет</p>
              ) : data.categories.map((c) => (
                <div key={c.category} style={{ marginBottom: 10 }}>
                  <div className="car-card__row"><span>{CATEGORY_LABELS[c.category] || c.category}</span><b>{fmtMoney(c.total)} сум</b></div>
                  <div style={{ height: 6, background: 'var(--c-soft)', borderRadius: 3, marginTop: 4 }}>
                    <div style={{ width: `${(c.total / maxCategory) * 100}%`, height: '100%', background: '#F08A80', borderRadius: 3 }} />
                  </div>
                </div>
              ))}
            </div>

            {isAdmin ? (
              <div className="panel">
                <h3 className="panel__title">По арендодателям</h3>
                {data.owners.length === 0 ? <p className="muted">Нет данных</p> : (
                  <div className="table-wrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th className="table__th">Арендодатель</th>
                          <th className="table__th table__num">Машин</th>
                          <th className="table__th table__num">Доход</th>
                          <th className="table__th table__num">Прибыль</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.owners.map((o) => (
                          <tr key={o.owner_id || 0} className="table__row">
                            <td className="table__td">{o.owner_name}</td>
                            <td className="table__td table__num">{o.cars}</td>
                            <td className="table__td table__num">{fmtMoney(o.income)}</td>
                            <td className="table__td table__num">{fmtMoney(o.profit)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : (
              <div className="panel">
                <h3 className="panel__title">По машинам</h3>
                {data.cars.map((c) => (
                  <Link key={c.car_id} to={`/cars/${c.car_id}`} className="car-card__row" style={{ padding: '10px 0', borderBottom: '1px solid var(--c-line)', color: 'inherit', textDecoration: 'none' }}>
                    <span><Plate value={c.plate} /> <span className="muted small">{c.brand} {c.model}</span></span>
                    <b>{fmtMoney(c.profit)} сум</b>
                  </Link>
                ))}
              </div>
            )}
          </div>
          {isAdmin && (
            <p className="muted small" style={{ marginTop: 16 }}>
              Подробно по каждой машине, долгам и выгрузка в Excel — в разделе <Link to="/reports">Отчёты</Link>.
            </p>
          )}
        </>
      )}
    </div>
  );
}
