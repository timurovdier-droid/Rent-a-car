import { useState } from 'react';
import { todayLocal, shiftDay } from '../labels';

function presets() {
  const today = todayLocal();
  const monthStart = `${today.slice(0, 7)}-01`;
  const prevEnd = shiftDay(monthStart, -1);
  const prevStart = `${prevEnd.slice(0, 7)}-01`;
  return [
    ['month', 'Этот месяц', monthStart, today],
    ['prev', 'Прошлый месяц', prevStart, prevEnd],
    ['7', '7 дней', shiftDay(today, -6), today],
    ['30', '30 дней', shiftDay(today, -29), today],
    ['year', 'С начала года', `${today.slice(0, 4)}-01-01`, today],
  ];
}

export function defaultPeriod() {
  const [, , from, to] = presets()[0];
  return { from, to };
}

export default function PeriodPicker({ value, onChange }) {
  const list = presets();
  const active = list.find(([, , from, to]) => from === value.from && to === value.to)?.[0];
  const [from, setFrom] = useState(value.from);
  const [to, setTo] = useState(value.to);

  function pick(f, t) {
    setFrom(f);
    setTo(t);
    onChange({ from: f, to: t });
  }

  return (
    <div className="period">
      <div className="chips" style={{ alignSelf: 'center' }}>
        {list.map(([key, label, f, t]) => (
          <button key={key} type="button" className={`chip ${active === key ? 'chip--on' : ''}`} onClick={() => pick(f, t)}>{label}</button>
        ))}
      </div>
      <form
        style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}
        onSubmit={(e) => { e.preventDefault(); if (from && to) onChange({ from, to }); }}
      >
        <div className="field">
          <label className="field__label" htmlFor="pp-from">С</label>
          <input id="pp-from" className="field__input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} required />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="pp-to">По</label>
          <input id="pp-to" className="field__input" type="date" value={to} onChange={(e) => setTo(e.target.value)} required />
        </div>
        <button className="btn btn--quiet" type="submit">Показать</button>
      </form>
    </div>
  );
}
