import { shiftMonth } from './MonthRangePicker';

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

const pad = (n) => String(n).padStart(2, '0');

function daysIn(month) {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

// Календарь на месяц прямо на странице. dayClass(day) возвращает доп. классы для дня.
export default function DayCalendar({ month, onMonth, onPick, dayClass, today, max, label }) {
  const [y, m] = month.split('-').map(Number);
  const firstWeekday = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
  const cells = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysIn(month) }, (_, i) => `${month}-${pad(i + 1)}`),
  ];
  const canNext = !max || month < max.slice(0, 7);

  return (
    <div className="cal" role="group" aria-label={label}>
      <div className="cal__head">
        <button type="button" className="cal__arrow" onClick={() => onMonth(shiftMonth(month, -1))} aria-label="Предыдущий месяц">‹</button>
        <span className="cal__title">{MONTHS[m - 1]} {y}</span>
        <button type="button" className="cal__arrow" onClick={() => onMonth(shiftMonth(month, 1))} disabled={!canNext} aria-label="Следующий месяц">›</button>
      </div>
      <div className="cal__grid cal__grid--head">
        {WEEKDAYS.map((w) => <span key={w}>{w}</span>)}
      </div>
      <div className="cal__grid">
        {cells.map((day, i) => {
          if (!day) return <span key={`e${i}`} />;
          const disabled = Boolean(max && day > max);
          return (
            <button
              key={day}
              type="button"
              disabled={disabled}
              className={`cal__day ${day === today ? 'cal__day--today' : ''} ${dayClass ? dayClass(day) : ''}`}
              onClick={() => onPick(day)}
            >{Number(day.slice(8, 10))}</button>
          );
        })}
      </div>
    </div>
  );
}
