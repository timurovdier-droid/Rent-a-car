import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api';
import { useAuth } from '../auth';
import ThemeToggle from '../components/ThemeToggle';
import LangToggle from '../components/LangToggle';
import { Brand } from '../components/Layout';

function formatPhone(digits) {
  const d = digits.slice(0, 9);
  return [d.slice(0, 2), d.slice(2, 5), d.slice(5, 7), d.slice(7, 9)].filter(Boolean).join(' ');
}

export default function LoginPage() {
  const [mode, setMode] = useState('login');
  const [step, setStep] = useState('id');
  const [login, setLogin] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const idRef = useRef(null);
  const passwordRef = useRef(null);
  const navigate = useNavigate();
  const { refreshUser } = useAuth();

  const identity = mode === 'phone' ? `+998${phone}` : login.trim();
  const shownIdentity = mode === 'phone' ? `+998 ${formatPhone(phone)}` : login.trim();

  useEffect(() => {
    (step === 'id' ? idRef : passwordRef).current?.focus();
  }, [step, mode]);

  function next(e) {
    e.preventDefault();
    if (mode === 'phone' && phone.length !== 9) {
      setError('Введите 9 цифр номера после +998');
      return;
    }
    if (mode === 'login' && !login.trim()) {
      setError('Введите логин');
      return;
    }
    setError('');
    setStep('password');
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.post('/auth/login', { login: identity, password });
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

  function switchMode(value) {
    setMode(value);
    setError('');
  }

  return (
    <main className="login">
      <div className="login__corner">
        <div className="login__tools">
          <LangToggle className="lang-toggle--compact" />
          <ThemeToggle className="theme-toggle--icon" />
        </div>
      </div>
      <aside className="login__stage" aria-hidden="true">
        <h2 className="login__stage-title">Смена<br />открыта</h2>
        <p className="login__stage-copy">Долги, машины и оплаты парка — в одном кабинете. Войдите, чтобы начать работу.</p>
      </aside>
      <div className="yid">
        <div className="yid__brand"><Brand big /></div>

        {step === 'id' ? (
          <form onSubmit={next} noValidate>
            <h1 className="yid__title">Войдите в аккаунт</h1>
            <div className="yid__tabs" role="tablist">
              <button type="button" role="tab" aria-selected={mode === 'login'} className={`yid__tab ${mode === 'login' ? 'yid__tab--on' : ''}`} onClick={() => switchMode('login')}>Логин</button>
              <button type="button" role="tab" aria-selected={mode === 'phone'} className={`yid__tab ${mode === 'phone' ? 'yid__tab--on' : ''}`} onClick={() => switchMode('phone')}>Телефон</button>
            </div>
            {mode === 'login' ? (
              <input
                ref={idRef}
                className="yid__input"
                type="text"
                autoComplete="username"
                placeholder="Логин"
                aria-label="Логин"
                value={login}
                onChange={(e) => setLogin(e.target.value)}
              />
            ) : (
              <label className="yid__input yid__phone">
                <span className="yid__prefix">+998</span>
                <input
                  ref={idRef}
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel-national"
                  placeholder="90 123 45 67"
                  aria-label="Номер телефона"
                  value={formatPhone(phone)}
                  onChange={(e) => {
                    let d = e.target.value.replace(/\D/g, '');
                    if (d.length > 9 && d.startsWith('998')) d = d.slice(3);
                    setPhone(d.slice(0, 9));
                  }}
                />
              </label>
            )}
            {error && <p className="yid__error">{error}</p>}
            <button className="yid__btn" type="submit">Далее</button>
          </form>
        ) : (
          <form onSubmit={submit}>
            <h1 className="yid__title">Введите пароль</h1>
            <button type="button" className="yid__who" onClick={() => { setStep('id'); setPassword(''); setError(''); }} title="Изменить">
              <span aria-hidden="true">←</span>
              <span>{shownIdentity}</span>
            </button>
            <input type="text" autoComplete="username" value={identity} readOnly hidden />
            <input
              ref={passwordRef}
              className="yid__input"
              type="password"
              autoComplete="current-password"
              placeholder="Пароль"
              aria-label="Пароль"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            {error && <p className="yid__error">{error}</p>}
            <button className="yid__btn" type="submit" disabled={loading || !password}>{loading ? 'Вход…' : 'Войти'}</button>
          </form>
        )}

        <p className="yid__hint">Забыли пароль? Обратитесь к администратору — он выдаст временный.</p>
      </div>
    </main>
  );
}
