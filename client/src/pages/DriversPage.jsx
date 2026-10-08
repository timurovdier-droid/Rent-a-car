import { useState, useEffect, useCallback } from 'react';
import { api, ApiError } from '../api';
import { useAuth } from '../auth';
import StatusMark from '../components/StatusMark';

export default function DriversPage() {
  const { user } = useAuth();
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [branches, setBranches] = useState([]);

  const [showDialog, setShowDialog] = useState(false);
  const [editingDriver, setEditingDriver] = useState(null);
  const [formData, setFormData] = useState({
    full_name: '',
    phone: '',
    login: '',
    password: '',
    passport: '',
    license_no: '',
    license_expires: '',
    branch_id: '',
  });
  const [dialogError, setDialogError] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchDrivers = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.get('/drivers');
      setDrivers(data);
    } catch (err) {
      setError('Не удалось загрузить водителей');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) fetchDrivers();
  }, [fetchDrivers, user]);

  useEffect(() => {
    api.get('/branches/active').then(setBranches).catch(() => setBranches([]));
  }, []);

  function openCreateDialog() {
    setEditingDriver(null);
    setFormData({
      full_name: '',
      phone: '',
      login: '',
      password: '',
      passport: '',
      license_no: '',
      license_expires: '',
      branch_id: user?.branch_id ? String(user.branch_id) : '',
    });
    setDialogError('');
    setShowDialog(true);
  }

  function openEditDialog(driver) {
    setEditingDriver(driver);
    setFormData({
      full_name: driver.full_name || '',
      phone: driver.phone || '',
      login: '',
      password: '',
      passport: driver.passport || '',
      license_no: driver.license_no || '',
      license_expires: driver.license_expires ? driver.license_expires.slice(0, 10) : '',
      branch_id: driver.branch_id ? String(driver.branch_id) : '',
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
        full_name: formData.full_name,
        phone: formData.phone,
        passport: formData.passport || undefined,
        license_no: formData.license_no || undefined,
        license_expires: formData.license_expires || undefined,
        branch_id: formData.branch_id ? Number(formData.branch_id) : undefined,
      };

      if (editingDriver) {
        await api.patch(`/drivers/${editingDriver.id}`, body);
      } else {
        body.login = formData.login;
        body.password = formData.password;
        await api.post('/drivers', body);
      }
      setShowDialog(false);
      fetchDrivers();
    } catch (err) {
      setDialogError(err instanceof ApiError ? err.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  }

  async function handleArchive(driver) {
    if (!window.confirm(`Архивировать водителя ${driver.full_name}?`)) return;
    try {
      await api.post(`/drivers/${driver.id}/archive`);
      fetchDrivers();
    } catch (err) {
      alert('Ошибка: ' + (err.message || 'Неизвестная ошибка'));
    }
  }

  if (loading) return <div>Загрузка...</div>;
  if (error) return <div className="field__error">{error}</div>;

  return (
    <div>
      <h1 className="page-title">Водители</h1>
      <p className="page-sub">
        {drivers.length > 0 ? `${drivers.length} водителей` : 'Водителей пока нет'}
      </p>

      <div style={{ marginBottom: 'var(--sp-4)' }}>
        <button className="btn" onClick={openCreateDialog}>
          Добавить водителя
        </button>
      </div>

      {drivers.length === 0 ? (
        <p style={{ color: 'var(--c-muted)' }}>Водителей нет. Добавьте первого.</p>
      ) : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th className="table__th">ФИО</th>
                  <th className="table__th">Телефон</th>
                  <th className="table__th">Права</th>
                  <th className="table__th">Статус</th>
                  <th className="table__th">Действия</th>
                </tr>
              </thead>
              <tbody>
                {drivers.map((d) => (
                  <tr key={d.id} className="table__row">
                    <td className="table__td">{d.full_name}</td>
                    <td className="table__td">{d.phone}</td>
                    <td className="table__td" style={{ fontSize: 'var(--fs-s)' }}>
                      {d.license_no || '—'}
                      {d.license_expires && (
                        <div style={{ color: 'var(--c-muted)' }}>
                          до {new Date(d.license_expires).toLocaleDateString('ru-RU')}
                        </div>
                      )}
                    </td>
                    <td className="table__td">
                      <StatusMark status={d.status} />
                    </td>
                    <td className="table__td">
                      <div style={{ display: 'flex', gap: 'var(--sp-1)' }}>
                        <button
                          className="btn btn--quiet"
                          style={{ fontSize: 'var(--fs-s)', minHeight: '32px' }}
                          onClick={() => openEditDialog(d)}
                        >
                          Изменить
                        </button>
                        {d.status === 'FREE' && (
                          <button
                            className="btn btn--danger"
                            style={{ fontSize: 'var(--fs-s)', minHeight: '32px' }}
                            onClick={() => handleArchive(d)}
                          >
                            Архивировать
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="queue">
            {drivers.map((d) => (
              <li key={d.id} className="queue__row">
                <div>
                  <div style={{ fontWeight: 500 }}>{d.full_name}</div>
                  <div style={{ fontSize: 'var(--fs-s)', color: 'var(--c-muted)' }}>
                    {d.phone}
                  </div>
                  <div style={{ marginTop: 'var(--sp-1)' }}>
                    <StatusMark status={d.status} />
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-1)' }}>
                  <button
                    className="btn btn--quiet"
                    style={{ fontSize: 'var(--fs-s)', minHeight: '32px' }}
                    onClick={() => openEditDialog(d)}
                  >
                    Изменить
                  </button>
                  {d.status === 'FREE' && (
                    <button
                      className="btn btn--danger"
                      style={{ fontSize: 'var(--fs-s)', minHeight: '32px' }}
                      onClick={() => handleArchive(d)}
                    >
                      Архив
                    </button>
                  )}
                </div>
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
          {editingDriver ? 'Редактирование водителя' : 'Новый водитель'}
        </h2>
        <p className="page-sub">
          {editingDriver ? 'Измените данные водителя' : 'Заполните данные нового водителя'}
        </p>

        <form onSubmit={handleSave}>
          <div className="field">
            <label className="field__label" htmlFor="full_name">ФИО</label>
            <input
              id="full_name"
              className="field__input"
              type="text"
              value={formData.full_name}
              onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
              required
              placeholder="Иванов Иван Иванович"
            />
          </div>

          <div className="field">
            <label className="field__label" htmlFor="phone">Телефон</label>
            <input
              id="phone"
              className="field__input"
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              required
              placeholder="+998901234567"
            />
          </div>

          {!editingDriver && (
            <>
              <div className="field">
                <label className="field__label" htmlFor="login">Логин</label>
                <input
                  id="login"
                  className="field__input"
                  type="text"
                  value={formData.login}
                  onChange={(e) => setFormData({ ...formData, login: e.target.value })}
                  required
                  placeholder="driver_ivanov"
                />
              </div>
              <div className="field">
                <label className="field__label" htmlFor="password">Пароль</label>
                <input
                  id="password"
                  className="field__input"
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required
                  minLength={6}
                  placeholder="Минимум 6 символов"
                />
              </div>
            </>
          )}

          <div className="field">
            <label className="field__label" htmlFor="passport">Паспорт</label>
            <input
              id="passport"
              className="field__input"
              type="text"
              value={formData.passport}
              onChange={(e) => setFormData({ ...formData, passport: e.target.value })}
              placeholder="AA1234567"
            />
          </div>

          <div className="field">
            <label className="field__label" htmlFor="license_no">Номер прав</label>
            <input
              id="license_no"
              className="field__input"
              type="text"
              value={formData.license_no}
              onChange={(e) => setFormData({ ...formData, license_no: e.target.value })}
              placeholder="90 AA 123456"
            />
          </div>

          <div className="field">
            <label className="field__label" htmlFor="license_expires">Срок действия прав</label>
            <input
              id="license_expires"
              className="field__input"
              type="date"
              value={formData.license_expires}
              onChange={(e) => setFormData({ ...formData, license_expires: e.target.value })}
            />
          </div>

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
              {saving ? 'Сохранение...' : editingDriver ? 'Сохранить' : 'Создать'}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}