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

      <div className="card" style={{ maxWidth: '32rem', marginBottom: 'var(--sp-4)' }}>
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

        {user.branch_name && (
          <div style={{ marginBottom: 'var(--sp-3)' }}>
            <div style={{ fontSize: 'var(--fs-s)', color: 'var(--c-muted)', marginBottom: 'var(--sp-1)' }}>
              Филиал
            </div>
            <div style={{ fontWeight: 500 }}>{user.branch_name}</div>
          </div>
        )}

        <div>
          <div style={{ fontSize: 'var(--fs-s)', color: 'var(--c-muted)', marginBottom: 'var(--sp-1)' }}>
            Дата регистрации
          </div>
          <div style={{ fontWeight: 500, fontSize: 'var(--fs-s)' }}>
            {new Date(user.created_at).toLocaleString('ru-RU')}
          </div>
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