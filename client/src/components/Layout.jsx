import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import ThemeToggle from './ThemeToggle';
import LangToggle from './LangToggle';
import NavIcon from './NavIcon';
import UpdateBanner from './UpdateBanner';
import NotifyBell from './NotifyBell';
import { api } from '../api';
import useTableLabels from './useTableLabels';
import useIsPhone from './useIsPhone';
import TabBar from './TabBar';
import { playChime, playTap, setSoundOn, soundOn } from '../sound';
import { fmtMoney } from '../labels';
const ROLE_LABELS = {
  DRIVER: 'Водитель',
  DISPATCHER: 'Диспетчер',
  ADMIN: 'Администратор',
  OWNER: 'Арендодатель',
};

function menuFor(role) {
  if (role === 'DRIVER') {
    return [
      { to: '/', label: 'Моя аренда', icon: 'car', end: true },
      { to: '/payments', label: 'Оплаты', icon: 'wallet' },
    ];
  }
  if (role === 'DISPATCHER') {
    return [
      { to: '/', label: 'Главная', icon: 'home', end: true },
      { to: '/cars', label: 'Автомобили', icon: 'car' },
      { to: '/drivers', label: 'Водители', icon: 'users' },
      { to: '/driver-report', label: 'Отчёт по водителям', icon: 'calendar' },
      { to: '/help', label: 'Справка', icon: 'help' },
    ];
  }
  if (role === 'ADMIN') {
    return [
      { to: '/drivers', label: 'Водители', icon: 'users' },
      { to: '/cars', label: 'Автомобили', icon: 'car' },
      { to: '/users', label: 'Пользователи', icon: 'team' },
      { to: '/reports', label: 'Отчёты', icon: 'chart' },
      { to: '/settings', label: 'Настройки', icon: 'sliders' },
      { to: '/help', label: 'Справка', icon: 'help' },
    ];
  }
  if (role === 'OWNER') {
    return [
      { to: '/', label: 'Главная', icon: 'home', end: true },
      { to: '/cars', label: 'Мои автомобили', icon: 'car' },
      { to: '/help', label: 'Справка', icon: 'help' },
    ];
  }
  return [];
}

const PREFETCH = {
  '/': ['/dashboard'],
  '/cars': ['/cars', '/dashboard'],
  '/drivers': ['/drivers', '/driver-waitlist', '/drivers/payment-requests'],
  '/users': ['/owners', '/dispatchers'],
  '/driver-report': ['/drivers'],
  '/reports': ['/cars', '/dashboard'],
  '/settings': ['/settings'],
};

function prefetchSection(role, to) {
  if (role === 'DRIVER') return;
  (PREFETCH[to] || []).forEach((path) => api.prefetch(path));
}

function useLogout() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  return async () => {
    await logout();
    navigate('/login');
  };
}

export function AppControls() {
  const handleLogout = useLogout();
  return (
    <>
      <LangToggle />
      <ThemeToggle />
      <button type="button" className="btn btn--quiet nav__logout" onClick={handleLogout}>Выйти</button>
    </>
  );
}

function SoundToggle() {
  const [on, setOn] = useState(soundOn);
  return (
    <div className="umenu__row">
      <span>Звук</span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        className={`switch ${on ? 'switch--on' : ''}`}
        onClick={() => { setSoundOn(!on); setOn(!on); if (!on) playTap(); }}
      >
        <span className="switch__knob" />
      </button>
    </div>
  );
}

const SEEN_KEY = 'rac-seen-payment-request';

// Админ и диспетчер слышат сигнал, когда водитель отправил новую оплату из кабинета.
function usePaymentRequestAlert(role) {
  const navigate = useNavigate();
  const [toast, setToast] = useState(null);
  useEffect(() => {
    if (role !== 'ADMIN' && role !== 'DISPATCHER') return undefined;
    let alive = true;
    async function check() {
      try {
        const list = await api.fresh('/drivers/payment-requests');
        if (!alive || !Array.isArray(list)) return;
        const maxId = list.reduce((m, r) => Math.max(m, Number(r.id)), 0);
        const seen = Number(localStorage.getItem(SEEN_KEY) || 0);
        if (maxId > seen) {
          localStorage.setItem(SEEN_KEY, String(maxId));
          if (seen > 0) {
            const last = list.find((r) => Number(r.id) === maxId);
            playChime();
            setToast(last);
          }
        }
      } catch {
        // нет связи — проверим в следующий раз
      }
    }
    check();
    const timer = setInterval(check, 30000);
    return () => { alive = false; clearInterval(timer); };
  }, [role]);

  if (!toast) return null;
  return (
    <button type="button" className="ptoast" onClick={() => { setToast(null); navigate('/drivers'); }}>
      <b>Новая оплата от водителя</b>
      <span>{`${toast.full_name} · ${fmtMoney(toast.amount)} сум — нажмите, чтобы проверить`}</span>
    </button>
  );
}

