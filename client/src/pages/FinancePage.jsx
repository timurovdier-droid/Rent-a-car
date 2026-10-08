import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import Money from '../components/Money';
import Plate from '../components/Plate';

export default function FinancePage() {
  const { user } = useAuth();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Для ADMIN
  const [summary, setSummary] = useState(null);
  const [ownersList, setOwnersList] = useState([]);

  // Для OWNER
  const [ownerData, setOwnerData] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (from) params.append('from', from);
      if (to) params.append('to', to);
      const qs = params.toString();

      if (user?.role === 'ADMIN') {
        const [summaryData, ownersData] = await Promise.all([
          api.get(`/finance/summary${qs ? '?' + qs : ''}`),
          api.get(`/finance/owners-list${qs ? '?' + qs : ''}`),
        ]);
        setSummary(summaryData);
        setOwnersList(ownersData);
      } else if (user?.role === 'OWNER') {
        const data = await api.get(`/finance/owner-summary${qs ? '?' + qs : ''}`);
        setOwnerData(data);
      }
    } catch (err) {
      setError('Не удалось загрузить финансовые данные');
    } finally {
      setLoading(false);
    }
  }, [from, to, user?.role]);

  useEffect(() => {
    if (user) fetchData();
  }, [fetchData, user]);

  function handleApply(e) {
    e.preventDefault();
    fetchData();
  }

  function handleReset() {
    setFrom('');
    setTo('');
  }

  if (loading) return <div>Загрузка...</div>;
  if (error) return <div className="field__error">{error}</div>;

  return (
    <div>
      <h1 className="page-title">Финансы</h1>
      <p className="page-sub">
        {user?.role === 'ADMIN' ? 'Общая финансовая сводка и выплаты арендодателям' : 'Ваши автомобили и поступления'}
      </p>

      {/* Фильтр по периоду */}
      <form onSubmit={handleApply} style={{ display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 'var(--sp-4)', maxWidth: '40rem' }}>
        <div className="field" style={{ margin: 0, flex: 1, minWidth: '10rem' }}>
          <label className="field__label" htmlFor="from">С даты</label>
          <input
            id="from"
            className="field__input"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div className="field" style={{ margin: 0, flex: 1, minWidth: '10rem' }}>
          <label className="field__label" htmlFor="to">По дату</label>
          <input
            id="to"
            className="field__input"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
        <button className="btn" type="submit" style={{ minHeight: '40px' }}>Применить</button>
        <button className="btn btn--quiet" type="button" onClick={handleReset} style={{ minHeight: '40px' }}>Сбросить</button>
      </form>

      {/* Для ADMIN: общая сводка */}
      {user?.role === 'ADMIN' && summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(14rem, 1fr))', gap: 'var(--sp-3)', marginBottom: 'var(--sp-5)' }}>
          <div className="card">
            <div style={{ color: 'var(--c-muted)', fontSize: 'var(--fs-s)', marginBottom: 'var(--sp-1)' }}>Всего платежей</div>
            <div style={{ fontSize: 'var(--fs-xl)', fontWeight: 600 }}>{summary.total_payments || 0}</div>
          </div>
          <div className="card">
            <div style={{ color: 'var(--c-muted)', fontSize: 'var(--fs-s)', marginBottom: 'var(--sp-1)' }}>Подтверждено</div>
            <div style={{ fontSize: 'var(--fs-l)', fontWeight: 600 }}>
              <Money value={summary.confirmed_amount || 0} />
            </div>
          </div>
          <div className="card">
            <div style={{ color: 'var(--c-muted)', fontSize: 'var(--fs-s)', marginBottom: 'var(--sp-1)' }}>Ждёт диспетчера</div>
            <div style={{ fontSize: 'var(--fs-l)', fontWeight: 600 }}>
              <Money value={summary.pending_dispatcher || 0} />
            </div>
          </div>
          <div className="card">
            <div style={{ color: 'var(--c-muted)', fontSize: 'var(--fs-s)', marginBottom: 'var(--sp-1)' }}>Ждёт администратора</div>
            <div style={{ fontSize: 'var(--fs-l)', fontWeight: 600 }}>
              <Money value={summary.pending_admin || 0} />
            </div>
          </div>
        </div>
      )}

      {/* Для ADMIN: список арендодателей с суммами */}
      {user?.role === 'ADMIN' && (
        <>
          <h2 style={{ fontSize: 'var(--fs-l)', fontWeight: 600, marginBottom: 'var(--sp-2)' }}>Арендодатели</h2>
          {ownersList.length === 0 ? (
            <p style={{ color: 'var(--c-muted)' }}>Арендодателей пока нет</p>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th className="table__th">Название</th>
                    <th className="table__th">Телефон</th>
                    <th className="table__th table__num">Авто</th>
                    <th className="table__th table__num">К выплате</th>
                  </tr>
                </thead>
                <tbody>
                  {ownersList.map((o) => (
                    <tr key={o.id} className="table__row">
                      <td className="table__td">{o.name}</td>
                      <td className="table__td">{o.phone}</td>
                      <td className="table__td table__num">{o.cars_count}</td>
                      <td className="table__td table__num">
                        <Money value={o.total_amount} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Для OWNER: его автомобили и поступления */}
      {user?.role === 'OWNER' && ownerData && (
        <>
          <div className="card" style={{ marginBottom: 'var(--sp-4)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--sp-2)' }}>
              <div>
                <div style={{ fontSize: 'var(--fs-l)', fontWeight: 600 }}>{ownerData.owner?.name}</div>
                <div style={{ color: 'var(--c-muted)', fontSize: 'var(--fs-s)' }}>
                  {ownerData.owner?.contact_person} · {ownerData.owner?.phone}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ color: 'var(--c-muted)', fontSize: 'var(--fs-s)' }}>Итого к выплате</div>
                <div style={{ fontSize: 'var(--fs-xl)', fontWeight: 600 }}>
                  <Money value={ownerData.total_amount} />
                </div>
              </div>
            </div>
          </div>

          {ownerData.cars.length === 0 ? (
            <p style={{ color: 'var(--c-muted)' }}>Автомобилей пока нет</p>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th className="table__th">Номер</th>
                    <th className="table__th">Марка / Модель</th>
                    <th className="table__th table__num">Платежей</th>
                    <th className="table__th table__num">Поступило</th>
                  </tr>
                </thead>
                <tbody>
                  {ownerData.cars.map((c) => (
                    <tr key={c.car_id} className="table__row">
                      <td className="table__td">
                        <Plate value={c.plate} />
                      </td>
                      <td className="table__td">
                        {c.brand} {c.model}
                      </td>
                      <td className="table__td table__num">{c.payments_count}</td>
                      <td className="table__td table__num">
                        <Money value={c.confirmed_amount} />
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