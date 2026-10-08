import { useState, useEffect, useCallback } from 'react';
import { api, ApiError } from '../api';
import { useAuth } from '../auth';
import Plate from '../components/Plate';
import StatusMark from '../components/StatusMark';

export default function CarsPage() {
  const { user } = useAuth();
  const [cars, setCars] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [owners, setOwners] = useState([]);
  const [branches, setBranches] = useState([]);

  const [showDialog, setShowDialog] = useState(false);
  const [editingCar, setEditingCar] = useState(null);
  const [formData, setFormData] = useState({
    plate: '',
    brand: '',
    model: '',
    year: '',
    owner_id: '',
    branch_id: '',
  });
  const [dialogError, setDialogError] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchCars = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.get('/cars');
      setCars(data);
    } catch (err) {
      setError('Не удалось загрузить автомобили');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) fetchCars();
  }, [fetchCars, user]);

  useEffect(() => {
    if (user?.role === 'ADMIN' || user?.role === 'DISPATCHER') {
      api.get('/owners').then(setOwners).catch(() => setOwners([]));
      api.get('/branches/active').then(setBranches).catch(() => setBranches([]));
    }
  }, [user?.role]);

  function openCreateDialog() {
    setEditingCar(null);
    setFormData({
      plate: '',
      brand: '',
      model: '',
      year: new Date().getFullYear().toString(),
      owner_id: '',
      branch_id: user?.branch_id ? String(user.branch_id) : '',
    });
    setDialogError('');
    setShowDialog(true);
  }

  function openEditDialog(car) {
    setEditingCar(car);
    setFormData({
      plate: car.plate,
      brand: car.brand,
      model: car.model,
      year: car.year ? String(car.year) : '',
      owner_id: car.owner_id ? String(car.owner_id) : '',
      branch_id: car.branch_id ? String(car.branch_id) : '',
    });
    setDialogError('');
    setShowDialog(true);
  }

  async function handleSave(e) {
    e.preventDefault();
    setDialogError('');
    setSaving(true);
    try {
      const body = {
        plate: formData.plate.toUpperCase(),
        brand: formData.brand,
        model: formData.model,
        year: formData.year ? Number(formData.year) : undefined,
        owner_id: formData.owner_id ? Number(formData.owner_id) : undefined,
        branch_id: formData.branch_id ? Number(formData.branch_id) : undefined,
      };

      if (editingCar) {
        await api.patch(`/cars/${editingCar.id}`, body);
      } else {
        await api.post('/cars', body);
      }
      setShowDialog(false);
      fetchCars();
    } catch (err) {
      setDialogError(err instanceof ApiError ? err.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  }

  async function handleArchive(car) {
    if (!window.confirm(`Архивировать автомобиль ${car.plate}?`)) return;

    try {
      await api.post(`/cars/${car.id}/archive`);
      fetchCars();
    } catch (err) {
      alert('Ошибка при архивации: ' + (err.message || 'Неизвестная ошибка'));
    }
  }

  if (loading) return <div>Загрузка...</div>;
  if (error) return <div className="field__error">{error}</div>;

  return (
    <div>
      <h1 className="page-title">Автомобили</h1>
      <p className="page-sub">
        {cars.length > 0 ? `${cars.length} автомобилей` : 'Автомобилей пока нет'}
      </p>

      {(user?.role === 'ADMIN' || user?.role === 'DISPATCHER') && (
        <div style={{ marginBottom: 'var(--sp-4)' }}>
          <button className="btn" onClick={openCreateDialog}>
            Добавить автомобиль
          </button>
        </div>
      )}

      {cars.length === 0 ? (
        <p style={{ color: 'var(--c-muted)' }}>
          {user?.role === 'OWNER'
            ? 'У вас пока нет автомобилей'
            : 'Автомобилей нет. Добавьте первый.'}
        </p>
      ) : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th className="table__th">Номер</th>
                  <th className="table__th">Марка / Модель</th>
                  <th className="table__th">Год</th>
                  <th className="table__th">Статус</th>
                  {(user?.role === 'ADMIN' || user?.role === 'DISPATCHER') && (
                    <th className="table__th">Действия</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {cars.map((c) => (
                  <tr key={c.id} className="table__row">
                    <td className="table__td">
                      <Plate value={c.plate} />
                    </td>
                    <td className="table__td">
                      {c.brand} {c.model}
                    </td>
                    <td className="table__td">{c.year || '—'}</td>
                    <td className="table__td">
                      <StatusMark status={c.status} />
                    </td>
                    {(user?.role === 'ADMIN' || user?.role === 'DISPATCHER') && (
                      <td className="table__td">
                        <div style={{ display: 'flex', gap: 'var(--sp-1)' }}>
                          <button
                            className="btn btn--quiet"
                            style={{ fontSize: 'var(--fs-s)', minHeight: '32px' }}
                            onClick={() => openEditDialog(c)}
                          >
                            Изменить
                          </button>
                          {c.status === 'FREE' && (
                            <button
                              className="btn btn--danger"
                              style={{ fontSize: 'var(--fs-s)', minHeight: '32px' }}
                              onClick={() => handleArchive(c)}
                            >
                              Архивировать
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="queue">
            {cars.map((c) => (
              <li key={c.id} className="queue__row">
                <div>
                  <Plate value={c.plate} />
                  <div style={{ marginTop: 'var(--sp-1)', fontWeight: 500 }}>
                    {c.brand} {c.model}
                  </div>
                  <div style={{ fontSize: 'var(--fs-s)', color: 'var(--c-muted)' }}>
                    {c.year && `${c.year} · `}
                    <StatusMark status={c.status} />
                  </div>
                </div>
                {(user?.role === 'ADMIN' || user?.role === 'DISPATCHER') && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-1)' }}>
                    <button
                      className="btn btn--quiet"
                      style={{ fontSize: 'var(--fs-s)', minHeight: '32px' }}
                      onClick={() => openEditDialog(c)}
                    >
                      Изменить
                    </button>
                    {c.status === 'FREE' && (
                      <button
                        className="btn btn--danger"
                        style={{ fontSize: 'var(--fs-s)', minHeight: '32px' }}
                        onClick={() => handleArchive(c)}
                      >
                        Архивировать
                      </button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      <dialog
        className="dialog"
        open={showDialog}
        onCancel={() => setShowDialog(false)}
        onClick={(e) => { if (e.target === e.currentTarget) setShowDialog(false); }}
      >
        <h2 style={{ marginTop: 0 }} className="page-title">
          {editingCar ? 'Редактирование автомобиля' : 'Новый автомобиль'}
        </h2>
        <p className="page-sub">
          {editingCar ? 'Измените данные автомобиля' : 'Заполните данные нового автомобиля'}
        </p>

        <form onSubmit={handleSave}>
          <div className="field">
            <label className="field__label" htmlFor="plate">Госномер</label>
            <input
              id="plate"
              className="field__input"
              type="text"
              value={formData.plate}
              onChange={(e) => setFormData({ ...formData, plate: e.target.value })}
              required
              placeholder="01A123BC"
              maxLength={10}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-2)' }}>
            <div className="field">
              <label className="field__label" htmlFor="brand">Марка</label>
              <input
                id="brand"
                className="field__input"
                type="text"
                value={formData.brand}
                onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                required
                placeholder="Chevrolet"
              />
            </div>
            <div className="field">
              <label className="field__label" htmlFor="model">Модель</label>
              <input
                id="model"
                className="field__input"
                type="text"
                value={formData.model}
                onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                required
                placeholder="Cobalt"
              />
            </div>
          </div>

          <div className="field">
            <label className="field__label" htmlFor="year">Год выпуска</label>
            <input
              id="year"
              className="field__input"
              type="number"
              value={formData.year}
              onChange={(e) => setFormData({ ...formData, year: e.target.value })}
              min="1900"
              max={new Date().getFullYear() + 1}
              placeholder="2022"
            />
          </div>

          {user?.role === 'ADMIN' && (
            <div className="field">
              <label className="field__label" htmlFor="owner">Арендодатель</label>
              <select
                id="owner"
                className="field__input"
                value={formData.owner_id}
                onChange={(e) => setFormData({ ...formData, owner_id: e.target.value })}
              >
                <option value="">— не указан —</option>
                {owners.map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
            </div>
          )}

          {user?.role === 'ADMIN' && (
            <div className="field">
              <label className="field__label" htmlFor="branch">Филиал</label>
              <select
                id="branch"
                className="field__input"
                value={formData.branch_id}
                onChange={(e) => setFormData({ ...formData, branch_id: e.target.value })}
              >
                <option value="">— выберите —</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          )}

          {dialogError && <p className="field__error">{dialogError}</p>}

          <div style={{ display: 'flex', gap: 'var(--sp-2)', marginTop: 'var(--sp-3)' }}>
            <button
              className="btn btn--quiet"
              type="button"
              onClick={() => setShowDialog(false)}
            >
              Отмена
            </button>
            <button className="btn" type="submit" disabled={saving}>
              {saving ? 'Сохранение...' : editingCar ? 'Сохранить' : 'Создать'}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}