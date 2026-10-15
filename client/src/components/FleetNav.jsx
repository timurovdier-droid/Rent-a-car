import { useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import NavIcon from './NavIcon';
import ThemeToggle from './ThemeToggle';
import LangToggle from './LangToggle';
import useIsPhone from './useIsPhone';
import { api } from '../api';

const SECTIONS = [
  {
    id: 'park',
    title: 'О парке',
    icon: 'dash',
    items: [
      { to: '/', label: 'Главная', end: true },
      { to: '/profile', label: 'Профиль' },
    ],
  },
  {
    id: 'staff',
    title: 'Персонал',
    icon: 'users',
    items: [
      { to: '/drivers', label: 'Водители' },
      { to: '/payments-queue', label: 'Оплаты водителей' },
    ],
  },
  {
    id: 'cars',
    title: 'Автомобили',
    icon: 'car',
    items: [
      { to: '/cars', label: 'Автомобили' },
      { to: '/assignments', label: 'Выдачи машин' },
      { to: '/service', label: 'Сервис' },
    ],
  },
  {
    id: 'reports',
    title: 'Отчёты',
    icon: 'list',
    groups: [
      {
        title: 'Финансы',
        items: [
          { to: '/driver-report', label: 'Отчёт по водителям' },
          { to: '/daily-reports', label: 'Отчёты по дням' },
        ],
      },
    ],
  },
  {
    id: 'docs',
    title: 'Справка',
    icon: 'book',
    items: [
      { to: '/help', label: 'Справка' },
    ],
  },
];

function itemsOf(section) {
  if (section.groups) return section.groups.flatMap((g) => g.items);
  return section.items || [];
}

function pathMatches(item, pathname) {
  if (item.end) return pathname === item.to;
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}

export function dispatcherPageTitle(pathname) {
  for (const section of SECTIONS) {
    const hit = itemsOf(section).find((item) => pathMatches(item, pathname));
    if (hit) return hit.label;
  }
  return null;
}

function sectionByPath(pathname) {
  return SECTIONS.find((section) => itemsOf(section).some((item) => pathMatches(item, pathname))) || SECTIONS[0];
}

function prefetch(to) {
  const map = {
    '/': ['/dashboard'],
    '/cars': ['/cars', '/dashboard'],
    '/drivers': ['/drivers', '/driver-waitlist', '/drivers/payment-requests'],
    '/driver-report': ['/drivers'],
  };
  (map[to] || []).forEach((path) => api.prefetch(path));
}

export default function FleetNav({ mobileOpen, onMobileClose, onLogout }) {
  const isPhone = useIsPhone();
  const { pathname } = useLocation();
  const current = useMemo(() => sectionByPath(pathname), [pathname]);
  const [sectionId, setSectionId] = useState(null);

  useEffect(() => {
    if (isPhone) setSectionId(mobileOpen ? current.id : null);
  }, [isPhone, mobileOpen, current.id]);

  useEffect(() => {
    if (isPhone || !sectionId) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setSectionId(null); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isPhone, sectionId]);

  const openId = isPhone ? (mobileOpen ? sectionId || current.id : null) : sectionId;
  const section = openId === 'settings'
    ? { id: 'settings', title: 'Настройки' }
    : SECTIONS.find((s) => s.id === openId) || null;
  const panelOpen = Boolean(section);

  function pickSection(id) {
    if (isPhone) {
      setSectionId(id);
      return;
    }
    setSectionId((prev) => (prev === id ? null : id));
  }

  function closeAll() {
    if (isPhone) onMobileClose?.();
    else setSectionId(null);
  }

  const visible = !isPhone || mobileOpen;

  return (
    <>
      <div
        className={`fleet-backdrop ${visible && (isPhone || panelOpen) ? 'fleet-backdrop--on' : ''}`}
        onClick={closeAll}
        aria-hidden="true"
      />
      <div className={`fleet ${visible ? 'fleet--on' : ''} ${panelOpen ? 'fleet--panel' : ''}`}>
        <div className="fleet__rail">
          <div className="fleet__rail-top">
            {SECTIONS.map((s) => {
              const active = itemsOf(s).some((item) => pathMatches(item, pathname));
              return (
                <button
                  key={s.id}
                  type="button"
                  className={`fleet__icon ${s.id === section?.id ? 'fleet__icon--open' : ''} ${active ? 'fleet__icon--active' : ''}`}
                  aria-label={s.title}
                  aria-pressed={s.id === section?.id}
                  onClick={() => pickSection(s.id)}
                >
                  <NavIcon name={s.icon} size={22} />
                </button>
              );
            })}
          </div>
          <div className="fleet__rail-bot">
            <button
              type="button"
              className={`fleet__icon ${section?.id === 'docs' ? 'fleet__icon--open' : ''}`}
              aria-label="Справка"
              onClick={() => pickSection('docs')}
            >
              <NavIcon name="info" size={20} />
            </button>
            <button
              type="button"
              className={`fleet__icon ${section?.id === 'settings' ? 'fleet__icon--open' : ''}`}
              aria-label="Настройки"
              onClick={() => pickSection('settings')}
            >
              <NavIcon name="gear" size={20} />
            </button>
          </div>
        </div>

        {panelOpen && (
          <div className="fleet__panel">
            {section.id === 'settings' ? (
              <>
                <div className="fleet__head">
                  <img src="/logo.png" alt="" className="fleet__logo" />
                  <h2 className="fleet__title">Настройки</h2>
                </div>
                <div className="fleet__body">
                  <div className="fleet__tools">
                    <LangToggle />
                    <ThemeToggle />
                  </div>
                  <button type="button" className="fleet__link fleet__logout" onClick={onLogout}>Выйти</button>
                </div>
              </>
            ) : (
              <>
                <div className="fleet__head">
                  <img src="/logo.png" alt="" className="fleet__logo" />
                  <h2 className="fleet__title">{section.title}</h2>
                </div>
                <div className="fleet__body">
                  {(section.groups || [{ items: section.items }]).map((group) => (
                    <div key={group.title || 'main'} className="fleet__group">
                      {group.title && <div className="fleet__group-title">{group.title}</div>}
                      {group.items.map((item) => (
                        <NavLink
                          key={item.to}
                          to={item.to}
                          end={item.end}
                          className={({ isActive }) => `fleet__link ${isActive ? 'fleet__link--on' : ''}`}
                          onClick={closeAll}
                          onMouseEnter={() => prefetch(item.to)}
                        >
                          {item.label}
                        </NavLink>
                      ))}
                    </div>
                  ))}
                </div>
              </>
            )}
            <div className="fleet__brand">GTA · для бизнеса</div>
          </div>
        )}
      </div>
    </>
  );
}
