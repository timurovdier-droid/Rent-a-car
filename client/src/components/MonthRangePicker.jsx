import { useEffect, useRef, useState } from 'react';
import { todayLocal } from '../labels';

const WEEKDAYS = ['П', 'В', 'С', 'Ч', 'П', 'С', 'В'];
const MONTHS_SHORT = ['Янв.', 'Февр.', 'Март', 'Апр.', 'Май', 'Июнь', 'Июль', 'Авг.', 'Сент.', 'Окт.', 'Нояб.', 'Дек.'];
const MONTHS_GEN = ['янв.', 'февр.', 'марта', 'апр.', 'мая', 'июня', 'июля', 'авг.', 'сент.', 'окт.', 'нояб.', 'дек.'];
const MONTHS_LOWER = ['янв.', 'февр.', 'март', 'апр.', 'май', 'июнь', 'июль', 'авг.', 'сент.', 'окт.', 'нояб.', 'дек.'];

const pad = (n) => String(n).padStart(2, '0');

export function shiftMonth(month, delta) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

function daysIn(month) {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function wholeMonth(month, today = todayLocal()) {
  const last = `${month}-${pad(daysIn(month))}`;
  return { month, from: `${month}-01`, to: today < last && today.startsWith(month) ? today : last };
}

export function rangeLabel({ month, from, to }) {
  const [y, m] = month.split('-').map(Number);
  const a = Number(from.slice(8, 10));
  const b = Number(to.slice(8, 10));
  const full = a === 1 && (b === daysIn(month) || to === todayLocal());
  if (full) return `${MONTHS_LOWER[m - 1]} ${y} г.`;
  if (a === b) return `${a} ${MONTHS_GEN[m - 1]} ${y}`;
  return `${a}–${b} ${MONTHS_GEN[m - 1]} ${y}`;
}

export default function MonthRangePicker({ value, onChange }) {
  const today = todayLocal();
  const thisMonth = today.slice(0, 7);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(value.month);
  const [anchor, setAnchor] = useState(null);
  const [hover, setHover] = useState(null);
  const [monthList, setMonthList] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (!rootRef.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function toggle() {
    if (!open) {
      setView(value.month);
      setAnchor(null);
      setMonthList(false);
    }
    setOpen(!open);
  }

  function pickDay(day) {
    if (!anchor) {
      setAnchor(day);
      return;
    }
    const [from, to] = anchor <= day ? [anchor, day] : [day, anchor];
    setAnchor(null);
    setOpen(false);
    onChange({ month: view, from, to });
  }

  function pickMonth(month) {
    setOpen(false);
    onChange(wholeMonth(month, today));
  }

  const [vy, vm] = view.split('-').map(Number);
  const firstWeekday = (new Date(Date.UTC(vy, vm - 1, 1)).getUTCDay() + 6) % 7;
  const total = daysIn(view);
  const cells = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: total }, (_, i) => `${view}-${pad(i + 1)}`),
  ];

  let selFrom = null;
  let selTo = null;
  if (anchor) {
    const end = hover || anchor;
    [selFrom, selTo] = anchor <= end ? [anchor, end] : [end, anchor];
  } else if (value.month === view) {
    selFrom = value.from;
    selTo = value.to;
  }

  const canNext = view < thisMonth;
  const years = [vy - 1, vy];

  return (
    <div className="dp" ref={rootRef}>
      <button type="button" className="mf-month" onClick={toggle} aria-expanded={open} aria-haspopup="dialog">
        <span aria-hidden="true" className="mf-month__icon" />
        <span>{rangeLabel(value)}</span>
        <span aria-hidden="true" className={`dp__caret ${open ? 'dp__caret--up' : ''}`} />
      </button>

      {open && (
        <div className="dp__pop" role="dialog" aria-label="Выбор периода">
          <div className="dp__head">
            <button type="button" className="dp__arrow" onClick={() => setView(shiftMonth(view, monthList ? -12 : -1))} aria-label="Назад">←</button>
            <button type="button" className="dp__title" onClick={() => setMonthList(!monthList)}>
              {monthList ? vy : `${MONTHS_SHORT[vm - 1]} ${vy}`} <span aria-hidden="true">›</span>
            </button>
            <button
              type="button"
              className="dp__arrow"
              disabled={monthList ? vy >= Number(thisMonth.slice(0, 4)) : !canNext}
              onClick={() => setView(shiftMonth(view, monthList ? 12 : 1))}
              aria-label="Вперёд"
            >→</button>
          </div>

          {monthList ? (
            <div className="dp__months">
              {MONTHS_SHORT.map((name, i) => {
                const month = `${vy}-${pad(i + 1)}`;
                const future = month > thisMonth;
                return (
                  <button
                    key={month}
                    type="button"
                    disabled={future}
                    className={`dp__month ${value.month === month ? 'dp__month--on' : ''}`}
                    onClick={() => pickMonth(month)}
                  >{name}</button>
                );
              })}
              <div className="dp__years">
                {years.map((y) => (
                  <button key={y} type="button" className={`dp__year ${y === vy ? 'dp__year--on' : ''}`} onClick={() => setView(`${y}-${pad(vm)}`)}>{y}</button>
                ))}
              </div>
            </div>
          ) : (
            <>
              <div className="dp__grid dp__grid--head">
                {WEEKDAYS.map((w, i) => <span key={i}>{w}</span>)}
              </div>
              <div className="dp__grid" onMouseLeave={() => setHover(null)}>
                {cells.map((day, i) => {
                  if (!day) return <span key={`e${i}`} />;
                  const future = day > today;
                  const on = selFrom && day >= selFrom && day <= selTo;
                  return (
                    <button
                      key={day}
                      type="button"
                      disabled={future}
                      className={`dp__day ${on ? 'dp__day--on' : ''} ${day === today ? 'dp__day--today' : ''}`}
                      onClick={() => pickDay(day)}
                      onMouseEnter={() => anchor && setHover(day)}
                    >{Number(day.slice(8, 10))}</button>
                  );
                })}
              </div>
              <div className="dp__foot">
                <span className="dp__hint">{anchor ? 'Выберите последний день' : 'Нажмите на первый и последний день'}</span>
                <button type="button" className="dp__all" onClick={() => pickMonth(view)}>Весь месяц</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
