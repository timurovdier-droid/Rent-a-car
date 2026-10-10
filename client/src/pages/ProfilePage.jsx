import { useState } from 'react';
import { api, ApiError } from '../api';
import { useAuth } from '../auth';

export default function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const [passwords, setPasswords] = useState({
    old_password: '',
    new_password: '',
    confirm_password: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [editing, setEditing] = useState(false);
  const [info, setInfo] = useState({ full_name: '', phone: '' });
  const [infoError, setInfoError] = useState('');
  const [infoSaving, setInfoSaving] = useState(false);
  const [infoSaved, setInfoSaved] = useState(false);

  function startEdit() {
    setInfo({ full_name: user.full_name || '', phone: user.phone || '+998' });
    setInfoError('');
    setInfoSaved(false);
    setEditing(true);
  }

  async function saveInfo(e) {
    e.preventDefault();
    setInfoSaving(true);
    setInfoError('');
    try {
      await api.patch('/auth/me', info);
      await refreshUser();
      setEditing(false);
      setInfoSaved(true);
    } catch (err) {
      setInfoError(err instanceof ApiError ? err.message : 'Не удалось сохранить');
    } finally {
      setInfoSaving(false);
    }
  }

  async function handleChangePassword(e) {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (passwords.new_password !== passwords.confirm_password) {
      setError('Новый пароль и подтверждение не совпадают');
      return;
    }

    if (passwords.new_password.length < 10) {
      setError('Новый пароль должен содержать минимум 10 символов, буквы и цифры');
      return;
    }

    setSaving(true);
    try {
      await api.post('/auth/change-password', {
        old_password: passwords.old_password,
        new_password: passwords.new_password,
      });
      setSuccess('Пароль успешно изменён');
      setPasswords({ old_password: '', new_password: '', confirm_password: '' });
      await refreshUser();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ошибка смены пароля');
    } finally {
      setSaving(false);
    }
  }

  if (!user) return <div>Загрузка...</div>;

  return (
    <div>
      <h1 className="page-title">Мой профиль</h1>
      <p className="page-sub">Информация о вашей учётной записи</p>

      {editing && (
        <form className="card" onSubmit={saveInfo} style={{ maxWidth: '32rem', marginBottom: 'var(--sp-4)' }}>
          <div className="field">
            <label className="field__label" htmlFor="pf-name">ФИО</label>
            <input id="pf-name" className="field__input" value={info.full_name} onChange={(e) => setInfo({ ...info, full_name: e.target.value })} required maxLength={120} autoFocus />
          </div>
          <div className="field">
            <label className="field__label" htmlFor="pf-phone">Телефон</label>
            <input id="pf-phone" className="field__input" value={info.phone} onChange={(e) => setInfo({ ...info, phone: e.target.value })} required placeholder="+998901234567" inputMode="tel" />
          </div>
          {infoError && <p className="field__error">{infoError}</p>}
          <div className="form-actions">
            <button className="btn" type="submit" disabled={infoSaving}>{infoSaving ? 'Сохранение...' : 'Сохранить'}</button>
            <button className="btn btn--quiet" type="button" onClick={() => setEditing(false)}>Отмена</button>
          </div>
        </form>
      )}

      <div className="card" style={{ maxWidth: '32rem', marginBottom: 'var(--sp-4)', display: editing ? 'none' : undefined }}>
        <div style={{ marginBottom: 'var(--sp-3)' }}>
          <div style={{ fontSize: 'var(--fs-s)', color: 'var(--c-muted)', marginBottom: 'var(--sp-1)' }}>
            ФИО
          </div>
          <div style={{ fontWeight: 500 }}>{user.full_name}</div>
        </div>

        <div style={{ marginBottom: 'var(--sp-3)' }}>
          <div style={{ fontSize: 'var(--fs-s)', color: 'var(--c-muted)', marginBottom: 'var(--sp-1)' }}>
            Логин
          </div>
          <div style={{ fontWeight: 500 }}>{user.login}</div>
        </div>

        <div style={{ marginBottom: 'var(--sp-3)' }}>
          <div style={{ fontSize: 'var(--fs-s)', color: 'var(--c-muted)', marginBottom: 'var(--sp-1)' }}>
            Телефон
          </div>
          <div style={{ fontWeight: 500 }}>{user.phone || '—'}</div>
        </div>

        <div style={{ marginBottom: 'var(--sp-3)' }}>
          <div style={{ fontSize: 'var(--fs-s)', color: 'var(--c-muted)', marginBottom: 'var(--sp-1)' }}>
            Роль
          </div>
          <div style={{ fontWeight: 500 }}>
            {user.role === 'DRIVER' && 'Водитель'}
            {user.role === 'DISPATCHER' && 'Диспетчер'}
            {user.role === 'ADMIN' && 'Администратор'}
            {user.role === 'OWNER' && 'Арендодатель'}
          </div>
        </div>

        <div>
          <div style={{ fontSize: 'var(--fs-s)', color: 'var(--c-muted)', marginBottom: 'var(--sp-1)' }}>
            Дата регистрации
          </div>
          <div style={{ fontWeight: 500, fontSize: 'var(--fs-s)' }}>
            {new Date(user.created_at).toLocaleString('ru-RU')}
          </div>
        </div>

        <div style={{ marginTop: 'var(--sp-4)', paddingTop: 'var(--sp-3)', borderTop: '1px solid var(--c-line)' }}>
          {user.role === 'ADMIN' ? (
            <button className="btn btn--quiet btn--sm" type="button" onClick={startEdit}>Изменить имя и телефон</button>
          ) : (
            <p className="muted small" style={{ margin: 0 }}>Чтобы изменить имя или телефон, обратитесь к администратору.</p>
          )}
          {infoSaved && <p style={{ color: 'var(--c-ok)', fontWeight: 500, margin: '8px 0 0' }}>Данные сохранены</p>}
        </div>
      </div>

      <h2 className="page-title" style={{ fontSize: 'var(--fs-l)' }}>Смена пароля</h2>
      <p className="page-sub">Используйте форму ниже для изменения пароля</p>

      <form onSubmit={handleChangePassword} style={{ maxWidth: '32rem' }}>
        <div className="field">
          <label className="field__label" htmlFor="old_password">Текущий пароль</label>
          <input
            id="old_password"
            className="field__input"
            type="password"
            value={passwords.old_password}
            onChange={(e) => setPasswords({ ...passwords, old_password: e.target.value })}
            required
            autoComplete="current-password"
          />
        </div>

        <div className="field">
          <label className="field__label" htmlFor="new_password">Новый пароль</label>
          <input
            id="new_password"
            className="field__input"
            type="password"
            value={passwords.new_password}
            onChange={(e) => setPasswords({ ...passwords, new_password: e.target.value })}
            required
            minLength={6}
            autoComplete="new-password"
          />
        </div>

        <div className="field">
          <label className="field__label" htmlFor="confirm_password">Подтверждение пароля</label>
          <input
            id="confirm_password"
            className="field__input"
            type="password"
            value={passwords.confirm_password}
            onChange={(e) => setPasswords({ ...passwords, confirm_password: e.target.value })}
            required
            minLength={6}
            autoComplete="new-password"
          />
        </div>

        {error && <p className="field__error">{error}</p>}
        {success && <p style={{ color: 'var(--c-ok)', fontWeight: 500 }}>{success}</p>}

        <button className="btn" type="submit" disabled={saving} style={{ marginTop: 'var(--sp-2)' }}>
          {saving ? 'Сохранение...' : 'Сменить пароль'}
        </button>
      </form>
    </div>
  );
}