import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { todayLocal } from '../labels';
import { useLang } from '../i18n';
import { shiftMonth } from './MonthRangePicker';

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const WEEKDAYS_UZ = ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya'];
const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const MONTHS_SHORT = ['Янв.', 'Февр.', 'Март', 'Апр.', 'Май', 'Июнь', 'Июль', 'Авг.', 'Сент.', 'Окт.', 'Нояб.', 'Дек.'];
const POP_W = 296;
const POP_H = 380;

const pad = (n) => String(n).padStart(2, '0');

function daysIn(month) {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function display(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return '';
  const [y, m, d] = value.split('-');
  return `${d}.${m}.${y}`;
}

// Выбор даты вместо системного <input type="date">: тот же value 'YYYY-MM-DD' и onChange({ target: { value } }).
export default function DateInput({
  id,
  value,
  onChange,
  min,
  max,
  required = false,
  disabled = false,
  className = 'field__input',
  placeholder = 'дд.мм.гггг',
}) {
  const lang = useLang();
  const today = todayLocal();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState((value || today).slice(0, 7));
  const [monthList, setMonthList] = useState(false);
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);
  const popRef = useRef(null);

  function place() {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const below = window.innerHeight - r.bottom;
    const up = below < POP_H + 12 && r.top > below;
    setPos({
      left: Math.max(8, Math.min(r.left, window.innerWidth - POP_W - 8)),
      top: up ? undefined : r.bottom + 6,
      bottom: up ? window.innerHeight - r.top + 6 : undefined,
    });
  }

  useLayoutEffect(() => {
    if (!open) return undefined;
    place();
    const onMove = (e) => { if (!popRef.current?.contains(e.target)) place(); };
    window.addEventListener('resize', place);
    window.addEventListener('scroll', onMove, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', onMove, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (!btnRef.current?.contains(e.target) && !popRef.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); btnRef.current?.focus(); }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  function toggle() {
    if (!open) {
      setView((value || (max && max < today ? max : today)).slice(0, 7));
      setMonthList(false);
    }
    setOpen(!open);
  }

  function emit(next) {
    onChange?.({ target: { value: next, id } });
  }

  function pick(day) {
    emit(day);
    setOpen(false);
    btnRef.current?.focus();
  }

  const outOfRange = (day) => Boolean((min && day < min) || (max && day > max));
  const monthOut = (month) => Boolean((min && month < min.slice(0, 7)) || (max && month > max.slice(0, 7)));

  const [vy, vm] = view.split('-').map(Number);
  const firstWeekday = (new Date(Date.UTC(vy, vm - 1, 1)).getUTCDay() + 6) % 7;
  const cells = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysIn(view) }, (_, i) => `${view}-${pad(i + 1)}`),
  ];
  const step = monthList ? 12 : 1;
  const prevEdge = monthList ? `${vy - 1}-12` : shiftMonth(view, -1);
  const nextEdge = monthList ? `${vy + 1}-01` : shiftMonth(view, 1);
  const canPrev = !min || prevEdge >= min.slice(0, 7);
  const canNext = !max || nextEdge <= max.slice(0, 7);
  const shown = display(value);

  return (
    <div className="date-input">
      <button
        id={id}
        ref={btnRef}
        type="button"
        className={`${className} date-input__btn ${open ? 'date-input__btn--open' : ''}`}
        onClick={toggle}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className={shown ? '' : 'date-input__empty'}>{shown || placeholder}</span>
        <svg className="date-input__icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"
          fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3.5" y="5" width="17" height="15.5" rx="3" /><path d="M3.5 10h17M8 3v4M16 3v4" />
        </svg>
      </button>
      {required && (
        <input className="sel__native" tabIndex={-1} aria-hidden="true" value={value ?? ''} required onChange={() => {}}
          onFocus={() => btnRef.current?.focus()} />
      )}

      {open && pos && createPortal(
        <div
          ref={popRef}
          className="dp__pop date-input__pop"
          style={{ left: pos.left, top: pos.top, bottom: pos.bottom }}
          role="dialog"
          aria-label="Выбор даты"
        >
          <div className="dp__head">
            <button type="button" className="dp__arrow" disabled={!canPrev} onClick={() => setView(shiftMonth(view, -step))} aria-label="Назад">←</button>
            <button type="button" className="dp__title" onClick={() => setMonthList(!monthList)}>
              {monthList ? vy : `${MONTHS[vm - 1]} ${vy}`} <span aria-hidden="true">›</span>
            </button>
            <button type="button" className="dp__arrow" disabled={!canNext} onClick={() => setView(shiftMonth(view, step))} aria-label="Вперёд">→</button>
          </div>

          {monthList ? (
            <div className="dp__months">
              {MONTHS_SHORT.map((name, i) => {
                const month = `${vy}-${pad(i + 1)}`;
                return (
                  <button
                    key={month}
                    type="button"
                    disabled={monthOut(month)}
                    className={`dp__month ${value?.startsWith(month) ? 'dp__month--on' : ''}`}
                    onClick={() => { setView(month); setMonthList(false); }}
                  >{name}</button>
                );
              })}
            </div>
          ) : (
            <>
              <div className="dp__grid dp__grid--head">
                {(lang === 'uz' ? WEEKDAYS_UZ : WEEKDAYS).map((w) => <span key={w} data-no-translate>{w}</span>)}
              </div>
              <div className="dp__grid">
                {cells.map((day, i) => {
                  if (!day) return <span key={`e${i}`} />;
                  return (
                    <button
                      key={day}
                      type="button"
                      disabled={outOfRange(day)}
                      className={`dp__day ${day === value ? 'dp__day--on' : ''} ${day === today ? 'dp__day--today' : ''}`}
                      onClick={() => pick(day)}
                    >{Number(day.slice(8, 10))}</button>
                  );
                })}
              </div>
              <div className="dp__foot">
                {!required && value ? (
                  <button type="button" className="dp__all" onClick={() => pick('')}>Очистить</button>
                ) : <span />}
                <button type="button" className="dp__all" disabled={outOfRange(today)} onClick={() => pick(today)}>Сегодня</button>
              </div>
            </>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}
