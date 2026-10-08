import { useState, useEffect, useCallback } from 'react';
import { api, ApiError } from '../api';
import { useAuth } from '../auth';
import Plate from '../components/Plate';
import Money from '../components/Money';

export default function DailyReportsPage() {
  const { user } = useAuth();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Фильтры для диспетчера/админа
  const [filterDate, setFilterDate] = useState('');
  const [filterDriverId, setFilterDriverId] = useState('');

  // Диалог создания
  const [showCreate, setShowCreate] = useState(false);
  const [formData, setFormData] = useState({
    car_id: '',
    driver_id: '',
    report_date: new Date().toISOString().slice(0, 10),
    mileage_start: '',
    mileage_end: '',
    cash_on_hand: '',
    comment: '',
  });
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);

  // Список водителей для выбора (для диспетчера/админа)
  const [driversList, setDriversList] = useState([]);

  const fetchReports = useCallback(async () => {
    try {
      setLoading(true);
      let data;
      if (user?.role === 'DRIVER') {
        data = await api.get('/daily-reports/my');
      } else {
        const params = new URLSearchParams();
        if (filterDate) params.append('date', filterDate);
        if (filterDriverId) params.append('driver_id', filterDriverId);
        const qs = params.toString();
        data = await api.get(`/daily-reports${qs ? '?' + qs : ''}`);
      }
      setReports(data);
    } catch (err) {
      setError('Не удалось загрузить отчёты');
    } finally {
      setLoading(false);
    }
  }, [user?.role, filterDate, filterDriverId]);

  useEffect(() => {
    if (user) fetchReports();
  }, [fetchReports, user]);

  // Загружаем список водителей для фильтра и формы (для диспетчера/админа)
  useEffect(() => {
    if (user?.role !== 'DRIVER') {
      api.get('/drivers').then(setDriversList).catch(() => setDriversList([]));
    }
  }, [user?.role]);

  function openCreateDialog() {
    setCreateError('');
    setFormData({
      car_id: '',
      driver_id: '',
      report_date: new Date().toISOString().slice(0, 10),
      mileage_start: '',
      mileage_end: '',
      cash_on_hand: '',
      comment: '',
    });
    setShowCreate(true);
  }

  async function handleCreate(e) {
    e.preventDefault();
    setCreateError('');
    setCreating(true);
    try {
      const body = {
        report_date: formData.report_date,
        mileage_start: Number(formData.mileage_start) || 0,
        mileage_end: Number(formData.mileage_end) || 0,
        cash_on_hand: Number(formData.cash_on_hand) || 0,
        comment: formData.comment || undefined,
      };
      if (user?.role === 'DRIVER') {
        body.car_id = Number(formData.car_id);
      } else {
        body.car_id = Number(formData.car_id);
        body.driver_id = Number(formData.driver_id);
      }

      await api.post('/daily-reports', body);
      setShowCreate(false);
      fetchReports();
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : 'Ошибка создания');
    } finally {
      setCreating(false);
    }
  }

  if (loading) return <div>Загрузка...</div>;
  if (error) return <div className="field__error">{error}</div>;

  return (
    <div>
      <h1 className="page-title">Дневные отчёты</h1>
      <p className="page-sub">
        {user?.role === 'DRIVER'
          ? 'Ваши отчёты за смену'
          : 'Отчёты водителей филиала'}
      </p>

      {/* Панель действий и фильтров */}
      <div style={{ display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap', marginBottom: 'var(--sp-4)', alignItems: 'flex-end' }}>
        <button className="btn" onClick={openCreateDialog}>
          Создать отчёт
        </button>

        {user?.role !== 'DRIVER' && (
          <>
            <div className="field" style={{ margin: 0, minWidth: '10rem' }}>
              <label className="field__label" htmlFor="filterDate">Дата</label>
              <input
                id="filterDate"
                className="field__input"
                type="date"
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
              />
            </div>
            <div className="field" style={{ margin: 0, minWidth: '12rem' }}>
              <label className="field__label" htmlFor="filterDriver">Водитель</label>
              <select
                id="filterDriver"
                className="field__input"
                value={filterDriverId}
                onChange={(e) => setFilterDriverId(e.target.value)}
              >
                <option value="">Все</option>
                {driversList.map((d) => (
                  <option key={d.id} value={d.id}>{d.full_name}</option>
                ))}
              </select>
            </div>
            <button
              className="btn btn--quiet"
              onClick={() => { setFilterDate(''); setFilterDriverId(''); }}
            >
              Сбросить фильтры
            </button>
          </>
        )}
      </div>

      {reports.length === 0 ? (
        <p style={{ color: 'var(--c-muted)' }}>Отчётов пока нет</p>
      ) : (
        <>
          {/* Десктоп: таблица */}
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th className="table__th">Дата</th>
                  <th className="table__th">Автомобиль</th>
                  {user?.role !== 'DRIVER' && <th className="table__th">Водитель</th>}
                  <th className="table__th table__num">Пробег (начало → конец)</th>
                  <th className="table__th table__num">В кассе</th>
                  <th className="table__th">Комментарий</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((r) => (
                  <tr key={r.id} className="table__row">
                    <td className="table__td" style={{ whiteSpace: 'nowrap' }}>
                      {new Date(r.report_date).toLocaleDateString('ru-RU')}
                    </td>
                    <td className="table__td">
                      <Plate value={r.plate} />
                      <div style={{ fontSize: 'var(--fs-s)', color: 'var(--c-muted)', marginTop: 'var(--sp-1)' }}>
                        {r.brand} {r.model}
                      </div>
                    </td>
                    {user?.role !== 'DRIVER' && (
                      <td className="table__td">{r.driver_name}</td>
                    )}
                    <td className="table__td table__num">
                      {r.mileage_start} → {r.mileage_end}
                      <div style={{ fontSize: 'var(--fs-s)', color: 'var(--c-muted)' }}>
                        +{r.mileage_end - r.mileage_start} км
                      </div>
                    </td>
                    <td className="table__td table__num">
                      <Money value={r.cash_on_hand} />
                    </td>
                    <td className="table__td" style={{ fontSize: 'var(--fs-s)', maxWidth: '16rem' }}>
                      {r.comment || <span style={{ color: 'var(--c-muted)' }}>—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Мобильный: список */}
          <ul className="queue">
            {reports.map((r) => (
              <li key={r.id} className="queue__row">
                <div>
                  <Plate value={r.plate} />
                  <div style={{ marginTop: 'var(--sp-1)', fontSize: 'var(--fs-s)', color: 'var(--c-muted)' }}>
                    {new Date(r.report_date).toLocaleDateString('ru-RU')}
                    {user?.role !== 'DRIVER' && ` · ${r.driver_name}`}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <Money value={r.cash_on_hand} />
                  <div style={{ fontSize: 'var(--fs-s)', color: 'var(--c-muted)', marginTop: 'var(--sp-1)' }}>
                    +{r.mileage_end - r.mileage_start} км
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* Диалог создания */}
      <dialog
        className="dialog"
        open={showCreate}
        onCancel={() => setShowCreate(false)}
        onClick={(e) => { if (e.target === e.currentTarget) setShowCreate(false); }}
      >
        <h2 style={{ marginTop: 0 }} className="page-title">Новый отчёт</h2>
        <p className="page-sub">
          {user?.role === 'DRIVER'
            ? 'Укажите данные по завершённой смене'
            : 'Заполните отчёт за водителя'}
        </p>

        <form onSubmit={handleCreate}>
          {user?.role !== 'DRIVER' && (
            <div className="field">
              <label className="field__label" htmlFor="driver">Водитель</label>
              <select
                id="driver"
                className="field__input"
                value={formData.driver_id}
                onChange={(e) => setFormData({ ...formData, driver_id: e.target.value })}
                required
              >
                <option value="">— выберите —</option>
                {driversList.map((d) => (
                  <option key={d.id} value={d.id}>{d.full_name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="field">
            <label className="field__label" htmlFor="car">ID автомобиля</label>
            <input
              id="car"
              className="field__input"
              type="number"
              value={formData.car_id}
              onChange={(e) => setFormData({ ...formData, car_id: e.target.value })}
              required
              min="1"
              placeholder="Например, 1"
            />
            {user?.role === 'DRIVER' && (
              <div style={{ fontSize: 'var(--fs-s)', color: 'var(--c-muted)', marginTop: 'var(--sp-1)' }}>
                ID автомобиля можно посмотреть на главной странице в разделе «Активные назначения»
              </div>
            )}
          </div>

          <div className="field">
            <label className="field__label" htmlFor="date">Дата отчёта</label>
            <input
              id="date"
              className="field__input"
              type="date"
              value={formData.report_date}
              onChange={(e) => setFormData({ ...formData, report_date: e.target.value })}
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-2)' }}>
            <div className="field">
              <label className="field__label" htmlFor="ms">Пробег начало, км</label>
              <input
                id="ms"
                className="field__input"
                type="number"
                inputMode="numeric"
                value={formData.mileage_start}
                onChange={(e) => setFormData({ ...formData, mileage_start: e.target.value })}
                required
                min="0"
              />
            </div>
            <div className="field">
              <label className="field__label" htmlFor="me">Пробег конец, км</label>
              <input
                id="me"
                className="field__input"
                type="number"
                inputMode="numeric"
                value={formData.mileage_end}
                onChange={(e) => setFormData({ ...formData, mileage_end: e.target.value })}
                required
                min={formData.mileage_start || 0}
              />
            </div>
          </div>

          <div className="field">
            <label className="field__label" htmlFor="cash">Сумма в кассе, сум</label>
            <input
              id="cash"
              className="field__input"
              type="number"
              inputMode="numeric"
              value={formData.cash_on_hand}
              onChange={(e) => setFormData({ ...formData, cash_on_hand: e.target.value })}
              min="0"
              placeholder="0"
            />
          </div>

          <div className="field">
            <label className="field__label" htmlFor="comment">Комментарий</label>
            <textarea
              id="comment"
              className="field__input"
              rows="2"
              value={formData.comment}
              onChange={(e) => setFormData({ ...formData, comment: e.target.value })}
              placeholder="Замечания по смене"
            />
          </div>

          {createError && <p className="field__error">{createError}</p>}

          <div style={{ display: 'flex', gap: 'var(--sp-2)', marginTop: 'var(--sp-3)' }}>
            <button
              className="btn btn--quiet"
              type="button"
              onClick={() => setShowCreate(false)}
            >
              Отмена
            </button>
            <button className="btn" type="submit" disabled={creating}>
              {creating ? 'Создание...' : 'Создать отчёт'}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}