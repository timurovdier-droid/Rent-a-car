import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';

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
      { to: '/payments-queue', label: 'Очередь платежей' },
      { to: '/assignments', label: 'Назначения' },
      { to: '/daily-reports', label: 'Дневные отчёты' },
      { to: '/service', label: 'Обслуживание' },
      { to: '/cars', label: 'Автомобили' },
      { to: '/drivers', label: 'Водители' },
    );
  }

  if (user?.role === 'ADMIN') {
    menuItems.push(
      { to: '/', label: 'Главная', end: true },
      { to: '/notifications', label: 'Уведомления' },
      { to: '/branches', label: 'Филиалы' },
      { to: '/payments-queue', label: 'Очередь платежей' },
      { to: '/assignments', label: 'Назначения' },
      { to: '/daily-reports', label: 'Дневные отчёты' },
      { to: '/service', label: 'Обслуживание' },
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
        <div style={{ padding: 'var(--sp-3)', borderBottom: '1px solid var(--c-border)' }}>
          <div style={{ fontWeight: 600, fontSize: 'var(--fs-l)' }}>Qween</div>
          <NavLink
            to="/profile"
            style={{ textDecoration: 'none', color: 'inherit' }}
            title="Перейти в профиль"
          >
            <div style={{ fontSize: 'var(--fs-s)', marginTop: 'var(--sp-1)', fontWeight: 500 }}>
              {user?.full_name}
            </div>
          </NavLink>
          <div style={{ fontSize: 'var(--fs-s)', color: 'var(--c-muted)' }}>
            {user?.role === 'DRIVER' && 'Водитель'}
            {user?.role === 'DISPATCHER' && 'Диспетчер'}
            {user?.role === 'ADMIN' && 'Администратор'}
            {user?.role === 'OWNER' && 'Арендодатель'}
          </div>
        </div>

        <nav style={{ flex: 1, padding: 'var(--sp-2) 0', overflowY: 'auto' }}>
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

        <div style={{ padding: 'var(--sp-3)', borderTop: '1px solid var(--c-border)' }}>
          <button
            className="btn btn--quiet"
            onClick={handleLogout}
            style={{ width: '100%' }}
          >
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