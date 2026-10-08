import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import Plate from '../components/Plate';
import Money from '../components/Money';

const TABS = [
  { key: 'revenue', label: 'Выручка по дням' },
  { key: 'by-branch', label: 'По филиалам' },
  { key: 'by-owner', label: 'По арендодателям' },
  { key: 'top-cars', label: 'Топ автомобилей' },
  { key: 'top-drivers', label: 'Топ водителей' },
];

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState('revenue');
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    if (!from || !to) {
      setError('Укажите период');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const qs = `from=${from}&to=${to}`;
      const result = await api.get(`/reports/${activeTab}?${qs}`);
      setData(result);
    } catch (err) {
      setError('Не удалось загрузить отчёт');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [activeTab, from, to]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  function handleTabChange(key) {
    setActiveTab(key);
  }

  // Максимальное значение для визуализации бара
  function getMaxValue(items, field) {
    if (!items || items.length === 0) return 1;
    return Math.max(...items.map(i => Number(i[field]) || 0), 1);
  }

  return (
    <div>
      <h1 className="page-title">Отчёты</h1>
      <p className="page-sub">Аналитика по выручке, филиалам, арендодателям и лучшим сотрудникам</p>

      {/* Фильтр периода */}
      <form
        onSubmit={(e) => { e.preventDefault(); fetchData(); }}
        style={{ display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 'var(--sp-4)', maxWidth: '40rem' }}
      >
        <div className="field" style={{ margin: 0, flex: 1, minWidth: '10rem' }}>
          <label className="field__label" htmlFor="from">С даты</label>
          <input
            id="from"
            className="field__input"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            required
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
            required
          />
        </div>
        <button className="btn" type="submit" style={{ minHeight: '40px' }}>
          Применить
        </button>
      </form>

      {/* Табы */}
      <div style={{ display: 'flex', gap: 'var(--sp-1)', flexWrap: 'wrap', marginBottom: 'var(--sp-4)', borderBottom: '1px solid var(--c-border)', paddingBottom: 'var(--sp-2)' }}>
        {TABS.map((tab) => (
          <button
            key={tab.key}
            className={`btn ${activeTab === tab.key ? '' : 'btn--quiet'}`}
            style={{ fontSize: 'var(--fs-s)', minHeight: '36px' }}
            onClick={() => handleTabChange(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && <div className="field__error">{error}</div>}
      {loading && <div>Загрузка...</div>}

      {!loading && !error && data && (
        <>
          {/* Выручка по дням */}
          {activeTab === 'revenue' && (
            <>
              {data.length === 0 ? (
                <p style={{ color: 'var(--c-muted)' }}>Нет подтверждённых платежей за выбранный период</p>
              ) : (
                <>
                  {/* Простой визуальный график */}
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height: '120px', marginBottom: 'var(--sp-4)', padding: 'var(--sp-2)', background: 'var(--c-bg-soft)', borderRadius: 'var(--radius)' }}>
                    {data.map((row, i) => {
                      const max = getMaxValue(data, 'total_amount');
                      const height = (Number(row.total_amount) / max) * 100;
                      return (
                        <div
                          key={i}
                          title={`${row.day}: ${Number(row.total_amount).toLocaleString('ru-RU')} сум`}
                          style={{
                            flex: 1,
                            height: `${height}%`,
                            background: 'var(--c-primary)',
                            borderRadius: '2px 2px 0 0',
                            minHeight: '2px',
                          }}
                        />
                      );
                    })}
                  </div>

                  <div className="table-wrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th className="table__th">Дата</th>
                          <th className="table__th table__num">Платежей</th>
                          <th className="table__th table__num">Сумма</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.map((row, i) => (
                          <tr key={i} className="table__row">
                            <td className="table__td">{new Date(row.day).toLocaleDateString('ru-RU')}</td>
                            <td className="table__td table__num">{row.payments_count}</td>
                            <td className="table__td table__num">
                              <Money value={row.total_amount} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr style={{ background: 'var(--c-bg-soft)', fontWeight: 600 }}>
                          <td className="table__td">Итого</td>
                          <td className="table__td table__num">
                            {data.reduce((s, r) => s + Number(r.payments_count), 0)}
                          </td>
                          <td className="table__td table__num">
                            <Money value={data.reduce((s, r) => s + Number(r.total_amount), 0)} />
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </>
              )}
            </>
          )}

          {/* По филиалам */}
          {activeTab === 'by-branch' && (
            data.length === 0 ? (
              <p style={{ color: 'var(--c-muted)' }}>Нет данных за выбранный период</p>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th className="table__th">Филиал</th>
                      <th className="table__th table__num">Платежей</th>
                      <th className="table__th table__num">Сумма</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.map((row) => (
                      <tr key={row.branch_id} className="table__row">
                        <td className="table__td">{row.branch_name}</td>
                        <td className="table__td table__num">{row.payments_count}</td>
                        <td className="table__td table__num">
                          <Money value={row.total_amount} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}

          {/* По арендодателям */}
          {activeTab === 'by-owner' && (
            data.length === 0 ? (
              <p style={{ color: 'var(--c-muted)' }}>Нет данных за выбранный период</p>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th className="table__th">Арендодатель</th>
                      <th className="table__th">Телефон</th>
                      <th className="table__th table__num">Авто</th>
                      <th className="table__th table__num">Платежей</th>
                      <th className="table__th table__num">Сумма</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.map((row) => (
                      <tr key={row.owner_id} className="table__row">
                        <td className="table__td">{row.owner_name}</td>
                        <td className="table__td">{row.phone}</td>
                        <td className="table__td table__num">{row.cars_count}</td>
                        <td className="table__td table__num">{row.payments_count}</td>
                        <td className="table__td table__num">
                          <Money value={row.total_amount} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}

          {/* Топ автомобилей */}
          {activeTab === 'top-cars' && (
            data.length === 0 ? (
              <p style={{ color: 'var(--c-muted)' }}>Нет данных за выбранный период</p>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th className="table__th">#</th>
                      <th className="table__th">Автомобиль</th>
                      <th className="table__th">Арендодатель</th>
                      <th className="table__th table__num">Платежей</th>
                      <th className="table__th table__num">Сумма</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.map((row, i) => (
                      <tr key={row.car_id} className="table__row">
                        <td className="table__td" style={{ fontWeight: 600, color: 'var(--c-muted)' }}>{i + 1}</td>
                        <td className="table__td">
                          <Plate value={row.plate} />
                          <div style={{ fontSize: 'var(--fs-s)', color: 'var(--c-muted)', marginTop: 'var(--sp-1)' }}>
                            {row.brand} {row.model}
                          </div>
                        </td>
                        <td className="table__td">{row.owner_name}</td>
                        <td className="table__td table__num">{row.payments_count}</td>
                        <td className="table__td table__num">
                          <Money value={row.total_amount} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}

          {/* Топ водителей */}
          {activeTab === 'top-drivers' && (
            data.length === 0 ? (
              <p style={{ color: 'var(--c-muted)' }}>Нет данных за выбранный период</p>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th className="table__th">#</th>
                      <th className="table__th">Водитель</th>
                      <th className="table__th">Телефон</th>
                      <th className="table__th table__num">Платежей</th>
                      <th className="table__th table__num">Сумма</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.map((row, i) => (
                      <tr key={row.driver_id} className="table__row">
                        <td className="table__td" style={{ fontWeight: 600, color: 'var(--c-muted)' }}>{i + 1}</td>
                        <td className="table__td">{row.full_name}</td>
                        <td className="table__td">{row.phone}</td>
                        <td className="table__td table__num">{row.payments_count}</td>
                        <td className="table__td table__num">
                          <Money value={row.total_amount} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
        </>
      )}
    </div>
  );
}