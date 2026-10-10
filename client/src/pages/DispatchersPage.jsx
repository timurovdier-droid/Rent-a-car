import { useState, useEffect } from 'react';
import { api, ApiError } from '../api';
import Modal from '../components/Modal';

function EditDispatcherModal({ dispatcher, onClose, onDone }) {
  const [form, setForm] = useState({ full_name: dispatcher.full_name || '', phone: dispatcher.phone || '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.patch(`/dispatchers/${dispatcher.id}`, form);
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось сохранить');
      setSaving(false);
    }
  }

  return (
    <Modal title="Изменить диспетчера" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="field">
          <label className="field__label" htmlFor="dsp-name">ФИО</label>
          <input id="dsp-name" className="field__input" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required maxLength={120} autoFocus />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="dsp-phone">Телефон</label>
          <input id="dsp-phone" className="field__input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required placeholder="+998901234567" inputMode="tel" />
        </div>
        {error && <div className="notice notice--error">{error}</div>}
        <div className="form-actions">
          <button className="btn" type="submit" disabled={saving}>{saving ? 'Сохранение...' : 'Сохранить'}</button>
          <button className="btn btn--quiet" type="button" onClick={onClose}>Отмена</button>
        </div>
      </form>
    </Modal>
  );
}

export default function DispatchersPage() {
  const [dispatchers, setDispatchers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [form, setForm] = useState({ full_name: '', phone: '', login: '' });
  const [editing, setEditing] = useState(null);

  async function fetchDispatchers() {
    try {
      setLoading(true);
      const data = await api.get('/dispatchers');
      setDispatchers(data);
    } catch (err) {
      setError('Не удалось загрузить список диспетчеров');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchDispatchers();
  }, []);

  async function handleCreate(e) {
    e.preventDefault();
    setFormError('');
    setSaving(true);
    try {
      const created = await api.post('/dispatchers', {
        full_name: form.full_name,
        phone: form.phone,
        login: form.login,
      });
      setShowForm(false);
      setForm({ full_name: '', phone: '', login: '' });
      await fetchDispatchers();
      window.alert(`Диспетчер создан.\n\nВременный пароль (показывается один раз):\n${created.tempPassword}`);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Не удалось создать диспетчера');
    } finally {
      setSaving(false);
    }
  }

  async function handleResetPassword(id, fullName) {
    if (!window.confirm(`Сбросить пароль для диспетчера "${fullName}"?`)) return;

    try {
      const { tempPassword } = await api.post(`/dispatchers/${id}/reset-password`);
      alert(`Временный пароль для ${fullName}:\n\n${tempPassword}\n\nСкопируйте его и передайте диспетчеру. Он будет действовать 72 часа.`);
    } catch (err) {
      alert('Ошибка при сбросе пароля: ' + (err.message || 'Неизвестная ошибка'));
    }
  }

  async function handleArchive(id, fullName) {
    const reason = window.prompt(`Укажите причину архивации диспетчера "${fullName}":`);
    if (!reason) return;

    try {
      await api.post(`/dispatchers/${id}/archive`, { reason });
      alert('Диспетчер архивирован');
      fetchDispatchers();
    } catch (err) {
      alert('Ошибка при архивации: ' + (err.message || 'Неизвестная ошибка'));
    }
  }

  if (loading) return <div>Загрузка...</div>;
  if (error) return <div className="field__error">{error}</div>;

  return (
    <div>
      <h1 className="page-title">Диспетчеры</h1>
      <p className="page-sub">Управление учётными записями диспетчеров</p>

      <div style={{ marginBottom: 'var(--sp-4)' }}>
        <button className="btn" type="button" onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Закрыть форму' : 'Добавить диспетчера'}
        </button>
      </div>

      {showForm && (
        <form className="card" onSubmit={handleCreate} style={{ maxWidth: '32rem', marginBottom: 'var(--sp-4)' }}>
          <div className="field">
            <label className="field__label">ФИО</label>
            <input className="field__input" required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          </div>
          <div className="field">
            <label className="field__label">Телефон</label>
            <input className="field__input" required placeholder="+998901234567" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div className="field">
            <label className="field__label">Логин</label>
            <input className="field__input" required value={form.login} onChange={(e) => setForm({ ...form, login: e.target.value })} />
          </div>
          {formError && <p className="field__error">{formError}</p>}
          <button className="btn" type="submit" disabled={saving}>{saving ? 'Сохранение...' : 'Создать'}</button>
        </form>
      )}

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th className="table__th">ФИО</th>
              <th className="table__th">Логин</th>
              <th className="table__th">Телефон</th>
              <th className="table__th">Статус</th>
              <th className="table__th">Действия</th>
            </tr>
          </thead>
          <tbody>
            {dispatchers.length === 0 ? (
              <tr>
                <td colSpan="5" className="table__td" style={{ textAlign: 'center', color: 'var(--c-muted)' }}>
                  Диспетчеров пока нет
                </td>
              </tr>
            ) : (
              dispatchers.map((d) => (
                <tr key={d.id} className="table__row">
                  <td className="table__td">{d.full_name}</td>
                  <td className="table__td">{d.login}</td>
                  <td className="table__td">{d.phone}</td>
                  <td className="table__td">
                    <span className={`status ${d.status === 'ACTIVE' ? 'status--done' : 'status--wait'}`}>
                      <span className="status__mark"></span>
                      {{ ACTIVE: 'Активен', INVITED: 'Ещё не входил', LOCKED: 'Заблокирован' }[d.status] || d.status}
                    </span>
                  </td>
                  <td className="table__td">
                    <button
                      className="btn btn--quiet"
                      style={{ marginRight: 'var(--sp-2)', fontSize: 'var(--fs-s)', minHeight: '32px' }}
                      onClick={() => setEditing(d)}
                    >
                      Изменить
                    </button>
                    <button 
                      className="btn btn--quiet" 
                      style={{ marginRight: 'var(--sp-2)', fontSize: 'var(--fs-s)', minHeight: '32px' }}
                      onClick={() => handleResetPassword(d.id, d.full_name)}
                    >
                      Сбросить пароль
                    </button>
                    <button 
                      className="btn btn--danger" 
                      style={{ fontSize: 'var(--fs-s)', minHeight: '32px' }}
                      onClick={() => handleArchive(d.id, d.full_name)}
                    >
                      Архивировать
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {editing && (
        <EditDispatcherModal
          dispatcher={editing}
          onClose={() => setEditing(null)}
          onDone={() => { setEditing(null); fetchDispatchers(); }}
        />
      )}
    </div>
  );
}