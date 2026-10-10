import { useState } from 'react';
import { Link } from 'react-router-dom';
import Plate from './Plate';
import carDefault from '../assets/car-default.png';

const BRAND_SLUGS = {
  chevrolet: 'chevrolet', шевроле: 'chevrolet', ravon: 'chevrolet', daewoo: 'chevrolet',
  hyundai: 'hyundai', kia: 'kia', toyota: 'toyota', nissan: 'nissan', honda: 'honda',
  volkswagen: 'volkswagen', vw: 'volkswagen', skoda: 'skoda', mercedes: 'mercedes',
  'mercedes-benz': 'mercedes', bmw: 'bmw', audi: 'audi', ford: 'ford', mazda: 'mazda',
  mitsubishi: 'mitsubishi', lexus: 'lexus', renault: 'renault', peugeot: 'peugeot',
  byd: 'byd', tesla: 'tesla', subaru: 'subaru', suzuki: 'suzuki', opel: 'opel',
  lada: 'lada', 'лада': 'lada', geely: 'geely', chery: 'chery', haval: 'haval',
};

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

export function CarVisual({ car, src }) {
  const [brokenUrl, setBrokenUrl] = useState(null);
  const url = src || photoUrl(car);
  if (url && url !== brokenUrl) {
    return <img className="ct__photo" src={url} alt={`${car?.brand || ''} ${car?.model || ''}`.trim()} loading="lazy" onError={() => setBrokenUrl(url)} />;
  }
  return <img className="ct__drawing" src={carDefault} alt="Автомобиль" loading="lazy" />;
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
