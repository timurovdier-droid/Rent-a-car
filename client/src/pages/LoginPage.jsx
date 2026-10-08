import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api';
import { useAuth } from '../auth';
import ThemeToggle from '../components/ThemeToggle';
import LangToggle from '../components/LangToggle';

export default function LoginPage() {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { refreshUser } = useAuth();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await api.post('/auth/login', { login, password });
      await refreshUser();
      navigate('/', { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'PASSWORD_CHANGE_REQUIRED') {
          await refreshUser();
          navigate('/change-password', { replace: true });
          return;
        }
        setError(err.message || 'Неверный логин или пароль');
      } else {
        setError('Произошла ошибка. Попробуйте позже.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login">
      <div className="login__corner">
        <img src="/logo.png" alt="GTA" className="brand-logo" width="84" height="22" />
        <div className="login__tools">
          <LangToggle className="lang-toggle--compact" />
          <ThemeToggle className="theme-toggle--icon" />
        </div>
      </div>
      <div className="login__card">
      <h1 className="page-title">RENT A CAR GTA</h1>
      <p className="page-sub">Введите логин и пароль</p>

      <form onSubmit={handleSubmit}>
        <div className="field">
          <label className="field__label" htmlFor="login">Логин</label>
          <input
            id="login"
            className="field__input"
            type="text"
            autoComplete="username"
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            required
          />
        </div>

        <div className="field">
          <label className="field__label" htmlFor="password">Пароль</label>
          <input
            id="password"
            className="field__input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        {error && <p className="field__error">{error}</p>}

        <button className="btn" type="submit" disabled={loading} style={{ width: '100%', marginTop: '1rem' }}>
          {loading ? 'Вход...' : 'Войти'}
        </button>
      </form>

      <p style={{ marginTop: '1.5rem', color: 'var(--c-muted)', fontSize: 'var(--fs-s)' }}>
        Забыли пароль? Обратитесь к администратору: он выдаст временный пароль.
      </p>
      </div>
    </main>
  );
}