import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import ThemeToggle from './ThemeToggle';
import LangToggle from './LangToggle';
import NavIcon from './NavIcon';
import { initials } from '../labels';

const ROLE_LABELS = {
  DRIVER: 'Водитель',
  DISPATCHER: 'Диспетчер',
  ADMIN: 'Администратор',
  OWNER: 'Арендодатель',
};

function menuFor(role) {
  if (role === 'DRIVER') {
    return [{ to: '/', label: 'Моя аренда', icon: 'car', end: true }];
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
      { to: '/', label: 'Главная', icon: 'home', end: true },
      { to: '/notifications', label: 'Уведомления', icon: 'bell' },
      { to: '/cars', label: 'Автомобили', icon: 'car' },
      { to: '/drivers', label: 'Водители', icon: 'users' },
      { to: '/owners', label: 'Арендодатели', icon: 'briefcase' },
      { to: '/users/dispatchers', label: 'Диспетчеры', icon: 'headset' },
      { to: '/finance', label: 'Финансы', icon: 'wallet' },
      { to: '/driver-report', label: 'Отчёт по водителям', icon: 'calendar' },
      { to: '/reports', label: 'Отчёты', icon: 'chart' },
      { to: '/audit', label: 'Журнал аудита', icon: 'list' },
      { to: '/settings', label: 'Настройки', icon: 'sliders' },
      { to: '/help', label: 'Справка', icon: 'help' },
    ];
  }
  if (role === 'OWNER') {
    return [
      { to: '/', label: 'Главная', icon: 'home', end: true },
      { to: '/cars', label: 'Мои автомобили', icon: 'car' },
      { to: '/finance', label: 'Финансы', icon: 'wallet' },
      { to: '/help', label: 'Справка', icon: 'help' },
    ];
  }
  return [];
}

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuItems = menuFor(user?.role);
  const current = menuItems.find((item) => (item.end ? pathname === item.to : pathname.startsWith(item.to)));

  useEffect(() => { setMenuOpen(false); }, [pathname]);

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

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <div className={`shell ${menuOpen ? 'shell--menu' : ''}`}>
      <header className="topbar">
        <button type="button" className="topbar__btn" onClick={() => setMenuOpen(true)} aria-label="Открыть меню">
          <NavIcon name="menu" size={22} />
        </button>
        <span className="topbar__title">{current?.label || 'RENT A CAR GTA'}</span>
        <NavLink to="/profile" className="topbar__avatar" title="Перейти в профиль">{initials(user?.full_name)}</NavLink>
      </header>
      <div className="nav-backdrop" onClick={() => setMenuOpen(false)} aria-hidden="true" />

      <aside className="nav" aria-label="Меню">
        <div className="nav__brand">
          <NavLink to="/" className="nav__logo" aria-label="RENT A CAR GTA — на главную">
            <img src="/logo.png" alt="GTA" className="brand-logo" width="88" height="23" />
            <span className="nav__logo-text">Rent a car</span>
          </NavLink>
          <button type="button" className="topbar__btn nav__close" onClick={() => setMenuOpen(false)} aria-label="Закрыть меню">
            <NavIcon name="close" size={22} />
          </button>
        </div>

        <NavLink className="nav__user" to="/profile" title="Перейти в профиль">
          <span className="nav__avatar">{initials(user?.full_name)}</span>
          <span className="nav__who">
            <span className="nav__name">{user?.full_name}</span>
            <span className="nav__role">{ROLE_LABELS[user?.role]}</span>
          </span>
        </NavLink>

        <nav className="nav__menu">
          {menuItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `nav__link ${isActive ? 'nav__link--active' : ''}`}
            >
              <NavIcon name={item.icon} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="nav__foot">
          <LangToggle />
          <ThemeToggle />
          <button className="btn btn--quiet nav__logout" onClick={handleLogout}>
            Выйти
          </button>
        </div>
      </aside>

      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
