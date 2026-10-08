import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import ThemeToggle from './ThemeToggle';
import LangToggle from './LangToggle';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  const menuItems = [];

  if (user?.role === 'DRIVER') {
    menuItems.push(
      { to: '/', label: 'Главная', end: true },
      { to: '/pay-rent', label: 'Передать оплату' },
      { to: '/daily-reports', label: 'Мои отчёты' },
    );
  }

  if (user?.role === 'DISPATCHER') {
    menuItems.push(
      { to: '/', label: 'Главная', end: true },
      { to: '/cars', label: 'Автомобили' },
      { to: '/drivers', label: 'Водители' },
    );
  }

  if (user?.role === 'ADMIN') {
    menuItems.push(
      { to: '/', label: 'Главная', end: true },
      { to: '/notifications', label: 'Уведомления' },
      { to: '/branches', label: 'Филиалы' },
      { to: '/cars', label: 'Автомобили' },
      { to: '/drivers', label: 'Водители' },
      { to: '/owners', label: 'Арендодатели' },
      { to: '/users/dispatchers', label: 'Диспетчеры' },
      { to: '/finance', label: 'Финансы' },
      { to: '/reports', label: 'Отчёты' },
      { to: '/audit', label: 'Журнал аудита' },
      { to: '/settings', label: 'Настройки' },
    );
  }

  if (user?.role === 'OWNER') {
    menuItems.push(
      { to: '/', label: 'Главная', end: true },
      { to: '/cars', label: 'Мои автомобили' },
      { to: '/finance', label: 'Финансы' },
    );
  }

  return (
    <div className="shell">
      <aside className="nav">
        <div className="nav__brand">
          <NavLink to="/" className="nav__logo" aria-label="RENT A CAR GTA — на главную">
            <img src="/logo.png" alt="GTA" className="brand-logo" width="88" height="23" />
            <span className="nav__logo-text">Rent a car</span>
          </NavLink>
          <NavLink className="nav__user" to="/profile" title="Перейти в профиль">
            <span className="nav__name">{user?.full_name}</span>
            <span className="nav__role">
              {user?.role === 'DRIVER' && 'Водитель'}
              {user?.role === 'DISPATCHER' && 'Диспетчер'}
              {user?.role === 'ADMIN' && 'Администратор'}
              {user?.role === 'OWNER' && 'Арендодатель'}
            </span>
          </NavLink>
        </div>

        <nav className="nav__menu">
          {menuItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `nav__link ${isActive ? 'nav__link--active' : ''}`
              }
            >
              {item.label}
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