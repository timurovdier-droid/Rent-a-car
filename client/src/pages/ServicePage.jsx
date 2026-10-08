import { useState, useEffect, useCallback } from 'react';
import { api, ApiError } from '../api';
import { useAuth } from '../auth';
import Plate from '../components/Plate';
import Money from '../components/Money';
import StatusMark from '../components/StatusMark';

export default function ServicePage() {
  const { user } = useAuth();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Фильтры
  const [filterCarId, setFilterCarId] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  // Диалог создания
  const [showCreate, setShowCreate] = useState(false);
  const [formData, setFormData] = useState({
    car_id: '',
    type: 'OIL_CHANGE',
    description: '',
    cost: '',
    scheduled_at: new Date().toISOString().slice(0, 10),
  });
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);

  // Диалог завершения
  const [completingRecord, setCompletingRecord] = useState(null);
  const [completeCost, setCompleteCost] = useState('');
  const [completeDesc, setCompleteDesc] = useState('');
  const [completeError, setCompleteError] = useState('');
  const [completing, setCompleting] = useState(false);

  const fetchRecords = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filterCarId) params.append('car_id', filterCarId);
      if (filterStatus) params.append('status', filterStatus);
      const qs = params.toString();
      const data = await api.get(`/service${qs ? '?' + qs : ''}`);
      setRecords(data);
    } catch (err) {
      setError('Не удалось загрузить записи обслуживания');
    } finally {
      setLoading(false);
    }
  }, [filterCarId, filterStatus]);

  useEffect(() => {
    if (user) fetchRecords();
  }, [fetchRecords, user]);

  function openCreateDialog() {
    setCreateError('');
    setFormData({
      car_id: '',
      type: 'OIL_CHANGE',
      description: '',
      cost: '',
      scheduled_at: new Date().toISOString().slice(0, 10),
    });
    setShowCreate(true);
  }

  async function handleCreate(e) {
    e.preventDefault();
    setCreateError('');
    setCreating(true);
    try {
      await api.post('/service', {
        car_id: Number(formData.car_id),
        type: formData.type,
        description: formData.description || undefined,
        cost: Number(formData.cost) || 0,
        scheduled_at: formData.scheduled_at || undefined,
      });
      setShowCreate(false);
      fetchRecords();
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : 'Ошибка создания');
    } finally {
      setCreating(false);
    }
  }

  function openCompleteDialog(record) {
    setCompletingRecord(record);
    setCompleteCost(String(record.cost || 0));
    setCompleteDesc(record.description || '');
    setCompleteError('');
  }

  async function handleComplete(e) {
    e.preventDefault();
    setCompleteError('');
    setCompleting(true);
    try {
      await api.post(`/service/${completingRecord.id}/complete`, {
        cost: Number(completeCost) || 0,
        description: completeDesc || undefined,
      });
      setCompletingRecord(null);
      fetchRecords();
    } catch (err) {
      setCompleteError(err instanceof ApiError ? err.message : 'Ошибка завершения');
    } finally {
      setCompleting(false);
    }
  }

  function formatType(type) {
    const map = {
      'OIL_CHANGE': 'Замена масла',
      'REPAIR': 'Ремонт',
      'INSURANCE': 'Страховка',
      'INSPECTION': 'Техосмотр',
      'TIRE': 'Шины',
      'OTHER': 'Другое',
    };
    return map[type] || type;
  }

  if (loading) return <div>Загрузка...</div>;
  if (error) return <div className="field__error">{error}</div>;

  return (
    <div>
      <h1 className="page-title">Обслуживание</h1>
      <p className="page-sub">Управление техническим обслуживанием автомобилей</p>

      {/* Панель действий и фильтров */}
      <div style={{ display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap', marginBottom: 'var(--sp-4)', alignItems: 'flex-end' }}>
        <button className="btn" onClick={openCreateDialog}>
          Запланировать ТО
        </button>

        <div className="field" style={{ margin: 0, minWidth: '10rem' }}>
          <label className="field__label" htmlFor="filterCar">ID автомобиля</label>
          <input
            id="filterCar"
            className="field__input"
            type="number"
            value={filterCarId}
            onChange={(e) => setFilterCarId(e.target.value)}
            placeholder="Все"
          />
        </div>

        <div className="field" style={{ margin: 0, minWidth: '10rem' }}>
          <label className="field__label" htmlFor="filterStatus">Статус</label>
          <select
            id="filterStatus"
            className="field__input"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="">Все</option>
            <option value="SCHEDULED">Запланировано</option>
            <option value="COMPLETED">Завершено</option>
          </select>
        </div>

        <button
          className="btn btn--quiet"
          onClick={() => { setFilterCarId(''); setFilterStatus(''); }}
        >
          Сбросить фильтры
        </button>
      </div>

      {records.length === 0 ? (
        <p style={{ color: 'var(--c-muted)' }}>Записей обслуживания нет</p>
      ) : (
        <>
          {/* Десктоп: таблица */}
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th className="table__th">Автомобиль</th>
                  <th className="table__th">Тип</th>
                  <th className="table__th table__num">Стоимость</th>
                  <th className="table__th">Статус</th>
                  <th className="table__th">Дата</th>
                  <th className="table__th">Действия</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r) => (
                  <tr key={r.id} className="table__row">
                    <td className="table__td">
                      <Plate value={r.plate} />
                      <div style={{ fontSize: 'var(--fs-s)', color: 'var(--c-muted)', marginTop: 'var(--sp-1)' }}>
                        {r.brand} {r.model}
                      </div>
                    </td>
                    <td className="table__td">{formatType(r.type)}</td>
                    <td className="table__td table__num">
                      <Money value={r.cost} />
                    </td>
                    <td className="table__td">
                      <StatusMark status={r.status} />
                    </td>
                    <td className="table__td" style={{ fontSize: 'var(--fs-s)', whiteSpace: 'nowrap' }}>
                      {r.scheduled_at 
                        ? new Date(r.scheduled_at).toLocaleDateString('ru-RU')
                        : new Date(r.created_at).toLocaleDateString('ru-RU')
                      }
                    </td>
                    <td className="table__td">
                      {r.status === 'SCHEDULED' && (
                        <button
                          className="btn"
                          style={{ fontSize: 'var(--fs-s)', minHeight: '32px' }}
                          onClick={() => openCompleteDialog(r)}
                        >
                          Завершить
                        </button>
                      )}
                      {r.status === 'COMPLETED' && (
                        <span style={{ color: 'var(--c-muted)', fontSize: 'var(--fs-s)' }}>
                          {r.completed_at && new Date(r.completed_at).toLocaleDateString('ru-RU')}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Мобильный: список */}
          <ul className="queue">
            {records.map((r) => (
              <li key={r.id} className="queue__row">
                <div>
                  <Plate value={r.plate} />
                  <div style={{ marginTop: 'var(--sp-1)', fontWeight: 500 }}>
                    {formatType(r.type)}
                  </div>
                  <div style={{ fontSize: 'var(--fs-s)', color: 'var(--c-muted)' }}>
                    {r.branch_name}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <Money value={r.cost} />
                  <div style={{ marginTop: 'var(--sp-1)' }}>
                    <StatusMark status={r.status} />
                  </div>
                  {r.status === 'SCHEDULED' && (
                    <button
                      className="btn"
                      style={{ fontSize: 'var(--fs-s)', minHeight: '32px', marginTop: 'var(--sp-2)' }}
                      onClick={() => openCompleteDialog(r)}
                    >
                      Завершить
                    </button>
                  )}
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
        <h2 style={{ marginTop: 0 }} className="page-title">Запланировать ТО</h2>
        <p className="page-sub">Укажите автомобиль и тип обслуживания</p>

        <form onSubmit={handleCreate}>
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
          </div>

          <div className="field">
            <label className="field__label" htmlFor="type">Тип обслуживания</label>
            <select
              id="type"
              className="field__input"
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value })}
              required
            >
              <option value="OIL_CHANGE">Замена масла</option>
              <option value="REPAIR">Ремонт</option>
              <option value="INSURANCE">Страховка</option>
              <option value="INSPECTION">Техосмотр</option>
              <option value="TIRE">Шины</option>
              <option value="OTHER">Другое</option>
            </select>
          </div>

          <div className="field">
            <label className="field__label" htmlFor="cost">Стоимость, сум</label>
            <input
              id="cost"
              className="field__input"
              type="number"
              inputMode="numeric"
              value={formData.cost}
              onChange={(e) => setFormData({ ...formData, cost: e.target.value })}
              min="0"
              placeholder="0"
            />
          </div>

          <div className="field">
            <label className="field__label" htmlFor="date">Планируемая дата</label>
            <input
              id="date"
              className="field__input"
              type="date"
              value={formData.scheduled_at}
              onChange={(e) => setFormData({ ...formData, scheduled_at: e.target.value })}
            />
          </div>

          <div className="field">
            <label className="field__label" htmlFor="desc">Описание (необязательно)</label>
            <textarea
              id="desc"
              className="field__input"
              rows="2"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Детали обслуживания"
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
              {creating ? 'Создание...' : 'Запланировать'}
            </button>
          </div>
        </form>
      </dialog>

      {/* Диалог завершения */}
      <dialog
        className="dialog"
        open={!!completingRecord}
        onCancel={() => setCompletingRecord(null)}
        onClick={(e) => { if (e.target === e.currentTarget) setCompletingRecord(null); }}
      >
        <h2 style={{ marginTop: 0 }} className="page-title">Завершение ТО</h2>
        {completingRecord && (
          <>
            <p className="page-sub">
              Автомобиль: <Plate value={completingRecord.plate} />
              <br />
              Тип: {formatType(completingRecord.type)}
              <br />
              Запланированная стоимость: <Money value={completingRecord.cost} />
            </p>

            <form onSubmit={handleComplete}>
              <div className="field">
                <label className="field__label" htmlFor="completeCost">Фактическая стоимость, сум</label>
                <input
                  id="completeCost"
                  className="field__input"
                  type="number"
                  inputMode="numeric"
                  value={completeCost}
                  onChange={(e) => setCompleteCost(e.target.value)}
                  min="0"
                />
              </div>

              <div className="field">
                <label className="field__label" htmlFor="completeDesc">Комментарий (необязательно)</label>
                <textarea
                  id="completeDesc"
                  className="field__input"
                  rows="2"
                  value={completeDesc}
                  onChange={(e) => setCompleteDesc(e.target.value)}
                  placeholder="Что было сделано"
                />
              </div>

              {completeError && <p className="field__error">{completeError}</p>}

              <div style={{ display: 'flex', gap: 'var(--sp-2)', marginTop: 'var(--sp-3)' }}>
                <button
                  className="btn btn--quiet"
                  type="button"
                  onClick={() => setCompletingRecord(null)}
                >
                  Отмена
                </button>
                <button className="btn" type="submit" disabled={completing}>
                  {completing ? 'Завершение...' : 'Завершить'}
                </button>
              </div>
            </form>
          </>
        )}
      </dialog>
    </div>
  );
}