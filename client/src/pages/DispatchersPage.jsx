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

function PasswordModal({ title, name, password, onClose }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(password);
    } catch {
      const area = document.createElement('textarea');
      area.value = password;
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      area.remove();
    }
    setCopied(true);
  }

  return (
    <Modal title={title} onClose={onClose}>
      <p style={{ marginTop: 0 }}>Диспетчер: <b data-no-translate>{name}</b></p>
      <span className="field__label">Временный пароль</span>
      <div className="temp-pass">
        <code className="temp-pass__value" data-no-translate>{password}</code>
        <button type="button" className={`btn ${copied ? 'btn--ok' : ''}`} onClick={copy}>{copied ? 'Скопировано ✓' : 'Скопировать'}</button>
      </div>
      <p className="muted small">Передайте его диспетчеру. Пароль действует 72 часа.</p>
      <div className="form-actions">
        <button className="btn btn--quiet" type="button" onClick={onClose}>Готово</button>
      </div>
    </Modal>
  );
}

function ResetPasswordModal({ dispatcher, onClose, onDone }) {
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function reset() {
    setSaving(true);
    setError('');
    try {
      const { tempPassword } = await api.post(`/dispatchers/${dispatcher.id}/reset-password`);
      onDone(tempPassword);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось сбросить пароль');
      setSaving(false);
    }
  }

  return (
    <Modal title="Сбросить пароль" onClose={onClose}>
      <p style={{ marginTop: 0 }}>Диспетчер: <b data-no-translate>{dispatcher.full_name}</b></p>
      <p>Старый пароль перестанет работать. Сайт выдаст новый временный пароль.</p>
      {error && <div className="notice notice--error">{error}</div>}
      <div className="form-actions">
        <button className="btn" type="button" onClick={reset} disabled={saving}>{saving ? 'Сбрасываю…' : 'Сбросить пароль'}</button>
        <button className="btn btn--quiet" type="button" onClick={onClose}>Отмена</button>
      </div>
    </Modal>
  );
}

function ArchiveDispatcherModal({ dispatcher, onClose, onDone }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.post(`/dispatchers/${dispatcher.id}/archive`, { reason });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось архивировать');
      setSaving(false);
    }
  }

  return (
    <Modal title="Архивировать диспетчера" onClose={onClose}>
      <form onSubmit={submit}>
        <p style={{ marginTop: 0 }}>Диспетчер: <b data-no-translate>{dispatcher.full_name}</b></p>
        <p>После архивации он больше не сможет войти.</p>
        <div className="field">
          <label className="field__label" htmlFor="dsp-reason">Причина</label>
          <input id="dsp-reason" className="field__input" value={reason} onChange={(e) => setReason(e.target.value)} required maxLength={300} autoFocus />
        </div>
        {error && <div className="notice notice--error">{error}</div>}
        <div className="form-actions">
          <button className="btn btn--danger" type="submit" disabled={saving || !reason.trim()}>{saving ? 'Архивирую…' : 'Архивировать'}</button>
          <button className="btn btn--quiet" type="button" onClick={onClose}>Отмена</button>
        </div>
      </form>
    </Modal>
  );
}

export default function DispatchersPage({ embedded = false }) {
  const [dispatchers, setDispatchers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [form, setForm] = useState({ full_name: '', phone: '', login: '' });
  const [editing, setEditing] = useState(null);
  const [resetting, setResetting] = useState(null);
  const [archiving, setArchiving] = useState(null);
  const [password, setPassword] = useState(null);

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
      setPassword({ title: 'Диспетчер создан', name: form.full_name, value: created.tempPassword });
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Не удалось создать диспетчера');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div>Загрузка...</div>;
  if (error) return <div className="field__error">{error}</div>;

  return (
    <div>
      {!embedded && <h1 className="page-title">Диспетчеры</h1>}
      <p className="page-sub">Учётные записи диспетчеров: создание, сброс пароля, архив</p>

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
                      onClick={() => setResetting(d)}
                    >
                      Сбросить пароль
                    </button>
                    <button 
                      className="btn btn--danger" 
                      style={{ fontSize: 'var(--fs-s)', minHeight: '32px' }}
                      onClick={() => setArchiving(d)}
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
      {resetting && (
        <ResetPasswordModal
          dispatcher={resetting}
          onClose={() => setResetting(null)}
          onDone={(value) => { setPassword({ title: 'Пароль сброшен', name: resetting.full_name, value }); setResetting(null); fetchDispatchers(); }}
        />
      )}
      {archiving && (
        <ArchiveDispatcherModal
          dispatcher={archiving}
          onClose={() => setArchiving(null)}
          onDone={() => { setArchiving(null); fetchDispatchers(); }}
        />
      )}
      {password && (
        <PasswordModal title={password.title} name={password.name} password={password.value} onClose={() => setPassword(null)} />
      )}
    </div>
  );
}