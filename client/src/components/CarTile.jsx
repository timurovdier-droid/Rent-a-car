import { useState } from 'react';
import { Link } from 'react-router-dom';
import Plate from './Plate';

const BRAND_SLUGS = {
  chevrolet: 'chevrolet', шевроле: 'chevrolet', ravon: 'chevrolet', daewoo: 'chevrolet',
  hyundai: 'hyundai', kia: 'kia', toyota: 'toyota', nissan: 'nissan', honda: 'honda',
  volkswagen: 'volkswagen', vw: 'volkswagen', skoda: 'skoda', mercedes: 'mercedes',
  'mercedes-benz': 'mercedes', bmw: 'bmw', audi: 'audi', ford: 'ford', mazda: 'mazda',
  mitsubishi: 'mitsubishi', lexus: 'lexus', renault: 'renault', peugeot: 'peugeot',
  byd: 'byd', tesla: 'tesla', subaru: 'subaru', suzuki: 'suzuki', opel: 'opel',
  lada: 'lada', 'лада': 'lada', geely: 'geely', chery: 'chery', haval: 'haval',
};

const COLOR_MAP = [
  [/бел|white/, '#F2F3F5'],
  [/чёрн|черн|black/, '#2A2B2E'],
  [/серебр|silver/, '#C3C8CF'],
  [/сер|gr[ae]y/, '#8E949C'],
  [/голуб|light ?blue/, '#A9BCD9'],
  [/син|blue/, '#3D5FA8'],
  [/красн|вишн|red/, '#C8352B'],
  [/зел|green/, '#3E7D4F'],
  [/жёлт|желт|yellow/, '#F2C230'],
  [/оранж|orange/, '#E57A2E'],
  [/корич|brown/, '#6B4A35'],
  [/беж|beige/, '#D9C7A7'],
  [/фиол|purple/, '#6A4C93'],
  [/золот|gold/, '#C9A85A'],
];

export function carColor(name) {
  const v = String(name || '').toLowerCase();
  const hit = COLOR_MAP.find(([re]) => re.test(v));
  return hit ? hit[1] : '#A9B8D0';
}

export function photoUrl(car) {
  return car?.photo_version ? `/api/v1/cars/${car.id}/photo?v=${car.photo_version}` : null;
}

export function BrandLogo({ brand }) {
  const [failed, setFailed] = useState(false);
  const key = String(brand || '').trim().toLowerCase();
  const slug = BRAND_SLUGS[key] || BRAND_SLUGS[key.split(/\s+/)[0]];
  return (
    <span className="ct__logo" aria-hidden="true">
      {slug && !failed
        ? <img src={`https://cdn.simpleicons.org/${slug}`} alt="" loading="lazy" onError={() => setFailed(true)} />
        : <span className="ct__logo-letter">{(brand || '?').trim().charAt(0).toUpperCase()}</span>}
    </span>
  );
}

function SedanDrawing({ color }) {
  return (
    <svg viewBox="0 0 240 96" className="ct__drawing" role="img" aria-label="Автомобиль">
      <ellipse cx="122" cy="84" rx="104" ry="5" fill="rgb(0 0 0 / .12)" />
      <path
        d="M12 66 Q10 54 24 50 L64 44 Q80 27 104 23 L150 22 Q170 23 188 40 L216 44 Q232 47 232 59 L232 68 Q232 73 226 73 L18 73 Q12 73 12 66 Z"
        fill={color}
      />
      <path d="M12 66 Q10 54 24 50 L64 44 L216 44 Q232 47 232 59 L232 62 L12 62 Z" fill="rgb(255 255 255 / .12)" />
      <path d="M72 44 Q86 30 104 27 L123 26.5 L123 44 Z" fill="#2B3440" opacity=".82" />
      <path d="M128 26.5 L150 26.5 Q165 28 179 44 L128 44 Z" fill="#2B3440" opacity=".82" />
      <path d="M125 26 L125 70" stroke="rgb(0 0 0 / .18)" strokeWidth="1" />
      <path d="M68 46 L68 70" stroke="rgb(0 0 0 / .12)" strokeWidth="1" />
      <rect x="104" y="49" width="10" height="2.4" rx="1.2" fill="rgb(0 0 0 / .25)" />
      <rect x="160" y="49" width="10" height="2.4" rx="1.2" fill="rgb(0 0 0 / .25)" />
      <path d="M16 55 Q20 51 30 50 L30 55 Z" fill="#F4F1E6" />
      <path d="M224 47 Q230 49 231 55 L224 55 Z" fill="#D2342B" />
      <circle cx="62" cy="72" r="16" fill="var(--ct-bg, #fff)" />
      <circle cx="186" cy="72" r="16" fill="var(--ct-bg, #fff)" />
      <circle cx="62" cy="72" r="13.5" fill="#1F2023" />
      <circle cx="62" cy="72" r="7.5" fill="#C9CDD3" />
      <circle cx="62" cy="72" r="2.2" fill="#8E949C" />
      <circle cx="186" cy="72" r="13.5" fill="#1F2023" />
      <circle cx="186" cy="72" r="7.5" fill="#C9CDD3" />
      <circle cx="186" cy="72" r="2.2" fill="#8E949C" />
    </svg>
  );
}

export function CarVisual({ car, src }) {
  const [brokenUrl, setBrokenUrl] = useState(null);
  const url = src || photoUrl(car);
  if (url && url !== brokenUrl) {
    return <img className="ct__photo" src={url} alt={`${car?.brand || ''} ${car?.model || ''}`.trim()} loading="lazy" onError={() => setBrokenUrl(url)} />;
  }
  return <SedanDrawing color={carColor(car?.color)} />;
}

function Pencil() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path d="M4 20h3.6L18.4 9.2a2 2 0 0 0 0-2.8l-.8-.8a2 2 0 0 0-2.8 0L4 16.4V20Z" fill="currentColor" />
    </svg>
  );
}

export default function CarTile({ car, onEdit, alert = false, children }) {
  return (
    <article className={`ct ${alert ? 'ct--alert' : ''}`}>
      <Link to={`/cars/${car.id}`} className="ct__link" aria-label={`Открыть ${car.brand} ${car.model} ${car.plate}`} />
      <div className="ct__head">
        <BrandLogo brand={car.brand} />
        <div className="ct__names">
          <div className="ct__brand">{car.brand}</div>
          <div className="ct__model">{[car.model, car.year].filter(Boolean).join(' · ')}</div>
        </div>
        {onEdit && (
          <button type="button" className="ct__edit" onClick={() => onEdit(car)} aria-label="Изменить автомобиль" title="Изменить">
            <Pencil />
          </button>
        )}
      </div>
      <div className="ct__visual"><CarVisual car={car} /></div>
      <div className="ct__plate"><Plate value={car.plate} /></div>
      {children && <div className="ct__info">{children}</div>}
    </article>
  );
}
