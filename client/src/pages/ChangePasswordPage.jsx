import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api';
import { useAuth } from '../auth';

export default function ChangePasswordPage() {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { user, refreshUser } = useAuth();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (newPassword.length < 10) {
      setError('Пароль должен содержать минимум 10 символов');
      return;
    }
    if (!/[A-Za-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      setError('Пароль должен содержать буквы и цифры');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Пароли не совпадают');
      return;
    }

    setLoading(true);
    try {
      await api.post('/auth/change-password', {
        oldPassword: oldPassword || undefined,
        newPassword,
      });
      await refreshUser();
      navigate('/', { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Произошла ошибка. Попробуйте позже.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="main" style={{ maxWidth: '28rem', margin: '4rem auto' }}>
      <h1 className="page-title">Смена пароля</h1>
      <p className="page-sub">
        {user?.must_change_password 
          ? 'Задайте новый пароль, чтобы продолжить работу' 
          : 'Введите текущий и новый пароль'}
      </p>

      <form onSubmit={handleSubmit}>
        {!user?.must_change_password && (
          <div className="field">
            <label className="field__label" htmlFor="oldPassword">Текущий пароль</label>
            <input
              id="oldPassword"
              className="field__input"
              type="password"
              autoComplete="current-password"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              required
            />
          </div>
        )}

        <div className="field">
          <label className="field__label" htmlFor="newPassword">Новый пароль</label>
          <input
            id="newPassword"
            className="field__input"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={10}
          />
        </div>

        <div className="field">
          <label className="field__label" htmlFor="confirmPassword">Повторите новый пароль</label>
          <input
            id="confirmPassword"
            className="field__input"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />
        </div>

        {error && <p className="field__error">{error}</p>}

        <button className="btn" type="submit" disabled={loading} style={{ width: '100%', marginTop: '1rem' }}>
          {loading ? 'Сохранение...' : 'Сохранить'}
        </button>
      </form>
    </main>
  );
}