function AvatarLogo() {
  return <img src="/logo.png" alt="GTA" className="avatar-logo" width={24} height={6} />;
}

function UserMenu({ user, onLogout }) {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => { setOpen(false); }, [pathname]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (!rootRef.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="umenu" ref={rootRef}>
      <button type="button" className="topbar__user" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="menu">
        <span className="nav__avatar"><AvatarLogo /></span>
        <span className="nav__who">
          <span className="nav__name">{user?.full_name}</span>
          <span className="nav__role">{ROLE_LABELS[user?.role]}</span>
        </span>
      </button>
      {open && (
        <div className="umenu__pop" role="menu">
          <NavLink to="/profile" className="umenu__item">Профиль</NavLink>
          <div className="umenu__row">
            <span>Язык</span>
            <LangToggle className="lang-toggle--compact" />
          </div>
          <ThemeToggle />
          <SoundToggle />
          <button type="button" className="umenu__item umenu__logout" onClick={onLogout}>Выйти</button>
        </div>
      )}
    </div>
  );
}

export function Brand({ big = false }) {
  return (
    <NavLink to="/" className={`brand ${big ? 'brand--big' : ''}`} aria-label="Rent a car — на главную" data-no-translate>
      <img src="/logo.png" alt="GTA" className="brand-logo" width={big ? 160 : 112} height={big ? 42 : 29} />
    </NavLink>
  );
}

export default function Layout() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const mainRef = useRef(null);
  const isPhone = useIsPhone();
  useTableLabels(mainRef);
  const menuItems = menuFor(user?.role);
  const current = menuItems.find((item) => (item.end ? pathname === item.to : pathname.startsWith(item.to)));

  useEffect(() => { setMenuOpen(false); }, [pathname]);

  useEffect(() => {
    const timer = setTimeout(() => {
      menuItems.forEach((item) => prefetchSection(user?.role, item.to));
    }, 1500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.role]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('keydown', onKey);
    document.body.classList.add('no-scroll');
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('no-scroll');
    };
  }, [menuOpen]);

  const handleLogout = useLogout();
  const paymentToast = usePaymentRequestAlert(user?.role);

  useEffect(() => {
    if (!isPhone) return undefined;
    const onDown = (e) => {
      if (e.target.closest?.('.tabbar a, .tabbar button, .mtile, .btn, .dhero__orb, .search-hit, .nav__link')) playTap();
    };
    document.addEventListener('pointerdown', onDown, { passive: true });
    return () => document.removeEventListener('pointerdown', onDown);
  }, [isPhone]);

  return (
    <div className={`shell ${menuOpen ? 'shell--menu' : ''}`}>
      <header className="topbar">
        <button type="button" className="topbar__btn topbar__burger" onClick={() => setMenuOpen(true)} aria-label="Открыть меню">
          <NavIcon name="menu" size={22} />
        </button>
        {current && <span className="topbar__section">{current.label}</span>}
        <div className="topbar__tools">
          <UserMenu user={user} onLogout={handleLogout} />
        </div>
        <NavLink to="/profile" className="topbar__avatar" title="Перейти в профиль"><AvatarLogo /></NavLink>
      </header>
      <div className="nav-backdrop" onClick={() => setMenuOpen(false)} aria-hidden="true" />

      <aside className="nav" aria-label="Меню">
        <div className="nav__brand">
          <button type="button" className="topbar__btn nav__close" onClick={() => setMenuOpen(false)} aria-label="Закрыть меню">
            <NavIcon name="close" size={22} />
          </button>
        </div>

        <nav className="nav__menu">
          {menuItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `nav__link ${isActive ? 'nav__link--active' : ''}`}
              onMouseEnter={() => prefetchSection(user?.role, item.to)}
              onTouchStart={() => prefetchSection(user?.role, item.to)}
            >
              <NavIcon name={item.icon} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {user?.role !== 'ADMIN' && (
          <div className="nav__foot">
            <AppControls />
          </div>
        )}
      </aside>

      <main className="main" ref={mainRef}>
        <Outlet />
      </main>
      {user?.role === 'ADMIN' && <NotifyBell />}
      {isPhone && <TabBar role={user?.role} />}
      {paymentToast}
      <UpdateBanner />
    </div>
  );
}
