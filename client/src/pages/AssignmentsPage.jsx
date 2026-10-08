import { useState, useEffect, useCallback, useRef } from 'react';
import { api, ApiError } from '../api';
import { useAuth } from '../auth';
import Plate from '../components/Plate';
import Money from '../components/Money';

export default function AssignmentsPage() {
  const { user } = useAuth();
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Диалог создания
  const [showCreate, setShowCreate] = useState(false);
  const [available, setAvailable] = useState({ cars: [], drivers: [] });
  const [selectedCar, setSelectedCar] = useState('');
  const [selectedDriver, setSelectedDriver] = useState('');
  const [mileageStart, setMileageStart] = useState('');
  const [note, setNote] = useState('');
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);

  // Диалог завершения
  const [endingAssignment, setEndingAssignment] = useState(null);
  const [mileageEnd, setMileageEnd] = useState('');
  const [endNote, setEndNote] = useState('');
  const [endError, setEndError] = useState('');
  const [ending, setEnding] = useState(false);

  const fetchAssignments = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.get('/assignments');
      setAssignments(data);
    } catch (err) {
      setError('Не удалось загрузить назначения');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAssignments();
  }, [fetchAssignments]);

  async function openCreateDialog() {
    setCreateError('');
    setSelectedCar('');
    setSelectedDriver('');
    setMileageStart('');
    setNote('');
    try {
      const data = await api.get('/assignments/available');
      setAvailable(data);
      setShowCreate(true);
    } catch (err) {
      setError('Не удалось загрузить список доступных автомобилей и водителей');
    }
  }

  async function handleCreate(e) {
    e.preventDefault();
    setCreateError('');
    setCreating(true);
    try {
      await api.post('/assignments', {
        car_id: Number(selectedCar),
        driver_id: Number(selectedDriver),
        mileage_start: Number(mileageStart) || 0,
        note: note || undefined,
      });
      setShowCreate(false);
      fetchAssignments();
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : 'Ошибка создания');
    } finally {
      setCreating(false);
    }
  }

  function openEndDialog(assignment) {
    setEndingAssignment(assignment);
    setMileageEnd(String(assignment.mileage_start || 0));
    setEndNote('');
    setEndError('');
  }

  async function handleEnd(e) {
    e.preventDefault();
    setEndError('');
    setEnding(true);
    try {
      await api.post(`/assignments/${endingAssignment.id}/end`, {
        mileage_end: Number(mileageEnd),
        note: endNote || undefined,
      });
      setEndingAssignment(null);
      fetchAssignments();
    } catch (err) {
      setEndError(err instanceof ApiError ? err.message : 'Ошибка завершения');
    } finally {
      setEnding(false);
    }
  }

  if (loading) return <div>Загрузка...</div>;
  if (error) return <div className="field__error">{error}</div>;

  return (
    <div>
      <h1 className="page-title">Назначения</h1>
      <p className="page-sub">
        {assignments.length > 0
          ? `${assignments.length} активных назначений`
          : 'Активных назначений нет'}
      </p>

      <div style={{ marginBottom: 'var(--sp-4)' }}>
        <button className="btn" onClick={openCreateDialog}>
          Назначить водителя
        </button>
      </div>

      {assignments.length === 0 ? (
        <p style={{ color: 'var(--c-muted)' }}>
          Нет активных назначений. Нажмите «Назначить водителя», чтобы создать первое.
        </p>
      ) : (
        <>
          {/* Десктоп: таблица */}
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th className="table__th">Автомобиль</th>
                  <th className="table__th">Водитель</th>
                  <th className="table__th">Филиал</th>
                  <th className="table__th table__num">Пробег (начало)</th>
                  <th className="table__th">Начало</th>
                  <th className="table__th">Действия</th>
                </tr>
              </thead>
              <tbody>
                {assignments.map((a) => (
                  <tr key={a.id} className="table__row">
                    <td className="table__td">
                      <Plate value={a.plate} />
                      <div style={{ fontSize: 'var(--fs-s)', color: 'var(--c-muted)', marginTop: 'var(--sp-1)' }}>
                        {a.brand} {a.model}
                      </div>
                    </td>
                    <td className="table__td">
                      <div>{a.driver_name}</div>
                      <div style={{ fontSize: 'var(--fs-s)', color: 'var(--c-muted)' }}>
                        {a.driver_phone}
                      </div>
                    </td>
                    <td className="table__td">{a.branch_name}</td>
                    <td className="table__td table__num">{a.mileage_start}</td>
                    <td className="table__td" style={{ fontSize: 'var(--fs-s)', whiteSpace: 'nowrap' }}>
                      {new Date(a.start_at).toLocaleString('ru-RU')}
                    </td>
                    <td className="table__td">
                      <button
                        className="btn btn--quiet"
                        style={{ fontSize: 'var(--fs-s)', minHeight: '32px' }}
                        onClick={() => openEndDialog(a)}
                      >
                        Завершить
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Мобильный: список */}
          <ul className="queue">
            {assignments.map((a) => (
              <li key={a.id} className="queue__row">
                <div>
                  <Plate value={a.plate} />
                  <div style={{ marginTop: 'var(--sp-1)', fontWeight: 500 }}>{a.driver_name}</div>
                  <div style={{ fontSize: 'var(--fs-s)', color: 'var(--c-muted)' }}>
                    {a.branch_name} · пробег: {a.mileage_start}
                  </div>
                </div>
                <button
                  className="btn btn--quiet"
                  style={{ fontSize: 'var(--fs-s)', minHeight: '32px' }}
                  onClick={() => openEndDialog(a)}
                >
                  Завершить
                </button>
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
        <h2 style={{ marginTop: 0 }} className="page-title">Новое назначение</h2>
        <p className="page-sub">Выберите свободный автомобиль и водителя из одного филиала</p>

        <form onSubmit={handleCreate}>
          <div className="field">
            <label className="field__label" htmlFor="car">Автомобиль</label>
            <select
              id="car"
              className="field__input"
              value={selectedCar}
              onChange={(e) => setSelectedCar(e.target.value)}
              required
            >
              <option value="">— выберите —</option>
              {available.cars.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.plate} — {c.brand} {c.model}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label className="field__label" htmlFor="driver">Водитель</label>
            <select
              id="driver"
              className="field__input"
              value={selectedDriver}
              onChange={(e) => setSelectedDriver(e.target.value)}
              required
            >
              <option value="">— выберите —</option>
              {available.drivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.full_name} — {d.phone}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label className="field__label" htmlFor="mileage">Начальный пробег, км</label>
            <input
              id="mileage"
              className="field__input"
              type="number"
              inputMode="numeric"
              value={mileageStart}
              onChange={(e) => setMileageStart(e.target.value)}
              min="0"
              placeholder="0"
            />
          </div>

          <div className="field">
            <label className="field__label" htmlFor="note">Примечание (необязательно)</label>
            <input
              id="note"
              className="field__input"
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Например: передача ключей в 18:00"
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
              {creating ? 'Создание...' : 'Назначить'}
            </button>
          </div>
        </form>
      </dialog>

      {/* Диалог завершения */}
      <dialog
        className="dialog"
        open={!!endingAssignment}
        onCancel={() => setEndingAssignment(null)}
        onClick={(e) => { if (e.target === e.currentTarget) setEndingAssignment(null); }}
      >
        <h2 style={{ marginTop: 0 }} className="page-title">Завершение назначения</h2>
        {endingAssignment && (
          <>
            <p className="page-sub">
              Автомобиль: <Plate value={endingAssignment.plate} />
              <br />
              Водитель: {endingAssignment.driver_name}
              <br />
              Начальный пробег: {endingAssignment.mileage_start} км
            </p>

            <form onSubmit={handleEnd}>
              <div className="field">
                <label className="field__label" htmlFor="mileageEnd">Конечный пробег, км</label>
                <input
                  id="mileageEnd"
                  className="field__input"
                  type="number"
                  inputMode="numeric"
                  value={mileageEnd}
                  onChange={(e) => setMileageEnd(e.target.value)}
                  required
                  min={endingAssignment.mileage_start}
                />
              </div>

              <div className="field">
                <label className="field__label" htmlFor="endNote">Примечание (необязательно)</label>
                <textarea
                  id="endNote"
                  className="field__input"
                  rows="2"
                  value={endNote}
                  onChange={(e) => setEndNote(e.target.value)}
                  placeholder="Состояние авто, замечания"
                />
              </div>

              {endError && <p className="field__error">{endError}</p>}

              <div style={{ display: 'flex', gap: 'var(--sp-2)', marginTop: 'var(--sp-3)' }}>
                <button
                  className="btn btn--quiet"
                  type="button"
                  onClick={() => setEndingAssignment(null)}
                >
                  Отмена
                </button>
                <button className="btn" type="submit" disabled={ending}>
                  {ending ? 'Завершение...' : 'Завершить'}
                </button>
              </div>
            </form>
          </>
        )}
      </dialog>
    </div>
  );
}