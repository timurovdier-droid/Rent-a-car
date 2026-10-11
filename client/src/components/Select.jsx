import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const SEARCH_FROM = 8;
const PANEL_MAX = 320;

function norm(value) {
  return String(value ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export const pairs = (list) => list.map(([value, label]) => ({ value, label }));

// Выпадающий список вместо системного <select>: options = [{ value, label, hint? }].
export default function Select({
  id,
  value,
  onChange,
  options,
  placeholder = '— выберите —',
  disabled = false,
  required = false,
  searchable,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);
  const panelRef = useRef(null);
  const listRef = useRef(null);

  const items = options || [];
  const selected = items.find((o) => String(o.value) === String(value ?? '')) || null;
  const withSearch = searchable ?? items.length > SEARCH_FROM;

  const shown = useMemo(() => {
    const q = norm(query);
    if (!q) return items;
    return items.filter((o) => norm(`${o.label} ${o.hint || ''}`).includes(q));
  }, [items, query]);

  function place() {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const below = window.innerHeight - r.bottom;
    const up = below < Math.min(PANEL_MAX, 240) && r.top > below;
    setPos({
      left: r.left,
      width: r.width,
      top: up ? undefined : r.bottom + 6,
      bottom: up ? window.innerHeight - r.top + 6 : undefined,
      maxHeight: Math.max(160, Math.min(PANEL_MAX + (withSearch ? 60 : 0), (up ? r.top : below) - 16)),
    });
  }

  useLayoutEffect(() => {
    if (!open) return undefined;
    place();
    const onMove = (e) => { if (!panelRef.current?.contains(e.target)) place(); };
    window.addEventListener('resize', place);
    window.addEventListener('scroll', onMove, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', onMove, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => {
      if (!btnRef.current?.contains(e.target) && !panelRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActive(Math.max(0, items.findIndex((o) => String(o.value) === String(value ?? ''))));
    if (!withSearch) panelRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (open) listRef.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open, pos]);

  function pick(option) {
    onChange(String(option.value));
    setOpen(false);
    btnRef.current?.focus();
  }

  function onKey(e) {
    if (e.key === 'Escape' || e.key === 'Tab') {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); btnRef.current?.focus(); }
      setOpen(false);
      return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(shown.length - 1, i + 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    if (e.key === 'Enter' && shown[active]) { e.preventDefault(); pick(shown[active]); }
  }

  function onBtnKey(e) {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); setOpen(true); }
  }

  return (
    <div className={`sel ${open ? 'sel--open' : ''}`}>
      <button
        id={id}
        ref={btnRef}
        type="button"
        className="sel__btn"
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onBtnKey}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={`sel__value ${selected ? '' : 'sel__value--empty'}`}>
          {selected ? selected.label : placeholder}
        </span>
        {selected?.hint && <span className="sel__hint">{selected.hint}</span>}
        <svg className="sel__chevron" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"
          fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {required && (
        <input className="sel__native" tabIndex={-1} aria-hidden="true" value={value ?? ''} required onChange={() => {}}
          onFocus={() => btnRef.current?.focus()} />
      )}

      {open && pos && createPortal(
        <div
          ref={panelRef}
          className={`sel__panel ${pos.bottom != null ? 'sel__panel--up' : ''}`}
          style={{ left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxHeight }}
          onKeyDown={onKey}
          tabIndex={-1}
        >
          {withSearch && (
            <div className="sel__search">
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="11" cy="11" r="6.5" /><path d="m20 20-3.8-3.8" />
              </svg>
              <input
                autoFocus
                value={query}
                onChange={(e) => { setQuery(e.target.value); setActive(0); }}
                placeholder="Поиск"
              />
            </div>
          )}
          <ul className="sel__list" role="listbox" ref={listRef}>
            {shown.length === 0 && <li className="sel__empty">Ничего не найдено</li>}
            {shown.map((o, i) => {
              const isOn = String(o.value) === String(value ?? '');
              return (
                <li
                  key={`${o.value}`}
                  data-i={i}
                  role="option"
                  aria-selected={isOn}
                  className={`sel__item ${i === active ? 'sel__item--active' : ''} ${isOn ? 'sel__item--on' : ''}`}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(o)}
                >
                  <span className="sel__label">{o.label}</span>
                  {o.hint && <span className="sel__item-hint">{o.hint}</span>}
                  {isOn && (
                    <svg className="sel__check" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"
                      fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m5 12 5 5 9-10" />
                    </svg>
                  )}
                </li>
              );
            })}
          </ul>
        </div>,
        document.body,
      )}
    </div>
  );
}
