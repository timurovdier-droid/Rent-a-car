import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { api } from '../api';
import NavIcon from './NavIcon';
import Plate from './Plate';

const TABS = {
  ADMIN: [
    { to: '/', label: 'Главная', icon: 'home', end: true },
    { to: '/reports', label: 'Отчёты', icon: 'chart' },
    { to: '/profile', label: 'Профиль', icon: 'users' },
  ],
  DISPATCHER: [
    { to: '/', label: 'Главная', icon: 'home', end: true },
    { to: '/driver-report', label: 'Отчёт', icon: 'calendar' },
    { to: '/profile', label: 'Профиль', icon: 'users' },
  ],
  DRIVER: [
    { to: '/', label: 'Главная', icon: 'home', end: true },
    { to: '/payments', label: 'Оплаты', icon: 'wallet' },
    { to: '/my-report', label: 'Заработок', icon: 'chart' },
    { to: '/profile', label: 'Профиль', icon: 'users' },
  ],
  OWNER: [
    { to: '/', label: 'Главная', icon: 'home', end: true },
    { to: '/cars', label: 'Машины', icon: 'car' },
    { to: '/profile', label: 'Профиль', icon: 'users' },
  ],
};

function norm(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, '');
}

function SearchSheet({ onClose }) {
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const [query, setQuery] = useState('');
  const [drivers, setDrivers] = useState([]);
  const [cars, setCars] = useState([]);

  useEffect(() => {
    inputRef.current?.focus();
    api.get('/drivers').then(setDrivers).catch(() => {});
    api.get('/cars').then(setCars).catch(() => {});
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.classList.add('no-scroll');
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('no-scroll');
    };
  }, [onClose]);

  const q = norm(query);
  const found = useMemo(() => {
    if (!q) return { drivers: [], cars: [] };
    return {
      drivers: drivers.filter((d) => [d.full_name, d.phone, d.car_plate].some((v) => norm(v).includes(q))).slice(0, 20),
      cars: cars.filter((c) => [c.plate, c.brand, c.model, c.driver_name].some((v) => norm(v).includes(q))).slice(0, 20),
    };
  }, [q, drivers, cars]);

  function open(path) {
    onClose();
    navigate(path);
  }

  const empty = q && !found.drivers.length && !found.cars.length;

  return (
    <div className="search-sheet" role="dialog" aria-label="Поиск">
      <div className="search-sheet__bar">
        <div className="search-sheet__field">
          <NavIcon name="search" size={20} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Водитель, телефон или номер машины"
            enterKeyHint="search"
          />
        </div>
        <button type="button" className="search-sheet__cancel" onClick={onClose}>Отмена</button>
      </div>
      <div className="search-sheet__body">
        {!q && <p className="search-sheet__hint">Начните вводить имя водителя, телефон или номер машины</p>}
        {empty && <p className="search-sheet__hint">Ничего не найдено</p>}
        {found.drivers.length > 0 && (
          <section>
            <h3 className="search-sheet__title">Водители</h3>
            {found.drivers.map((d) => (
              <button key={`d${d.id}`} type="button" className="search-hit" onClick={() => open(`/drivers/${d.id}`)}>
                <span className="search-hit__icon"><NavIcon name="users" size={20} /></span>
                <span className="search-hit__text">
                  <b>{d.full_name}</b>
                  <span>{[d.phone, d.car_plate ? `на машине ${d.car_plate}` : 'свободен'].filter(Boolean).join(' · ')}</span>
                </span>
              </button>
            ))}
          </section>
        )}
        {found.cars.length > 0 && (
          <section>
            <h3 className="search-sheet__title">Автомобили</h3>
            {found.cars.map((c) => (
              <button key={`c${c.id}`} type="button" className="search-hit" onClick={() => open(`/cars/${c.id}`)}>
                <span className="search-hit__icon"><NavIcon name="car" size={20} /></span>
                <span className="search-hit__text">
                  <b>{`${c.brand} ${c.model}`}</b>
                  <span>{c.driver_name ? `водитель: ${c.driver_name}` : 'без водителя'}</span>
                </span>
                <Plate value={c.plate} />
              </button>
            ))}
          </section>
        )}
      </div>
    </div>
  );
}

export default function TabBar({ role }) {
  const [searching, setSearching] = useState(false);
  const closeSearch = useCallback(() => setSearching(false), []);
  const tabs = TABS[role];
  if (!tabs) return null;
  const canSearch = role === 'ADMIN' || role === 'DISPATCHER';

  return (
    <>
      <nav className="tabbar" aria-label="Нижнее меню">
        <div className="tabbar__pill">
          {tabs.map((t) => (
            <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => `tabbar__item ${isActive ? 'tabbar__item--on' : ''}`}>
              <NavIcon name={t.icon} size={22} />
              <span>{t.label}</span>
            </NavLink>
          ))}
        </div>
        {canSearch && (
          <button type="button" className="tabbar__search" onClick={() => setSearching(true)} aria-label="Поиск водителей и машин">
            <NavIcon name="search" size={24} />
          </button>
        )}
      </nav>
      {searching && <SearchSheet onClose={closeSearch} />}
    </>
  );
}
