import { useState, useEffect } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import Plate from '../components/Plate';
import StatusMark from '../components/StatusMark';
import Money from '../components/Money';

export default function DashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function fetchDashboard() {
      try {
        const result = await api.get('/dashboard');
        setData(result);
      } catch (err) {
        setError('Не удалось загрузить данные');
      } finally {
        setLoading(false);
      }
    }
    fetchDashboard();
  }, []);

  if (loading) return <div>Загрузка...</div>;
  if (error) return <div className="field__error">{error}</div>;
  if (!data) return null;

  return (
    <div>
      <h1 className="page-title">
        Добро пожаловать, {user?.full_name || 'Пользователь'}
      </h1>
      <p className="page-sub">
        {data.role === 'DRIVER' && 'Ваши активные назначения и последние платежи'}
        {data.role === 'DISPATCHER' && 'Ваша очередь платежей и статистика за сегодня'}
        {data.role === 'ADMIN' && 'Общая сводка по системе'}
        {data.role === 'OWNER' && 'Ваши автомобили и поступления'}
      </p>

      {/* DRIVER */}
      {data.role === 'DRIVER' && (
        <>
          <h2 style={{ fontSize: 'var(--fs-l)', fontWeight: 600, marginBottom: 'var(--sp-2)' }}>
            Активные назначения
          </h2>
          {data.assignments.length === 0 ? (
            <p style={{ color: 'var(--c-muted)' }}>У вас нет активных назначений</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(16rem, 1fr))', gap: 'var(--sp-3)', marginBottom: 'var(--sp-5)' }}>
              {data.assignments.map((a) => (
                <div key={a.id} className="card">
                  <Plate value={a.plate} />
                  <div style={{ marginTop: 'var(--sp-2)', fontWeight: 500 }}>
                    {a.brand} {a.model}
                  </div>
                  <div style={{ fontSize: 'var(--fs-s)', color: 'var(--c-muted)', marginTop: 'var(--sp-1)' }}>
                    С {new Date(a.start_at).toLocaleDateString('ru-RU')}
                  </div>
                </div>
              ))}
            </div>
          )}

          <h2 style={{ fontSize: 'var(--fs-l)', fontWeight: 600, marginBottom: 'var(--sp-2)' }}>
            Последние платежи
          </h2>
          {data.recentPayments.length === 0 ? (
            <p style={{ color: 'var(--c-muted)' }}>Платежей пока нет</p>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th className="table__th">Дата</th>
                    <th className="table__th table__num">Сумма</th>
                    <th className="table__th">Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentPayments.map((p) => (
                    <tr key={p.id} className="table__row">
                      <td className="table__td">
                        {new Date(p.created_at).toLocaleString('ru-RU')}
                      </td>
                      <td className="table__td table__num">
                        <Money value={p.amount_declared} />
                      </td>
                      <td className="table__td">
                        <StatusMark status={p.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* DISPATCHER */}
      {data.role === 'DISPATCHER' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(14rem, 1fr))', gap: 'var(--sp-3)' }}>
          <div className="card">
            <div style={{ color: 'var(--c-muted)', fontSize: 'var(--fs-s)', marginBottom: 'var(--sp-1)' }}>
              В очереди
            </div>
            <div style={{ fontSize: 'var(--fs-xl)', fontWeight: 600 }}>
              {data.queue?.count || 0}
            </div>
            <div style={{ fontSize: 'var(--fs-s)', color: 'var(--c-muted)', marginTop: 'var(--sp-1)' }}>
              <Money value={data.queue?.total_amount || 0} />
            </div>
          </div>
          <div className="card">
            <div style={{ color: 'var(--c-muted)', fontSize: 'var(--fs-s)', marginBottom: 'var(--sp-1)' }}>
              Платежей сегодня
            </div>
            <div style={{ fontSize: 'var(--fs-xl)', fontWeight: 600 }}>
              {data.todayStats?.payments_today || 0}
            </div>
          </div>
          <div className="card">
            <div style={{ color: 'var(--c-muted)', fontSize: 'var(--fs-s)', marginBottom: 'var(--sp-1)' }}>
              Подтверждено сегодня
            </div>
            <div style={{ fontSize: 'var(--fs-l)', fontWeight: 600 }}>
              <Money value={data.todayStats?.confirmed_today || 0} />
            </div>
          </div>
        </div>
      )}

      {/* ADMIN */}
      {data.role === 'ADMIN' && data.stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(14rem, 1fr))', gap: 'var(--sp-3)' }}>
          <div className="card">
            <div style={{ color: 'var(--c-muted)', fontSize: 'var(--fs-s)', marginBottom: 'var(--sp-1)' }}>
              Активных водителей
            </div>
            <div style={{ fontSize: 'var(--fs-xl)', fontWeight: 600 }}>
              {data.stats.active_drivers}
            </div>
          </div>
          <div className="card">
            <div style={{ color: 'var(--c-muted)', fontSize: 'var(--fs-s)', marginBottom: 'var(--sp-1)' }}>
              Активных диспетчеров
            </div>
            <div style={{ fontSize: 'var(--fs-xl)', fontWeight: 600 }}>
              {data.stats.active_dispatchers}
            </div>
          </div>
          <div className="card">
            <div style={{ color: 'var(--c-muted)', fontSize: 'var(--fs-s)', marginBottom: 'var(--sp-1)' }}>
              Автомобилей в парке
            </div>
            <div style={{ fontSize: 'var(--fs-xl)', fontWeight: 600 }}>
              {data.stats.active_cars}
            </div>
          </div>
          <div className="card">
            <div style={{ color: 'var(--c-muted)', fontSize: 'var(--fs-s)', marginBottom: 'var(--sp-1)' }}>
              Ждут диспетчера
            </div>
            <div style={{ fontSize: 'var(--fs-xl)', fontWeight: 600 }}>
              {data.stats.pending_dispatcher}
            </div>
          </div>
          <div className="card">
            <div style={{ color: 'var(--c-muted)', fontSize: 'var(--fs-s)', marginBottom: 'var(--sp-1)' }}>
              Ждут администратора
            </div>
            <div style={{ fontSize: 'var(--fs-xl)', fontWeight: 600 }}>
              {data.stats.pending_admin}
            </div>
          </div>
          <div className="card">
            <div style={{ color: 'var(--c-muted)', fontSize: 'var(--fs-s)', marginBottom: 'var(--sp-1)' }}>
              Подтверждено сегодня
            </div>
            <div style={{ fontSize: 'var(--fs-l)', fontWeight: 600 }}>
              <Money value={data.stats.confirmed_today || 0} />
            </div>
          </div>
        </div>
      )}

      {/* OWNER */}
      {data.role === 'OWNER' && (
        <>
          <h2 style={{ fontSize: 'var(--fs-l)', fontWeight: 600, marginBottom: 'var(--sp-2)' }}>
            Ваши автомобили
          </h2>
          {data.cars.length === 0 ? (
            <p style={{ color: 'var(--c-muted)' }}>У вас пока нет автомобилей</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(16rem, 1fr))', gap: 'var(--sp-3)', marginBottom: 'var(--sp-5)' }}>
              {data.cars.map((c) => (
                <div key={c.id} className="card">
                  <Plate value={c.plate} />
                  <div style={{ marginTop: 'var(--sp-2)', fontWeight: 500 }}>
                    {c.brand} {c.model}
                  </div>
                  <div style={{ marginTop: 'var(--sp-1)' }}>
                    <StatusMark status={c.status} />
                  </div>
                </div>
              ))}
            </div>
          )}

          <h2 style={{ fontSize: 'var(--fs-l)', fontWeight: 600, marginBottom: 'var(--sp-2)' }}>
            Последние поступления
          </h2>
          {data.recentPayments.length === 0 ? (
            <p style={{ color: 'var(--c-muted)' }}>Поступлений пока нет</p>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th className="table__th">Дата</th>
                    <th className="table__th">Авто</th>
                    <th className="table__th table__num">Сумма</th>
                    <th className="table__th">Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentPayments.map((p) => (
                    <tr key={p.id} className="table__row">
                      <td className="table__td">
                        {new Date(p.created_at).toLocaleString('ru-RU')}
                      </td>
                      <td className="table__td">
                        <Plate value={p.plate} />
                      </td>
                      <td className="table__td table__num">
                        <Money value={p.amount_admin} />
                      </td>
                      <td className="table__td">
                        <StatusMark status={p.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}