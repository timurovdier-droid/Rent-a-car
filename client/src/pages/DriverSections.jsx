import { useEffect, useState } from 'react';
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

function MileageModal({ last, onClose, onSaved }) {
  const [day, setDay] = useState(todayLocal());
  const [odometer, setOdometer] = useState('');
  const [income, setIncome] = useState('');
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const km = last != null && odometer ? Number(odometer) - last : null;

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.post('/me/mileage', { date: day, odometer, income, comment });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось сохранить');
      setSaving(false);
    }
  }

  return (
    <Modal title="Записать пробег" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="field">
          <label className="field__label" htmlFor="ml-odo">Пробег по одометру *</label>
          <MoneyInput id="ml-odo" value={odometer} onChange={setOdometer} suffix="км" required autoFocus placeholder={last != null ? fmtNumber(last) : '0'} />
          {last != null && (
            <p className="muted small" style={{ margin: '6px 0 0' }}>
              {`Прошлая запись: ${fmtNumber(last)} км`}
              {km != null && km >= 0 && <b>{` · проехали ${fmtNumber(km)} км`}</b>}
            </p>
          )}
        </div>
        <div className="field">
          <label className="field__label" htmlFor="ml-income">Сколько заработали за день</label>
          <MoneyInput id="ml-income" value={income} onChange={setIncome} />
          <p className="muted small" style={{ margin: '6px 0 0' }}>Нужно для отчёта «сколько чистыми». Видите только вы.</p>
        </div>
        <div className="field">
          <label className="field__label" htmlFor="ml-day">Дата</label>
          <DateInput id="ml-day" className="field__input" value={day} max={todayLocal()} onChange={(e) => setDay(e.target.value)} required />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="ml-comment">Комментарий</label>
          <input id="ml-comment" className="field__input" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={300} />
        </div>
        {error && <div className="notice notice--error">{error}</div>}
        <div className="form-actions">
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
  const [data, error] = useLoad(`/me/mileage?from=${period.from}&to=${period.to}`, [version]);
  const rows = data?.rows || [];
  const totalKm = rows.reduce((s, r) => s + (r.km || 0), 0);
  const totalIncome = rows.reduce((s, r) => s + r.income, 0);

  return (
    <div className="drv">
      <SectionHead title="Пробег" sub="Записывайте пробег по одометру в конце смены">
        <button type="button" className="btn" onClick={() => setOpen(true)}>Записать пробег</button>
      </SectionHead>
      {data?.last_odometer != null && (
        <div className="dstats dstats--wrap">
          <div className="dstat"><span className="dstat__label">Сейчас на одометре</span><b className="dstat__value">{`${fmtNumber(data.last_odometer)} км`}</b></div>
          <div className="dstat"><span className="dstat__label">Проехали за период</span><b className="dstat__value">{`${fmtNumber(totalKm)} км`}</b></div>
          <div className="dstat dstat--ok"><span className="dstat__label">Заработали</span><b className="dstat__value">{`${fmtMoney(totalIncome)} сум`}</b></div>
        </div>
      )}
      <PeriodPicker value={period} onChange={setPeriod} />
      {error && <div className="notice notice--error">{error}</div>}
      {data && !rows.length && <div className="empty">За этот период записей нет. Нажмите «Записать пробег».</div>}
      {rows.length > 0 && (
        <ul className="tx-list panel">
          {rows.map((r) => (
            <li key={r.id} className="tx">
              <div>
                <div className="tx__title">{`${fmtNumber(r.odometer)} км`}{r.km != null && <span className="muted">{` · +${fmtNumber(r.km)} км`}</span>}</div>
                <div className="tx__meta">
                  {fmtDay(r.day)}
                  {r.income > 0 && ` · заработок ${fmtMoney(r.income)} сум`}
                  {r.comment ? ` · ${r.comment}` : ''}
                </div>
              </div>
              <div className="tx__right">
                <button type="button" className="btn btn--quiet btn--sm" onClick={() => removeEntry(`/me/mileage/${r.id}`, 'Удалить запись пробега?', () => setVersion((v) => v + 1))}>Удалить</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {open && (
        <MileageModal
          last={data?.last_odometer ?? null}
          onClose={() => setOpen(false)}
          onSaved={() => { setOpen(false); setVersion((v) => v + 1); }}
        />
      )}
    </div>
  );
}

function ExpenseModal({ onClose, onSaved }) {
  const [kind, setKind] = useState('FUEL');
  const [amount, setAmount] = useState('');
  const [volume, setVolume] = useState('');
  const [odometer, setOdometer] = useState('');
  const [day, setDay] = useState(todayLocal());
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const unit = VOLUME_UNIT[kind];

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.post('/me/expenses', { kind, amount, volume: unit ? volume : '', odometer, date: day, comment });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось сохранить');
      setSaving(false);
    }
  }

  return (
    <Modal title="Записать расход" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="field">
          <span className="field__label">Что оплатили</span>
          <div className="seg seg--wrap">
            {EXPENSE_KINDS.map(([value, label]) => (
              <button key={value} type="button" className={`seg__btn ${kind === value ? 'seg__btn--on' : ''}`} onClick={() => setKind(value)}>{label}</button>
            ))}
          </div>
        </div>
        <div className="field">
          <label className="field__label" htmlFor="ex-amount">Сумма *</label>
          <MoneyInput id="ex-amount" value={amount} onChange={setAmount} required autoFocus />
        </div>
        {unit && (
          <div className="field">
            <label className="field__label" htmlFor="ex-volume">{`Сколько (${unit})`}</label>
            <input id="ex-volume" className="field__input" inputMode="decimal" value={volume} onChange={(e) => setVolume(e.target.value.replace(/[^\d.,]/g, ''))} placeholder="необязательно" />
          </div>
        )}
        <div className="field">
          <label className="field__label" htmlFor="ex-odo">Пробег сейчас</label>
          <MoneyInput id="ex-odo" value={odometer} onChange={setOdometer} suffix="км" />
          <p className="muted small" style={{ margin: '6px 0 0' }}>Посмотрите на одометр — так видно, сколько проехали между заправками.</p>
        </div>
        <div className="field">
          <label className="field__label" htmlFor="ex-day">Дата</label>
          <DateInput id="ex-day" className="field__input" value={day} max={todayLocal()} onChange={(e) => setDay(e.target.value)} required />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="ex-comment">Комментарий</label>
          <input id="ex-comment" className="field__input" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={300} placeholder="например: АЗС на Чиланзаре" />
        </div>
        {error && <div className="notice notice--error">{error}</div>}
        <div className="form-actions">
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
  const [data, error] = useLoad(`/me/expenses?from=${period.from}&to=${period.to}`, [version]);
  const rows = data?.rows || [];
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const withOdo = rows.filter((r) => r.odometer).sort((a, b) => a.odometer - b.odometer);

  return (
    <div className="drv">
      <SectionHead title="Заправка и зарядка" sub="Записывайте каждую заправку, зарядку и мойку">
        <button type="button" className="btn" onClick={() => setOpen(true)}>Записать расход</button>
      </SectionHead>
      <div className="dstats dstats--wrap">
        <div className="dstat dstat--bad"><span className="dstat__label">Потрачено за период</span><b className="dstat__value">{`${fmtMoney(total)} сум`}</b></div>
        <div className="dstat"><span className="dstat__label">Записей</span><b className="dstat__value">{rows.length}</b></div>
        {withOdo.length > 1 && (
          <div className="dstat">
            <span className="dstat__label">Проехали между записями</span>
            <b className="dstat__value">{`${fmtNumber(withOdo[withOdo.length - 1].odometer - withOdo[0].odometer)} км`}</b>
          </div>
        )}
      </div>
      <PeriodPicker value={period} onChange={setPeriod} />
      {error && <div className="notice notice--error">{error}</div>}
      {data && !rows.length && <div className="empty">За этот период расходов нет.</div>}
      {rows.length > 0 && (
        <ul className="tx-list panel">
          {rows.map((r) => (
            <li key={r.id} className="tx">
              <div>
                <div className="tx__title">{`${EXPENSE_LABELS[r.kind] || r.kind} · ${fmtMoney(r.amount)} сум`}</div>
                <div className="tx__meta">
                  {fmtDay(r.day)}
                  {r.volume ? ` · ${fmtNumber(r.volume)} ${VOLUME_UNIT[r.kind] || ''}` : ''}
                  {r.odometer ? ` · пробег ${fmtNumber(r.odometer)} км` : ''}
                  {r.comment ? ` · ${r.comment}` : ''}
                </div>
              </div>
              <div className="tx__right">
                <button type="button" className="btn btn--quiet btn--sm" onClick={() => removeEntry(`/me/expenses/${r.id}`, 'Удалить этот расход?', () => setVersion((v) => v + 1))}>Удалить</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {open && <ExpenseModal onClose={() => setOpen(false)} onSaved={() => { setOpen(false); setVersion((v) => v + 1); }} />}
    </div>
  );
}

export function DriverEarningsPage() {
  const [period, setPeriod] = useState(monthPeriod);
  const [data, error] = useLoad(`/me/report?from=${period.from}&to=${period.to}`);

  return (
    <div className="drv">
      <SectionHead title="Мой заработок" sub="Сколько вы заработали чистыми: заработок минус аренда и расходы на машину" />
      <PeriodPicker value={period} onChange={setPeriod} />
      {error && <div className="notice notice--error">{error}</div>}
      {!data && !error && <div className="muted">Считаю…</div>}
      {data && (
        <>
          <div className={`dnet ${data.net < 0 ? 'dnet--minus' : ''}`}>
            <span className="dnet__label">Чистыми за период</span>
            <b className="dnet__value">{`${data.net < 0 ? '−' : ''}${fmtMoney(Math.abs(data.net))} сум`}</b>
            {data.net_per_day != null && <span className="dnet__hint">{`в среднем ${fmtMoney(data.net_per_day)} сум за рабочий день`}</span>}
          </div>

          <div className="panel">
            <dl className="kv dnet__calc">
              <div><dt>Заработали</dt><dd className="num-plus">{`+${fmtMoney(data.income)} сум`}</dd></div>
              <div><dt>Аренда машины</dt><dd className="num-minus">{`−${fmtMoney(data.rent)} сум`}</dd></div>
              {data.expenses.map((e) => (
                <div key={e.kind}>
                  <dt>{`${EXPENSE_LABELS[e.kind] || e.kind}${e.count > 1 ? ` (${e.count} раз)` : ''}`}</dt>
                  <dd className="num-minus">{`−${fmtMoney(e.amount)} сум`}</dd>
                </div>
              ))}
              <div className="dnet__total"><dt>Итого чистыми</dt><dd>{`${data.net < 0 ? '−' : ''}${fmtMoney(Math.abs(data.net))} сум`}</dd></div>
            </dl>
          </div>

          <div className="dstats dstats--wrap" style={{ marginTop: 16 }}>
            <div className="dstat"><span className="dstat__label">Проехали</span><b className="dstat__value">{`${fmtNumber(data.km)} км`}</b></div>
            <div className="dstat"><span className="dstat__label">Рабочих дней</span><b className="dstat__value">{data.work_days}</b></div>
            {data.per_km != null && <div className="dstat"><span className="dstat__label">Расходы на 1 км</span><b className="dstat__value">{`${fmtMoney(data.per_km)} сум`}</b></div>}
            <div className="dstat"><span className="dstat__label">Оплатили аренды</span><b className="dstat__value">{`${fmtMoney(data.rent_paid)} сум`}</b></div>
          </div>

          {data.entries === 0 && (
            <div className="notice notice--idle" style={{ marginTop: 16 }}>
              {'Чтобы видеть заработок, каждый день в разделе «Пробег» указывайте, сколько заработали. '}
              <Link to="/mileage">Записать пробег</Link>
            </div>
          )}
        </>
      )}
    </div>
  );
}
