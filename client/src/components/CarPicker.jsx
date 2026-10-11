import { useEffect, useMemo, useRef, useState } from 'react';
import Plate from './Plate';

function norm(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, '');
}

function Chevron() {
  return (
    <svg className="cpick__chevron" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function CarRow({ car }) {
  return (
    <>
      <Plate value={car.plate} />
      <span className="cpick__info">
        <span className="cpick__model">{car.brand} {car.model}</span>
        <span className={`cpick__driver ${car.driver_name ? '' : 'cpick__driver--none'}`}>
          {car.driver_name ? <span data-no-translate>{car.driver_name}</span> : 'Без водителя'}
        </span>
      </span>
    </>
  );
}

// Выбор машины: кнопка с номером, ниже список с поиском по номеру, марке и водителю.
export default function CarPicker({ id, cars, value, onChange, loading = false }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const boxRef = useRef(null);
  const listRef = useRef(null);
  const selected = (cars || []).find((c) => String(c.id) === String(value)) || null;

  const shown = useMemo(() => {
    const q = norm(query);
    const list = [...(cars || [])].sort((a, b) =>
      (a.status === 'RENTED' ? 0 : 1) - (b.status === 'RENTED' ? 0 : 1) || String(a.plate).localeCompare(String(b.plate)));
    if (!q) return list;
    return list.filter((c) => [c.plate, c.brand, c.model, `${c.brand}${c.model}`, c.driver_name].some((v) => norm(v).includes(q)));
  }, [cars, query]);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!boxRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    const i = (cars || []).length ? Math.max(0, shown.findIndex((c) => String(c.id) === String(value))) : 0;
    setActive(i);
  }, [open]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  function pick(car) {
    onChange(String(car.id));
    setOpen(false);
  }

  function onKey(e) {
    if (e.key === 'Escape') { setOpen(false); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(shown.length - 1, i + 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    if (e.key === 'Enter' && shown[active]) { e.preventDefault(); pick(shown[active]); }
  }

  return (
    <div className={`cpick ${open ? 'cpick--open' : ''}`} ref={boxRef}>
      <button
        id={id}
        type="button"
        className="cpick__btn"
        onClick={() => setOpen((v) => !v)}
        disabled={loading}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {selected ? <CarRow car={selected} /> : (
          <span className="cpick__placeholder">{loading ? 'Загрузка…' : 'Выберите машину'}</span>
        )}
        <Chevron />
      </button>

      {open && (
        <div className="cpick__panel" onKeyDown={onKey}>
          <div className="cpick__search">
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="11" cy="11" r="6.5" /><path d="m20 20-3.8-3.8" />
            </svg>
            <input
              autoFocus
              value={query}
              onChange={(e) => { setQuery(e.target.value); setActive(0); }}
              placeholder="Номер, марка или водитель"
            />
          </div>
          <ul className="cpick__list" role="listbox" ref={listRef}>
            {shown.length === 0 && <li className="cpick__empty">Ничего не найдено</li>}
            {shown.map((c, i) => {
              const isOn = String(c.id) === String(value);
              return (
                <li
                  key={c.id}
                  data-i={i}
                  role="option"
                  aria-selected={isOn}
                  className={`cpick__item ${i === active ? 'cpick__item--active' : ''} ${isOn ? 'cpick__item--on' : ''}`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(c)}
                >
                  <CarRow car={c} />
                  <span className={`cpick__status ${c.status === 'RENTED' ? 'cpick__status--rent' : ''}`}>
                    {c.status === 'RENTED' ? 'В аренде' : 'Свободна'}
                  </span>
                </li>
              );
            })}
          </ul>
          <div className="cpick__foot">{`${shown.length} из ${(cars || []).length}`}</div>
        </div>
      )}
    </div>
  );
}
