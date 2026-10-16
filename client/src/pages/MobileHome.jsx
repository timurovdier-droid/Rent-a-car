import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import DriverPaymentRequests from '../components/DriverPaymentRequests';
import SummaryChart from '../components/SummaryChart';

const ADMIN_TILES = [
  { to: '/cars', label: 'Автомобили', img: 'cars', count: '/cars' },
  { to: '/users?tab=dispatchers', label: 'Диспетчеры', img: 'dispatchers', count: '/dispatchers' },
  { to: '/drivers', label: 'Водители', img: 'drivers', count: '/drivers' },
  { to: '/users?tab=owners', label: 'Арендодатели', img: 'owners', count: '/owners' },
  { to: '/reports?tab=summary', label: 'Сводка', img: 'summary', wide: true },
];

const DISPATCHER_TILES = [
  { to: '/cars', label: 'Автомобили', img: 'cars', count: '/cars' },
  { to: '/drivers', label: 'Водители', img: 'drivers', count: '/drivers' },
  { to: '/driver-report', label: 'Отчёт по водителям', img: 'summary', wide: true },
];

function today() {
  return new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
}

export default function MobileHome() {
  const { user } = useAuth();
  const tiles = user?.role === 'ADMIN' ? ADMIN_TILES : DISPATCHER_TILES;
  const [counts, setCounts] = useState({});

  useEffect(() => {
    let alive = true;
    tiles.filter((t) => t.count).forEach((t) => {
      api.get(t.count)
        .then((list) => {
          if (!alive || !Array.isArray(list)) return;
          const active = list.filter((x) => !x.archived_at && x.status !== 'ARCHIVED').length;
          setCounts((c) => ({ ...c, [t.count]: active }));
        })
        .catch(() => {});
    });
    return () => { alive = false; };
  }, [tiles]);

  return (
    <div className="mhome">
      <div className="mhome__head">
        <div className="mhome__date">{today()}</div>
      </div>

      <DriverPaymentRequests />

      <div className="mtiles">
        {tiles.map((t) => (
          <Link key={t.to} to={t.to} className={`mtile mtile--${t.img} ${t.wide ? 'mtile--wide' : ''}`}>
            <span className="mtile__card">
              {t.img === 'summary' && <SummaryChart className="mtile__chart" />}
              {t.img !== 'summary' && (
                <img className="mtile__img" src={`/tiles/${t.img}.webp${t.img === 'owners' ? '?v=handshake' : ''}`} alt="" loading="eager" decoding="async" />
              )}
              {t.img === 'summary' && (
                <span className="mtile__label">
                  {t.label}
                  {counts[t.count] != null && <span className="mtile__hint">{` · ${counts[t.count]}`}</span>}
                </span>
              )}
            </span>
            {t.img !== 'summary' && (
              <span className="mtile__label">
                {t.label}
                {counts[t.count] != null && <span className="mtile__hint">{` · ${counts[t.count]}`}</span>}
              </span>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
