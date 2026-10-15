import { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import NavIcon from './NavIcon';
import ThemeToggle from './ThemeToggle';
import LangToggle from './LangToggle';
import useIsPhone from './useIsPhone';
import { api } from '../api';

const DISPATCHER_SECTIONS = [
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

const ADMIN_SECTIONS = [
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
      { to: '/users?tab=dispatchers', label: 'Диспетчеры' },
      { to: '/users?tab=owners', label: 'Арендодатели' },
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
          { to: '/reports?tab=summary', label: 'Сводка' },
          { to: '/reports?tab=cars', label: 'По машинам' },
          { to: '/reports?tab=drivers', label: 'Отчёт по водителям' },
          { to: '/reports?tab=journal', label: 'Ведомость операций' },
        ],
      },
      {
        title: 'Журнал',
        items: [
          { to: '/reports?tab=audit', label: 'Журнал аудита' },
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
      { to: '/settings', label: 'Настройки системы' },
    ],
  },
];

function sectionsFor(role) {
  return role === 'ADMIN' ? ADMIN_SECTIONS : DISPATCHER_SECTIONS;
}

function itemsOf(section) {
  if (section.groups) return section.groups.flatMap((g) => g.items);
  return section.items || [];
}

function pathMatches(item, pathname, search = '') {
  const [path, query] = item.to.split('?');
  if (item.end) return pathname === path;
  if (pathname !== path && !pathname.startsWith(`${path}/`)) return false;
  if (!query) return true;
  const want = new URLSearchParams(query);
  const have = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  for (const [key, value] of want) {
    if (have.get(key) !== value) return false;
  }
  return true;
}

export function fleetPageTitle(pathname, search, role) {
  for (const section of sectionsFor(role)) {
    const hit = itemsOf(section).find((item) => pathMatches(item, pathname, search));
    if (hit) return hit.label;
  }
  return null;
}

function sectionByPath(pathname, search, role) {
  const list = sectionsFor(role);
  return list.find((section) => itemsOf(section).some((item) => pathMatches(item, pathname, search))) || list[0];
}

function prefetch(to) {
  const path = to.split('?')[0];
  const map = {
    '/': ['/dashboard'],
    '/cars': ['/cars', '/dashboard'],
    '/drivers': ['/drivers', '/driver-waitlist', '/drivers/payment-requests'],
    '/driver-report': ['/drivers'],
    '/reports': ['/cars', '/dashboard'],
    '/users': ['/owners', '/dispatchers'],
  };
  (map[path] || []).forEach((url) => api.prefetch(url));
}

export default function FleetNav({ role, mobileOpen, onMobileClose, onLogout }) {
  const isPhone = useIsPhone();
  const { pathname, search } = useLocation();
  const sections = sectionsFor(role);
  const current = useMemo(() => sectionByPath(pathname, search, role), [pathname, search, role]);
  const [sectionId, setSectionId] = useState(null);
  const closeTimer = useRef(0);

  useEffect(() => {
    if (isPhone) setSectionId(mobileOpen ? current.id : null);
  }, [isPhone, mobileOpen, current.id]);

  useEffect(() => {
    if (isPhone || !sectionId) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setSectionId(null); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isPhone, sectionId]);

  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  const openId = isPhone ? (mobileOpen ? sectionId || current.id : null) : sectionId;
  const section = openId === 'settings'
    ? { id: 'settings', title: 'Настройки' }
    : sections.find((s) => s.id === openId) || null;
  const panelOpen = Boolean(section);

  function cancelClose() {
    window.clearTimeout(closeTimer.current);
  }

  function pickSection(id) {
    cancelClose();
    setSectionId(id);
  }

  function closeAll() {
    cancelClose();
    if (isPhone) onMobileClose?.();
    else setSectionId(null);
  }

  function scheduleClose() {
    if (isPhone) return;
    cancelClose();
    closeTimer.current = window.setTimeout(() => setSectionId(null), 140);
  }

  const visible = !isPhone || mobileOpen;

  return (
    <>
      <div
        className={`fleet-backdrop ${visible && (isPhone || panelOpen) ? 'fleet-backdrop--on' : ''}`}
        onClick={isPhone ? closeAll : undefined}
        onMouseEnter={isPhone ? undefined : closeAll}
        aria-hidden="true"
      />
      <div
        className={`fleet ${visible ? 'fleet--on' : ''} ${panelOpen ? 'fleet--panel' : ''}`}
        onMouseEnter={isPhone ? undefined : cancelClose}
        onMouseLeave={isPhone ? undefined : scheduleClose}
      >
        <div className="fleet__rail">
          <div className="fleet__rail-top">
            {sections.map((s) => {
              const active = itemsOf(s).some((item) => pathMatches(item, pathname, search));
              return (
                <button
                  key={s.id}
                  type="button"
                  className={`fleet__icon ${s.id === section?.id ? 'fleet__icon--open' : ''} ${active ? 'fleet__icon--active' : ''}`}
                  aria-label={s.title}
                  aria-pressed={s.id === section?.id}
                  onMouseEnter={isPhone ? undefined : () => pickSection(s.id)}
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
              onMouseEnter={isPhone ? undefined : () => pickSection('docs')}
              onClick={() => pickSection('docs')}
            >
              <NavIcon name="info" size={20} />
            </button>
            <button
              type="button"
              className={`fleet__icon ${section?.id === 'settings' ? 'fleet__icon--open' : ''}`}
              aria-label="Настройки"
              onMouseEnter={isPhone ? undefined : () => pickSection('settings')}
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
                  {role === 'ADMIN' && (
                    <NavLink to="/settings" className="fleet__link" onClick={closeAll}>Настройки системы</NavLink>
                  )}
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
                          className={() => `fleet__link ${pathMatches(item, pathname, search) ? 'fleet__link--on' : ''}`}
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
