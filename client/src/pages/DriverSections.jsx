import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api';
import Plate from '../components/Plate';
import Modal from '../components/Modal';
import MoneyInput from '../components/MoneyInput';
import DateInput from '../components/DateInput';
import PeriodPicker from '../components/PeriodPicker';
import NavIcon from '../components/NavIcon';
import { fmtMoney, fmtNumber, fmtDay, todayLocal, FUEL_LABELS, SERVICE_TYPES } from '../labels';

const SERVICE_LABELS = Object.fromEntries(SERVICE_TYPES);

export const EXPENSE_KINDS = [
  ['FUEL', 'Бензин'],
  ['GAS', 'Газ'],
  ['CHARGE', 'Зарядка'],
  ['WASH', 'Мойка'],
  ['LUNCH', 'Обед'],
  ['OTHER', 'Другое'],
];
const EXPENSE_LABELS = Object.fromEntries(EXPENSE_KINDS);
const VOLUME_UNIT = { FUEL: 'л', GAS: 'м³', CHARGE: 'кВт·ч' };

function monthPeriod() {
  const to = todayLocal();
  return { from: `${to.slice(0, 7)}-01`, to };
}

function SectionHead({ title, sub, children }) {
  return (
    <div className="page-head dsec__head">
      <div>
        <Link to="/" className="dsec__back"><span aria-hidden="true">‹</span> Главная</Link>
        <h1 className="page-title">{title}</h1>
        {sub && <p className="page-sub">{sub}</p>}
      </div>
      {children}
    </div>
  );
}

function useLoad(path, deps = []) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    setError('');
    api.fresh(path)
      .then((d) => { if (alive) setData(d); })
      .catch((err) => { if (alive) setError(err.message || 'Не удалось загрузить'); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ...deps]);
  return [data, error];
}

function Row({ label, children }) {
  return <div><dt>{label}</dt><dd>{children ?? '—'}</dd></div>;
}

function expiryText(day, today) {
  if (!day) return '—';
  const left = Math.round((new Date(`${day}T00:00:00Z`) - new Date(`${today}T00:00:00Z`)) / 86400000);
  if (left < 0) return <span className="num-minus">{`${fmtDay(day)} · просрочено`}</span>;
  if (left <= 14) return <span className="dsec__warn">{`${fmtDay(day)} · осталось ${left} дн.`}</span>;
  return fmtDay(day);
}

