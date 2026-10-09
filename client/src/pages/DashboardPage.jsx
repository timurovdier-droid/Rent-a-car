import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import StatusMark from '../components/StatusMark';
import CarTile from '../components/CarTile';
import CarForm from '../components/CarForm';
import BarChart from '../components/BarChart';
import MonthFinance from '../components/MonthFinance';
import { fmtMoney, fmtDay } from '../labels';

function Stat({ label, value, hint, tone, plain = false }) {
  return (
    <div className={`stat ${tone ? `stat--${tone}` : ''}`}>
      <div className="stat__label">{label}</div>
      <div className="stat__value">{plain ? value : fmtMoney(value)}{!plain && <small>сум</small>}</div>
      {hint && <div className="stat__hint">{hint}</div>}
    </div>
  );
}

function alertWeight(car) {
  return (car.pending_count ? 4 : 0)
    + (car.service_due === 'OVERDUE' ? 3 : car.service_due ? 1 : 0)
    + (car.insurance_due || car.inspection_due ? 2 : 0);
}

function FleetCard({ car, onEdit }) {
  const alert = alertWeight(car) > 0;
  return (
    <CarTile car={car} onEdit={onEdit} alert={alert}>
      <div className="ct__row">
        <span className="muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{car.driver_name || 'Без водителя'}</span>
        <StatusMark status={car.status} />
      </div>
      <div className="ct__row"><span className="muted">Ставка</span><b>{fmtMoney(car.daily_rate)} / день</b></div>
      <div className="ct__row">
        <span className="muted">Долг</span>
        <b style={{ color: car.debt ? 'var(--c-danger)' : 'var(--c-ok)' }}>{car.debt ? `${fmtMoney(car.debt)} сум` : 'нет'}</b>
      </div>
      {alert && (
        <div className="badges">
          {car.pending_count > 0 && (
            <span className="badge badge--wait">Ждёт подтверждения · {fmtMoney(car.pending_amount)}</span>
          )}
          {car.service_due && (
            <span className={`badge ${car.service_due === 'OVERDUE' ? 'badge--danger' : 'badge--warn'}`}>
              {car.service_due === 'OVERDUE' ? 'Пора на обслуживание' : 'Скоро ТО'}
            </span>
          )}
          {car.insurance_due && (
            <span className={`badge ${car.insurance_due === 'OVERDUE' ? 'badge--danger' : 'badge--warn'}`}>Страховка</span>
          )}
          {car.inspection_due && (
            <span className={`badge ${car.inspection_due === 'OVERDUE' ? 'badge--danger' : 'badge--warn'}`}>Техосмотр</span>
          )}
        </div>
      )}
    </CarTile>
  );
}

function useCarEditor(onSaved) {
  const [editing, setEditing] = useState(null);
  const open = (car) => api.get(`/cars/${car.id}`).then(setEditing).catch(() => {});
  const form = editing && (
    <CarForm car={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); onSaved(); }} />
  );
  return [open, form];
}

function FleetHome({ data, reload }) {
  const isAdmin = data.role === 'ADMIN';
  const s = data.stats;
  const [openEdit, editForm] = useCarEditor(reload);
  const cars = [...data.cars].sort((a, b) => alertWeight(b) - alertWeight(a));
  const chartTotal = data.chart.reduce((sum, d) => sum + d.income, 0);

  return (
    <>
      <div className="section-head">
        <h2>Машины · {s.cars_rented} из {s.cars_total} в аренде</h2>
        <Link to="/cars" className="link-btn">Все автомобили</Link>
      </div>
      {cars.length === 0 ? (
        <div className="empty">Автомобилей пока нет</div>
      ) : (
        <div className="car-grid car-grid--tiles">
          {cars.map((car) => <FleetCard key={car.id} car={car} onEdit={openEdit} />)}
        </div>
      )}

      {isAdmin ? (
        <>
          <div className="section-head">
            <h2>Финансы парка</h2>
            <span className="muted small">сегодня получено {fmtMoney(s.today_income)} сум</span>
          </div>
          <MonthFinance title="Финансовые показатели парка" subtitle="Подтверждённые доходы и расходы по всем машинам" />
        </>
      ) : (
        <>
          <div className="section-head">
            <h2>Сводка</h2>
            <span className="muted small">по вашим записям</span>
          </div>
          <div className="stats">
            <Stat label="Сегодня получено" value={s.today_income} tone="accent" />
            <Stat label="За месяц" value={s.month_income} tone="ok" hint="подтверждено админом" />
            <Stat label="Долг водителей" value={s.debt} tone={s.debt ? 'danger' : 'ok'} />
            <Stat
              label="Ждёт подтверждения"
              value={s.pending_amount}
              hint={s.pending_count ? `${s.pending_count} запис.` : 'всё подтверждено'}
            />
          </div>

          <div className="section-head">
            <h2>Получено за 14 дней</h2>
            <span className="muted small">{fmtMoney(chartTotal)} сум · {fmtDay(data.chart[0]?.day)} — {fmtDay(data.today)}</span>
          </div>
          <BarChart data={data.chart} series={[{ key: 'income', label: 'Получено', className: 'bar--income' }]} />
        </>
      )}
      {editForm}
    </>
  );
}

function OwnerHome({ data }) {
  return (
    <>
      <div className="section-head"><h2>Ваши машины</h2></div>
      {data.cars.length === 0 ? (
        <div className="empty">У вас пока нет автомобилей</div>
      ) : (
        <div className="car-grid car-grid--tiles">
          {data.cars.map((c) => (
            <CarTile key={c.id} car={c}>
              <div className="ct__row"><span className="muted">Статус</span><StatusMark status={c.status} /></div>
              <div className="ct__row"><span className="muted">Доход</span><b>{fmtMoney(c.income)}</b></div>
              <div className="ct__row"><span className="muted">Расходы</span><b>{fmtMoney(c.expenses)}</b></div>
              <div className="ct__row"><span className="muted">Прибыль</span><b>{fmtMoney(c.profit)}</b></div>
            </CarTile>
          ))}
        </div>
      )}
      <div className="section-head"><h2>Финансы</h2></div>
      <MonthFinance title="Финансовые показатели" subtitle="Доход, расходы и прибыль по вашим машинам" />
    </>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api.get('/dashboard').then(setData).catch(() => setError('Не удалось загрузить данные'));
  }, []);

  useEffect(() => { load(); }, [load]);

  if (error) return <div className="notice notice--error">{error}</div>;
  if (!data) return <div className="muted">Загрузка…</div>;

  return (
    <div>
      <h1 className="page-title">Здравствуйте{user?.full_name ? `, ${user.full_name}` : ''}</h1>
      <p className="page-sub">{fmtDay(data.today)} · {data.role === 'OWNER' ? 'ваши машины и доход' : 'нажмите на машину, чтобы записать деньги'}</p>
      {(data.role === 'ADMIN' || data.role === 'DISPATCHER') && <FleetHome data={data} reload={load} />}
      {data.role === 'OWNER' && <OwnerHome data={data} />}    </div>
  );
}
