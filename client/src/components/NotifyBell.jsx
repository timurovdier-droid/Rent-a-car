import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { api } from '../api';
import NavIcon from './NavIcon';

export default function NotifyBell() {
  const { pathname } = useLocation();
  const [count, setCount] = useState(0);

  useEffect(() => {
    api.get('/notifications')
      .then((items) => setCount(Array.isArray(items) ? items.length : 0))
      .catch(() => {});
  }, [pathname]);

  return (
    <NavLink
      to="/notifications"
      className={({ isActive }) => `bell ${isActive ? 'bell--active' : ''}`}
      aria-label={count ? `Уведомления: ${count}` : 'Уведомления'}
      title="Уведомления"
    >
      <NavIcon name="bell" size={24} />
      {count > 0 && <span className="bell__count">{count > 99 ? '99+' : count}</span>}
    </NavLink>
  );
}