export function DriverCarPage() {
  const [data, error] = useLoad('/me/car');
  if (error) return <div className="notice notice--error">{error}</div>;
  if (!data) return <div className="muted">Загрузка…</div>;
  const { car } = data;
  if (!car) {
    return (
      <div className="drv">
        <SectionHead title="Автомобиль" />
        <div className="empty">За вами сейчас нет машины. Обратитесь к диспетчеру.</div>
      </div>
    );
  }
  const photo = car.photo_version ? `/api/v1/me/car-photo?v=${car.photo_version}` : '/tiles/cars.webp';
  return (
    <div className="drv">
      <SectionHead title={`${car.brand} ${car.model}`} sub={`у вас с ${fmtDay(data.since)}`} />
      <div className="dsec__carpic">
        <img src={photo} alt="" className={car.photo_version ? 'dsec__carphoto' : ''} />
        <Plate value={car.plate} />
      </div>
      <div className="panel">
        <h3 className="panel__title">Машина</h3>
        <dl className="kv">
          <Row label="Марка и модель">{`${car.brand} ${car.model}`}</Row>
          <Row label="Год выпуска">{car.year}</Row>
          <Row label="Цвет">{car.color}</Row>
          <Row label="Топливо">{FUEL_LABELS[car.fuel_type] || car.fuel_type}</Row>
          <Row label="VIN">{car.vin}</Row>
          <Row label="Пробег">{car.mileage != null ? `${fmtNumber(car.mileage)} км` : null}</Row>
          <Row label="Аренда в день"><b>{`${fmtMoney(data.rate)} сум`}</b></Row>
        </dl>
      </div>
      <div className="panel" style={{ marginTop: 16 }}>
        <h3 className="panel__title">Документы</h3>
        <dl className="kv">
          <Row label="Страховка до">{expiryText(car.insurance_expires, data.today)}</Row>
          <Row label="Техосмотр до">{expiryText(car.inspection_expires, data.today)}</Row>
        </dl>
      </div>
      {data.services?.length > 0 && (
        <div className="panel" style={{ marginTop: 16 }}>
          <h3 className="panel__title">Ближайшее обслуживание</h3>
          <ul className="tx-list">
            {data.services.map((s) => (
              <li key={s.id} className="tx">
                <div>
                  <div className="tx__title">{SERVICE_LABELS[s.type] || s.type}</div>
                  <div className="tx__meta">
                    {[s.scheduled_at && `дата: ${fmtDay(s.scheduled_at)}`, s.due_mileage && `на ${fmtNumber(s.due_mileage)} км`, s.description]
                      .filter(Boolean).join(' · ') || 'дату сообщит диспетчер'}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="muted small">Если что-то с машиной не так — сразу позвоните диспетчеру.</p>
    </div>
  );
}

function mapLink(loc) {
  if (loc.map) return loc.map;
  return `https://yandex.uz/maps/?text=${encodeURIComponent(loc.address || loc.name || '')}`;
}

export function DriverContactsPage() {
  const [data, error] = useLoad('/me/contacts');
  if (error) return <div className="notice notice--error">{error}</div>;
  if (!data) return <div className="muted">Загрузка…</div>;
  const phones = (data.phones || []).filter((p) => p.phone);
  const locations = (data.locations || []).filter((l) => l.address || l.name);
  const empty = !phones.length && !locations.length && !data.telegram && !data.note;
  return (
    <div className="drv">
      <SectionHead title="Диспетчер" sub={data.company} />
      {empty && <div className="empty">Контакты ещё не заполнены. Администратор добавит их в настройках.</div>}
      {phones.length > 0 && (
        <div className="dsec__list">
          {phones.map((p, i) => (
            <a key={i} className="dsec__contact" href={`tel:${p.phone.replace(/[^\d+]/g, '')}`}>
              <span className="dsec__icon dsec__icon--call"><NavIcon name="headset" size={22} /></span>
              <span className="dsec__text"><b>{p.label || 'Диспетчер'}</b><span>{p.phone}</span></span>
              <span className="dsec__action">Позвонить</span>
            </a>
          ))}
        </div>
      )}
      {data.telegram && (
        <div className="dsec__list">
          <a className="dsec__contact" href={data.telegram.startsWith('http') ? data.telegram : `https://t.me/${data.telegram.replace(/^@/, '')}`} target="_blank" rel="noreferrer">
            <span className="dsec__icon dsec__icon--tg">✈</span>
            <span className="dsec__text"><b>Telegram</b><span>{data.telegram}</span></span>
            <span className="dsec__action">Написать</span>
          </a>
        </div>
      )}
      {locations.length > 0 && (
        <>
          <h2 className="drv__title">Где мы находимся</h2>
          <div className="dsec__list">
            {locations.map((l, i) => (
              <a key={i} className="dsec__contact" href={mapLink(l)} target="_blank" rel="noreferrer">
                <span className="dsec__icon dsec__icon--map"><NavIcon name="home" size={22} /></span>
                <span className="dsec__text">
                  <b>{l.name || 'Офис'}</b>
                  <span>{[l.address, l.hours].filter(Boolean).join(' · ')}</span>
                </span>
                <span className="dsec__action">Карта</span>
              </a>
            ))}
          </div>
        </>
      )}
      {data.note && <div className="panel dsec__note">{data.note}</div>}
    </div>
  );
}

function nowTime() {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tashkent', hour: '2-digit', minute: '2-digit' }).format(new Date());
}

function shiftDay(day, n) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const WEEKDAYS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

function CountUp({ value, format = fmtNumber, suffix = '' }) {
  const [shown, setShown] = useState(0);
  const current = useRef(0);
  useEffect(() => {
    const start = current.current;
    const t0 = performance.now();
    let raf;
    const step = (t) => {
      const p = Math.min(1, (t - t0) / 800);
      const v = Math.round(start + (value - start) * (1 - (1 - p) ** 3));
      current.current = v;
      setShown(v);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{format(shown)}{suffix}</>;
}

function signedMoney(v) {
  return `${v < 0 ? '−' : ''}${fmtMoney(Math.abs(v))}`;
}

function buzz() {
  if (navigator.vibrate) navigator.vibrate(25);
}

function SavedToast({ text, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2600);
    return () => clearTimeout(t);
  }, [text, onDone]);
  return (
    <div className="stoast" role="status">
      <span className="stoast__check" aria-hidden="true">✓</span>
      {text}
    </div>
  );
}

function SectionHero({ img, label, value, hint, action, onAction }) {
  const [pops, setPops] = useState(0);
  return (
    <>
      <div className="shero">
        <div className="shero__text">
          <span className="shero__label">{label}</span>
          <b className="shero__value">{value}</b>
          {hint && <span className="shero__hint">{hint}</span>}
        </div>
        <img
          key={pops}
          className={`shero__img ${pops ? 'shero__img--pop' : ''}`}
          src={`/tiles/${img}.webp`}
          alt=""
          onClick={() => { setPops((p) => p + 1); buzz(); }}
        />
      </div>
      {action && <button type="button" className="btn shero__btn" onClick={onAction}><span aria-hidden="true">+</span>{action}</button>}
    </>
  );
}

function EmptyBlock({ img, title, text }) {
  return (
    <div className="eempty">
      <img src={`/tiles/${img}.webp`} alt="" />
      <b>{title}</b>
      <span>{text}</span>
    </div>
  );
}

function EntryItem({ icon, img, title, meta, onDelete, index = 0 }) {
  return (
    <li className="eitem" style={{ '--i': Math.min(index, 10) }}>
      <span className="eitem__icon">{img ? <img src={`/tiles/${img}.webp`} alt="" /> : icon}</span>
      <div className="eitem__body">
        <b>{title}</b>
        <span>{meta}</span>
      </div>
      {onDelete && <button type="button" className="eitem__del" onClick={onDelete} aria-label="Удалить">×</button>}
    </li>
  );
}

function whenText(day, time) {
  return time ? `${fmtDay(day)}, ${time}` : fmtDay(day);
}

function OdoDisplay({ value, ghost, onClick }) {
  const empty = !value;
  const digits = String((empty ? ghost : value) || '').replace(/\D/g, '');
  const padded = digits.padStart(Math.max(6, digits.length), '0');
  const lead = padded.length - digits.length;
  return (
    <button type="button" className={`odo ${empty ? 'odo--ghost' : ''}`} onClick={onClick} tabIndex={-1} aria-hidden="true">
      {padded.split('').map((d, i) => (
        <span key={padded.length - i} className={`odo__cell ${i < lead ? 'odo__cell--lead' : ''}`}>
          <span className="odo__strip" style={{ transform: `translateY(${-Number(d) * 10}%)` }}>
            {'0123456789'.split('').map((n) => <span key={n}>{n}</span>)}
          </span>
        </span>
      ))}
      <span className="odo__unit">км</span>
    </button>
  );
}

function KmGauge({ km }) {
  const max = km > 500 ? Math.ceil(km / 100) * 100 : 500;
  const share = Math.max(0, Math.min(1, km / max));
  const arc = 'M15 100 A85 85 0 0 1 185 100';
  return (
    <div className="kgauge">
      <svg viewBox="0 0 200 108" aria-hidden="true">
        <path d={arc} className="kgauge__track" pathLength="100" />
        <path d={arc} className="kgauge__fill" pathLength="100" style={{ strokeDasharray: `${share * 100} 200`, opacity: share ? 1 : 0 }} />
        <g className="kgauge__needle" style={{ transform: `rotate(${share * 180 - 90}deg)` }}>
          <line x1="100" y1="100" x2="100" y2="28" />
          <circle cx="100" cy="100" r="8" />
        </g>
      </svg>
      <div className="kgauge__text">
        <b>{fmtNumber(km)}</b>
        <span>км проехали</span>
      </div>
    </div>
  );
}

const CONFETTI = ['#FF5A00', '#0A0A0A', '#FF5A00', '#0A0A0A', '#FFFFFF', '#FF5A00'];

function SavedBurst({ line }) {
  return (
    <div className="msuccess" role="status">
      <div className="msuccess__confetti" aria-hidden="true">
        {Array.from({ length: 18 }, (_, i) => (
          <span
            key={i}
            style={{
              '--x': `${(((i * 37) % 100) - 50) * 3}px`,
              '--r': `${(i * 67) % 360}deg`,
              '--d': `${(i % 6) * 60}ms`,
              background: CONFETTI[i % CONFETTI.length],
            }}
          />
        ))}
      </div>
      <div className="msuccess__check">✓</div>
      <b className="msuccess__title">Записано!</b>
      <span className="msuccess__km">{line}</span>
    </div>
  );
}

function MileageModal({ last, onClose, onSaved }) {
  const [day, setDay] = useState(todayLocal());
  const [time, setTime] = useState(nowTime());
  const [odometer, setOdometer] = useState('');
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(null);
  const km = last != null && odometer ? Number(odometer) - last : null;

  const today = todayLocal();
  const yesterday = shiftDay(today, -1);

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.post('/me/mileage', { date: day, time, odometer, comment });
      buzz();
      const driven = km != null && km > 0 ? km : null;
      setDone({ km: driven });
      setTimeout(() => onSaved(driven), 1500);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось сохранить');
      setSaving(false);
    }
  }

  if (done) {
    return (
      <Modal title="Записать пробег" onClose={() => onSaved(done.km)}>
        <SavedBurst line={done.km ? `+${fmtNumber(done.km)} км` : 'Пробег сохранён'} />
      </Modal>
    );
  }

  return (
    <Modal title="Записать пробег" onClose={onClose}>
      <form onSubmit={submit}>
        <OdoDisplay value={odometer} ghost={last} onClick={() => document.getElementById('ml-odo')?.focus()} />
        <div className="field">
          <label className="field__label" htmlFor="ml-odo">Пробег по одометру *</label>
          <MoneyInput id="ml-odo" value={odometer} onChange={setOdometer} suffix="км" required autoFocus placeholder={last != null ? fmtNumber(last) : '0'} />
          {last != null && (
            <>
              <div className="qchips">
                {[50, 100, 200, 300].map((n) => (
                  <button key={n} type="button" className="qchip" onClick={() => { setOdometer(String(last + n)); buzz(); }}>{`+${n}`}</button>
                ))}
              </div>
              <p className="muted small" style={{ margin: '8px 0 0' }}>{`Прошлая запись: ${fmtNumber(last)} км`}</p>
            </>
          )}
          {last != null && (km == null || km >= 0) && <KmGauge km={km || 0} />}
          {km != null && km < 0 && (
            <div key="bad" className="kmbadge kmbadge--bad">{`Меньше прошлой записи на ${fmtNumber(-km)} км`}</div>
          )}
        </div>
        <div className="field">
          <span className="field__label">Дата</span>
          <div className="qchips qchips--top">
            <button type="button" className={`qchip ${day === today ? 'qchip--on' : ''}`} onClick={() => setDay(today)}>Сегодня</button>
            <button type="button" className={`qchip ${day === yesterday ? 'qchip--on' : ''}`} onClick={() => setDay(yesterday)}>Вчера</button>
          </div>
          <DateInput id="ml-day" className="field__input" value={day} max={today} onChange={(e) => setDay(e.target.value)} required />
        </div>
        <div className="field">
          <span className="field__label">Время</span>
          <div className="time-row">
            <input id="ml-time" type="time" className="field__input" value={time} onChange={(e) => setTime(e.target.value)} required aria-label="Время" />
            <button type="button" className="qchip" onClick={() => setTime(nowTime())}>Сейчас</button>
          </div>
        </div>
        <div className="field">
          <label className="field__label" htmlFor="ml-comment">Комментарий</label>
          <input id="ml-comment" className="field__input" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={300} placeholder="если нужно" />
        </div>
        {error && <div className="notice notice--error">{error}</div>}
        <div className="form-actions form-actions--big">
          <button className="btn" type="submit" disabled={saving}>{saving ? 'Сохраняю…' : 'Сохранить'}</button>
          <button className="btn btn--quiet" type="button" onClick={onClose}>Отмена</button>
        </div>
      </form>
    </Modal>
  );
}

async function removeEntry(path, text, reload) {
  if (!window.confirm(text)) return;
  try {
    await api.delete(path);
    reload();
  } catch (err) {
    window.alert(err.message || 'Не получилось');
  }
}

export function DriverMileagePage() {
  const [period, setPeriod] = useState(monthPeriod);
  const [version, setVersion] = useState(0);
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState('');
  const [picked, setPicked] = useState(null);
  const today = todayLocal();
  const [data, error] = useLoad(`/me/mileage?from=${period.from}&to=${period.to}`, [version]);
  const [week] = useLoad(`/me/mileage?from=${shiftDay(today, -7)}&to=${today}`, [version]);
  const rows = data?.rows || [];
  const totalKm = rows.reduce((s, r) => s + (r.km || 0), 0);
  const shown = picked ? (week?.rows || []).filter((r) => r.day === picked) : rows;
  const reload = () => setVersion((v) => v + 1);
  const hideToast = useCallback(() => setToast(''), []);

  return (
    <div className="drv">
      <SectionHead title="Пробег" />
      <SectionHero
        img="mileage"
        label="Сейчас на одометре"
        value={data?.last_odometer != null ? <CountUp value={data.last_odometer} suffix=" км" /> : '— км'}
        hint={rows.length ? <>за период проехали <CountUp value={totalKm} suffix=" км" /></> : 'запишите пробег в конце смены'}
        action="Записать пробег"
        onAction={() => setOpen(true)}
      />
      {week && <MileageWeek rows={week.rows} today={today} picked={picked} onPick={(d) => { setPicked(d); buzz(); }} />}
      {!picked && <PeriodPicker value={period} onChange={setPeriod} />}
      {picked && (
        <div className="picked">
          <span>{`Записи за ${fmtDay(picked)}`}</span>
          <button type="button" className="qchip" onClick={() => setPicked(null)}>Показать все</button>
        </div>
      )}
      {error && <div className="notice notice--error">{error}</div>}
      {data && !shown.length && (
        picked
          ? <p className="muted" style={{ textAlign: 'center', margin: '20px 0' }}>В этот день записей нет</p>
          : <EmptyBlock img="mileage" title="Записей пока нет" text="Посмотрите на одометр и нажмите «Записать пробег»" />
      )}
      {shown.length > 0 && (
        <ul className="elist" key={picked || period.from + period.to}>
          {shown.map((r, i) => (
            <EntryItem
              key={r.id}
              index={i}
              img="mileage"
              title={<>{`${fmtNumber(r.odometer)} км`}{r.km != null && <span className="eitem__plus">{` +${fmtNumber(r.km)}`}</span>}</>}
              meta={[whenText(r.day, r.time), r.comment].filter(Boolean).join(' · ')}
              onDelete={() => removeEntry(`/me/mileage/${r.id}`, 'Удалить запись пробега?', reload)}
            />
          ))}
        </ul>
      )}
      {open && (
        <MileageModal
          last={data?.last_odometer ?? null}
          onClose={() => setOpen(false)}
          onSaved={(km) => { setOpen(false); setPicked(null); setToast(km ? `Пробег записан · +${fmtNumber(km)} км` : 'Пробег записан'); reload(); }}
        />
      )}
      {toast && <SavedToast text={toast} onDone={hideToast} />}
    </div>
  );
}

function MileageWeek({ rows, today, picked, onPick }) {
  const days = Array.from({ length: 7 }, (_, i) => shiftDay(today, i - 6));
  const km = Object.fromEntries(days.map((d) => [d, 0]));
  rows.forEach((r) => { if (r.km && km[r.day] != null) km[r.day] += r.km; });
  const total = days.reduce((s, d) => s + km[d], 0);
  const max = Math.max(1, ...days.map((d) => km[d]));

  return (
    <div className="mweek">
      <div className="mweek__head">
        <b>За 7 дней</b>
        <span><CountUp value={total} suffix=" км" /></span>
      </div>
      <div className={`mweek__bars ${picked ? 'mweek__bars--picked' : ''}`}>
        {days.map((d, i) => (
          <button
            key={d}
            type="button"
            className={`mweek__bar ${picked === d ? 'mweek__bar--on' : ''} ${d === today ? 'mweek__bar--today' : ''}`}
            onClick={() => onPick(picked === d ? null : d)}
            aria-label={`${fmtDay(d)}: ${fmtNumber(km[d])} км`}
          >
            <span className="mweek__val">{km[d] ? fmtNumber(km[d]) : ''}</span>
            <span className="mweek__col">
              <span style={{ height: `${Math.max(6, (km[d] / max) * 100)}%`, animationDelay: `${i * 50}ms` }} className={km[d] ? '' : 'mweek__empty'} />
            </span>
            <span className="mweek__day">{d === today ? 'Сег' : WEEKDAYS[new Date(`${d}T00:00:00Z`).getUTCDay()]}</span>
          </button>
        ))}
      </div>
      <p className="mweek__hint">Нажмите на день, чтобы увидеть его записи</p>
    </div>
  );
}

function entriesWord(n) {
  const d = n % 10;
  const dd = n % 100;
  if (d === 1 && dd !== 11) return 'запись';
  if (d >= 2 && d <= 4 && (dd < 12 || dd > 14)) return 'записи';
  return 'записей';
}

const EXPENSE_ICONS = { FUEL: '⛽', GAS: '🔥', CHARGE: '⚡', WASH: '🚿', LUNCH: '🍔', OTHER: '🧾' };
const TANK_SIZE = { FUEL: 60, GAS: 30, CHARGE: 75 };
const VOLUME_CHIPS = { FUEL: [10, 20, 30, 40], GAS: [5, 10, 15, 20], CHARGE: [10, 20, 40, 60] };

function ExpenseModal({ onClose, onSaved }) {
  const [kind, setKind] = useState('FUEL');
  const [amount, setAmount] = useState('');
  const [volume, setVolume] = useState('');
  const [odometer, setOdometer] = useState('');
  const [day, setDay] = useState(todayLocal());
  const [time, setTime] = useState(nowTime());
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(null);
  const unit = VOLUME_UNIT[kind];
  const today = todayLocal();
  const yesterday = shiftDay(today, -1);
  const sum = Number(amount) || 0;
  const vol = Number(String(volume).replace(',', '.')) || 0;
  const perUnit = unit && sum && vol ? Math.round(sum / vol) : null;
  const tank = TANK_SIZE[kind];

  function pickKind(value) {
    setKind(value);
    if (!VOLUME_UNIT[value]) setVolume('');
    buzz();
  }

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.post('/me/expenses', { kind, amount, volume: unit ? volume : '', odometer: kind === 'LUNCH' ? '' : odometer, date: day, time, comment });
      buzz();
      const line = `${EXPENSE_ICONS[kind]} −${fmtMoney(sum)} сум`;
      setDone({ line });
      setTimeout(() => onSaved(line), 1500);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось сохранить');
      setSaving(false);
    }
  }

  if (done) {
    return (
      <Modal title="Записать расход" onClose={() => onSaved(done.line)}>
        <SavedBurst line={done.line} />
      </Modal>
    );
  }

  return (
    <Modal title="Записать расход" onClose={onClose}>
      <form onSubmit={submit}>
        <div className={`xhead xhead--${kind.toLowerCase()}`}>
          <span key={kind} className="xhead__icon">{EXPENSE_ICONS[kind]}</span>
          <div className="xhead__text">
            <span className="xhead__kind">{EXPENSE_LABELS[kind]}</span>
            <b className={`xhead__sum ${sum ? '' : 'xhead__sum--empty'}`}><CountUp value={sum} format={fmtMoney} suffix=" сум" /></b>
            {perUnit != null && <span className="xhead__per">{`≈ ${fmtMoney(perUnit)} сум за 1 ${unit}`}</span>}
          </div>
        </div>
        <div className="field">
          <span className="field__label">Что оплатили</span>
          <div className="kind-grid">
            {EXPENSE_KINDS.map(([value, label]) => (
              <button key={value} type="button" className={`kind-btn ${kind === value ? 'kind-btn--on' : ''}`} onClick={() => pickKind(value)}>
                <span key={kind === value ? 'on' : 'off'} className="kind-btn__icon">{EXPENSE_ICONS[value]}</span>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label className="field__label" htmlFor="ex-amount">Сумма *</label>
          <MoneyInput id="ex-amount" value={amount} onChange={setAmount} required />
          <div className="qchips">
            {[10000, 50000, 100000].map((n) => (
              <button key={n} type="button" className="qchip" onClick={() => { setAmount(String(sum + n)); buzz(); }}>{`+${fmtMoney(n)}`}</button>
            ))}
            {sum > 0 && <button type="button" className="qchip qchip--ghost" onClick={() => setAmount('')}>Сброс</button>}
          </div>
        </div>
        {unit && (
          <div className="field">
            <label className="field__label" htmlFor="ex-volume">{`Сколько (${unit})`}</label>
            <input id="ex-volume" className="field__input" inputMode="decimal" value={volume} onChange={(e) => setVolume(e.target.value.replace(/[^\d.,]/g, ''))} placeholder="необязательно" />
            <div className="qchips">
              {VOLUME_CHIPS[kind].map((n) => (
                <button key={n} type="button" className={`qchip ${vol === n ? 'qchip--on' : ''}`} onClick={() => { setVolume(String(n)); buzz(); }}>{`${n} ${unit}`}</button>
              ))}
            </div>
            <div className="tank" aria-hidden="true">
              <div className={`tank__fill tank__fill--${kind.toLowerCase()}`} style={{ width: `${Math.min(100, (vol / tank) * 100)}%` }} />
              <span className="tank__label">{vol ? `${fmtNumber(vol)} ${unit}` : 'бак'}</span>
            </div>
          </div>
        )}
        {kind !== 'LUNCH' && (
          <div className="field">
            <label className="field__label" htmlFor="ex-odo">Пробег сейчас</label>
            <MoneyInput id="ex-odo" value={odometer} onChange={setOdometer} suffix="км" />
          </div>
        )}
        <div className="field">
          <span className="field__label">Дата</span>
          <div className="qchips qchips--top">
            <button type="button" className={`qchip ${day === today ? 'qchip--on' : ''}`} onClick={() => setDay(today)}>Сегодня</button>
            <button type="button" className={`qchip ${day === yesterday ? 'qchip--on' : ''}`} onClick={() => setDay(yesterday)}>Вчера</button>
          </div>
          <DateInput id="ex-day" className="field__input" value={day} max={today} onChange={(e) => setDay(e.target.value)} required />
        </div>
        <div className="field">
          <span className="field__label">Время</span>
          <div className="time-row">
            <input id="ex-time" type="time" className="field__input" value={time} onChange={(e) => setTime(e.target.value)} required aria-label="Время" />
            <button type="button" className="qchip" onClick={() => setTime(nowTime())}>Сейчас</button>
          </div>
        </div>
        <div className="field">
          <label className="field__label" htmlFor="ex-comment">Комментарий</label>
          <input id="ex-comment" className="field__input" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={300} placeholder="если нужно" />
        </div>
        {error && <div className="notice notice--error">{error}</div>}
        <div className="form-actions form-actions--big">
          <button className="btn" type="submit" disabled={saving}>{saving ? 'Сохраняю…' : 'Сохранить'}</button>
          <button className="btn btn--quiet" type="button" onClick={onClose}>Отмена</button>
        </div>
      </form>
    </Modal>
  );
}

export function DriverExpensesPage() {
  const [period, setPeriod] = useState(monthPeriod);
  const [version, setVersion] = useState(0);
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState('');
  const [data, error] = useLoad(`/me/expenses?from=${period.from}&to=${period.to}`, [version]);
  const rows = data?.rows || [];
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const reload = () => setVersion((v) => v + 1);
  const hideToast = useCallback(() => setToast(''), []);

  return (
    <div className="drv">
      <SectionHead title="Заправка и зарядка" />
      <SectionHero
        img="fuel"
        label="Потрачено за период"
        value={<CountUp value={total} format={fmtMoney} suffix=" сум" />}
        hint={rows.length ? `${rows.length} ${entriesWord(rows.length)}` : 'записывайте каждую заправку'}
        action="Записать расход"
        onAction={() => setOpen(true)}
      />
      <PeriodPicker value={period} onChange={setPeriod} />
      {error && <div className="notice notice--error">{error}</div>}
      {data && !rows.length && <EmptyBlock img="fuel" title="Расходов пока нет" text="Заправились или зарядились — нажмите «Записать расход»" />}
      {rows.length > 0 && (
        <ul className="elist">
          {rows.map((r, i) => (
            <EntryItem
              key={r.id}
              index={i}
              icon={EXPENSE_ICONS[r.kind] || '🧾'}
              title={`${EXPENSE_LABELS[r.kind] || r.kind} · ${fmtMoney(r.amount)} сум`}
              meta={[
                whenText(r.day, r.time),
                r.volume ? `${fmtNumber(r.volume)} ${VOLUME_UNIT[r.kind] || ''}` : null,
                r.odometer ? `пробег ${fmtNumber(r.odometer)} км` : null,
                r.comment,
              ].filter(Boolean).join(' · ')}
              onDelete={() => removeEntry(`/me/expenses/${r.id}`, 'Удалить этот расход?', reload)}
            />
          ))}
        </ul>
      )}
      {open && <ExpenseModal onClose={() => setOpen(false)} onSaved={(line) => { setOpen(false); setToast(`Расход записан · ${line}`); reload(); }} />}
      {toast && <SavedToast text={toast} onDone={hideToast} />}
    </div>
  );
}

function IncomeModal({ onClose, onSaved }) {
  const [amount, setAmount] = useState('');
  const [day, setDay] = useState(todayLocal());
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.post('/me/income', { amount, date: day, comment });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось сохранить');
      setSaving(false);
    }
  }

  return (
    <Modal title="Записать заработок" onClose={onClose}>
      <form onSubmit={submit}>
        <p className="muted" style={{ marginTop: 0 }}>Сколько вы заработали за день. Это видите только вы.</p>
        <div className="field">
          <label className="field__label" htmlFor="in-amount">Сумма *</label>
          <MoneyInput id="in-amount" value={amount} onChange={setAmount} required autoFocus />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="in-day">Дата</label>
          <DateInput id="in-day" className="field__input" value={day} max={todayLocal()} onChange={(e) => setDay(e.target.value)} required />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="in-comment">Комментарий</label>
          <input id="in-comment" className="field__input" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={300} placeholder="например: Яндекс Такси" />
        </div>
        {error && <div className="notice notice--error">{error}</div>}
        <div className="form-actions form-actions--big">
          <button className="btn" type="submit" disabled={saving}>{saving ? 'Сохраняю…' : 'Сохранить'}</button>
          <button className="btn btn--quiet" type="button" onClick={onClose}>Отмена</button>
        </div>
      </form>
    </Modal>
  );
}

export function DriverEarningsPage() {
  const [period, setPeriod] = useState(monthPeriod);
  const [version, setVersion] = useState(0);
  const [open, setOpen] = useState(null);
  const [toast, setToast] = useState('');
  const [data, error] = useLoad(`/me/report?from=${period.from}&to=${period.to}`, [version]);
  const [income] = useLoad(`/me/income?from=${period.from}&to=${period.to}`, [version]);
  const [spent] = useLoad(`/me/expenses?from=${period.from}&to=${period.to}`, [version]);
  const reload = () => setVersion((v) => v + 1);
  const hideToast = useCallback(() => setToast(''), []);
  const net = data?.net ?? 0;
  const history = [
    ...(income?.rows || []).map((r) => ({ ...r, type: 'in' })),
    ...(spent?.rows || []).map((r) => ({ ...r, type: 'out' })),
  ].sort((a, b) => (b.day + (b.time || '')).localeCompare(a.day + (a.time || '')) || b.id - a.id);

  return (
    <div className="drv">
      <SectionHead title="Мой заработок" />
      <SectionHero
        img="earnings"
        label="Чистыми за период"
        value={data ? <CountUp value={net} format={signedMoney} suffix=" сум" /> : '…'}
        hint={data?.net_per_day != null ? `в среднем ${fmtMoney(data.net_per_day)} сум в день` : 'заработок минус расходы'}
      />
      <div className="earn-actions">
        <button type="button" className="btn shero__btn earn-actions__in" onClick={() => setOpen('in')}><span aria-hidden="true">+</span>Заработок</button>
        <button type="button" className="btn shero__btn earn-actions__out" onClick={() => setOpen('out')}><span aria-hidden="true">−</span>Расход</button>
      </div>
      <PeriodPicker value={period} onChange={setPeriod} />
      {error && <div className="notice notice--error">{error}</div>}
      {data && (
        <>
          <div className="panel">
            <dl className="kv dnet__calc">
              <div><dt>Заработали</dt><dd className="num-plus">{`+${fmtMoney(data.income)} сум`}</dd></div>
              <div>
                <dt>Расходы (заправка, обед…)</dt>
                <dd className="num-minus">{`−${fmtMoney(data.spent)} сум`}</dd>
              </div>
              {data.expenses.map((e) => (
                <div key={e.kind} className="dnet__sub">
                  <dt>{`${EXPENSE_ICONS[e.kind] || ''} ${EXPENSE_LABELS[e.kind] || e.kind}${e.count > 1 ? ` · ${e.count} раз` : ''}`}</dt>
                  <dd>{`−${fmtMoney(e.amount)} сум`}</dd>
                </div>
              ))}
              {!data.expenses.length && (
                <div className="dnet__sub">
                  <dt>Расходов пока нет</dt>
                  <dd><button type="button" className="link-btn" onClick={() => setOpen('out')}>записать</button></dd>
                </div>
              )}
              <div className="dnet__total"><dt>Итого чистыми</dt><dd>{`${net < 0 ? '−' : ''}${fmtMoney(Math.abs(net))} сум`}</dd></div>
            </dl>
          </div>

          <div className="dstats dstats--wrap" style={{ marginTop: 16 }}>
            <div className="dstat"><span className="dstat__label">Проехали</span><b className="dstat__value">{`${fmtNumber(data.km)} км`}</b></div>
            <div className="dstat"><span className="dstat__label">Рабочих дней</span><b className="dstat__value">{data.work_days}</b></div>
            {data.per_km != null && <div className="dstat"><span className="dstat__label">Расходы на 1 км</span><b className="dstat__value">{`${fmtMoney(data.per_km)} сум`}</b></div>}          </div>
        </>
      )}
      {history.length > 0 && (
        <>
          <h2 className="drv__title" style={{ marginTop: 20 }}>История</h2>
          <ul className="elist">
            {history.map((r, i) => (r.type === 'in' ? (
              <EntryItem
                key={`in${r.id}`}
                index={i}
                icon="💰"
                title={<span className="num-plus">{`+${fmtMoney(r.amount)} сум`}</span>}
                meta={['Заработок', fmtDay(r.day), r.comment].filter(Boolean).join(' · ')}
                onDelete={() => removeEntry(`/me/income/${r.id}`, 'Удалить эту запись заработка?', reload)}
              />
            ) : (
              <EntryItem
                key={`out${r.id}`}
                index={i}
                icon={EXPENSE_ICONS[r.kind] || '🧾'}
                title={<span className="num-minus">{`−${fmtMoney(r.amount)} сум`}</span>}
                meta={[EXPENSE_LABELS[r.kind] || r.kind, whenText(r.day, r.time), r.comment].filter(Boolean).join(' · ')}
                onDelete={() => removeEntry(`/me/expenses/${r.id}`, 'Удалить этот расход?', reload)}
              />
            )))}
          </ul>
        </>
      )}
      {income && spent && !history.length && data?.entries === 0 && (
        <EmptyBlock img="earnings" title="Записей пока нет" text="Записывайте заработок в конце дня и расходы на заправку — и увидите, сколько получилось чистыми" />
      )}
      {open === 'in' && <IncomeModal onClose={() => setOpen(null)} onSaved={() => { setOpen(null); setToast('Заработок записан'); reload(); }} />}
      {open === 'out' && <ExpenseModal onClose={() => setOpen(null)} onSaved={(line) => { setOpen(null); setToast(`Расход записан · ${line}`); reload(); }} />}
      {toast && <SavedToast text={toast} onDone={hideToast} />}
    </div>
  );
}
