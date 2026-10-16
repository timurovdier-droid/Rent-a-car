import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api';
import { useAuth } from '../auth';
import Plate from '../components/Plate';
import Modal from '../components/Modal';
import MoneyInput from '../components/MoneyInput';
import DateInput from '../components/DateInput';
import PeriodPicker from '../components/PeriodPicker';
import { BrandLogo, CarVisual } from '../components/CarTile';
import { LedgerSummary, LedgerTable } from '../components/CarLedger';
import { RentStatusView } from '../components/RentStatus';
import useIsPhone from '../components/useIsPhone';
import PushCard from '../components/PushCard';
import { fmtMoney, fmtDay, fmtDateTime, todayLocal, shiftDay, CHARGE_LABELS, PAY_METHODS, METHOD_LABELS } from '../labels';

const HOUR = 60 * 60 * 1000;

const REQUEST_STATUS = {
  PENDING: ['badge--wait', 'Ждёт проверки'],
  CONFIRMED: ['badge--ok', 'Принято'],
  REJECTED: ['badge--danger', 'Отклонено'],
};

export function MyProfile({ profile }) {
  if (!profile) return null;
  return (
    <div className="panel" style={{ marginTop: 16 }}>
      <h3 className="panel__title">Мои данные</h3>
      <dl className="kv">
        <div><dt>ФИО</dt><dd>{profile.full_name}</dd></div>
        <div><dt>Телефон</dt><dd>{profile.phone || '—'}</dd></div>
        <div><dt>Водительское удостоверение</dt><dd>{profile.license_no || '—'}</dd></div>
        <div><dt>ВУ действует до</dt><dd>{profile.license_expires ? fmtDay(profile.license_expires) : '—'}</dd></div>
        <div><dt>Паспорт</dt><dd>{profile.passport || '—'}</dd></div>
        <div><dt>Депозит</dt><dd><b>{`${fmtMoney(profile.deposit)} сум`}</b></dd></div>
      </dl>
      <p className="muted small" style={{ marginBottom: 0 }}>Если что-то неверно — скажите диспетчеру, он исправит.</p>
    </div>
  );
}

function PayModal({ suggested, onClose, onSent }) {
  const [amount, setAmount] = useState(suggested > 0 ? String(suggested) : '');
  const [method, setMethod] = useState('CASH');
  const [day, setDay] = useState(todayLocal());
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.post('/me/payments', { amount, method, date: day, comment });
      onSent();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось отправить');
      setSaving(false);
    }
  }

  return (
    <Modal title="Сообщить об оплате" onClose={onClose}>
      <form onSubmit={submit}>
        <p className="muted" style={{ marginTop: 0 }}>Диспетчер проверит, что деньги пришли, и оплата попадёт в ваш учёт.</p>
        <div className="field">
          <label className="field__label" htmlFor="pay-amount">Сумма *</label>
          <MoneyInput id="pay-amount" value={amount} onChange={setAmount} required autoFocus />
        </div>
        <div className="field">
          <span className="field__label">Как оплатили</span>
          <div className="seg">
            {PAY_METHODS.map(([value, label]) => (
              <button key={value} type="button" className={`seg__btn ${method === value ? 'seg__btn--on' : ''}`} onClick={() => setMethod(value)}>{label}</button>
            ))}
          </div>
        </div>
        <div className="field">
          <label className="field__label" htmlFor="pay-day">Дата оплаты</label>
          <DateInput id="pay-day" className="field__input" value={day} max={todayLocal()} onChange={(e) => setDay(e.target.value)} required />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="pay-comment">Комментарий</label>
          <input id="pay-comment" className="field__input" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={300} placeholder="например: перевёл на карту Иванова" />
        </div>
        {error && <div className="notice notice--error">{error}</div>}
        <div className="form-actions">
          <button className="btn" type="submit" disabled={saving}>{saving ? 'Отправляю…' : 'Отправить'}</button>
          <button className="btn btn--quiet" type="button" onClick={onClose}>Отмена</button>
        </div>
      </form>
    </Modal>
  );
}

function MyPayments({ version, onChanged }) {
  const [list, setList] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/me/payments').then(setList).catch((err) => setError(err.message || 'Не удалось загрузить'));
  }, [version]);

  async function cancel(p) {
    if (!window.confirm(`Отменить оплату ${fmtMoney(p.amount)} сум?`)) return;
    try {
      await api.delete(`/me/payments/${p.id}`);
      onChanged();
    } catch (err) {
      setError(err.message || 'Не получилось');
    }
  }

  if (!list?.length && !error) return null;
  return (
    <div className="panel" style={{ marginTop: 16 }}>
      <h3 className="panel__title">Мои отправленные оплаты</h3>
      {error && <div className="notice notice--error">{error}</div>}
      <ul className="tx-list">
        {(list || []).map((p) => {
          const [cls, label] = REQUEST_STATUS[p.status] || ['badge--muted', p.status];
          return (
            <li key={p.id} className="tx">
              <div>
                <div className="tx__title">{`${fmtMoney(p.amount)} сум · ${METHOD_LABELS[p.method] || p.method}`}</div>
                <div className="tx__meta">
                  {`за ${fmtDay(p.day)} · отправлено ${fmtDateTime(p.created_at)}`}
                  {p.plate && <> · <Plate value={p.plate} /></>}
                  {p.comment ? ` · ${p.comment}` : ''}
                  {p.status === 'REJECTED' && p.reject_reason ? ` · Причина: ${p.reject_reason}` : ''}
                </div>
              </div>
              <div className="tx__right">
                <span className={`badge ${cls}`}>{label}</span>
                {p.status === 'PENDING' && (
                  <button type="button" className="btn btn--quiet btn--sm" onClick={() => cancel(p)}>Отменить</button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function OtherDebts({ charges }) {
  if (!charges?.length) return null;
  const total = charges.reduce((s, c) => s + c.left, 0);
  return (
    <div className="panel" style={{ marginTop: 16 }}>
      <div className="panel__head">
        <h3 className="panel__title" style={{ margin: 0 }}>Другие долги</h3>
        <b className="num-minus">{`${fmtMoney(total)} сум`}</b>
      </div>
      <ul className="charge-list">
        {charges.map((c) => (
          <li key={c.id} className="charge">
            <div className="charge__main">
              <div>
                <div className="charge__title">{CHARGE_LABELS[c.kind] || c.kind}</div>
                <div className="charge__meta">
                  {fmtDay(c.day)}
                  {c.plate && <> · <Plate value={c.plate} /></>}
                  {c.comment ? ` · ${c.comment}` : ''}
                </div>
              </div>
              <div className="charge__sum">
                <b className="num-minus">{fmtMoney(c.left)}</b>
                {c.paid > 0 && <span className="muted small">{`из ${fmtMoney(c.amount)}`}</span>}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
const REFRESH_MS = 15 * 60 * 1000;

function lastPeriod() {
  const to = todayLocal();
  return { from: shiftDay(to, -29), to };
}

// Напоминание о долге: сразу после входа, потом раз в час, пока страница открыта.
function useDebtReminder(userId, debt) {
  const [open, setOpen] = useState(false);
  const key = `rac-debt-reminded-at:${userId}`;
  const sessionKey = `rac-debt-reminded:${userId}`;

  useEffect(() => {
    if (!userId || !(debt > 0)) {
      setOpen(false);
      return undefined;
    }
    function check() {
      const last = Number(localStorage.getItem(key)) || 0;
      const fresh = !sessionStorage.getItem(sessionKey);
      if (!fresh && Date.now() - last < HOUR) return;
      localStorage.setItem(key, String(Date.now()));
      sessionStorage.setItem(sessionKey, '1');
      setOpen(true);
      if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
        try {
          new Notification('Оплатите аренду', { body: `Ваш долг: ${fmtMoney(debt)} сум`, tag: 'rac-debt' });
        } catch {
          // На некоторых телефонах уведомления из вкладки запрещены — хватит окна на странице.
        }
      }
    }
    check();
    const timer = setInterval(check, 60 * 1000);
    return () => clearInterval(timer);
  }, [userId, debt, key, sessionKey]);

  return [open, () => setOpen(false)];
}

function NotifyButton() {
  const supported = typeof window !== 'undefined' && 'Notification' in window;
  const [state, setState] = useState(supported ? Notification.permission : 'unsupported');
  if (state !== 'default') return null;
  return (
    <button
      type="button"
      className="btn btn--quiet"
      onClick={() => Notification.requestPermission().then(setState).catch(() => setState('denied'))}
    >
      Включить уведомления
    </button>
  );
}

function StatusCard({ tone = '', label, value, hint }) {
  return (
    <div className={`dstat ${tone ? `dstat--${tone}` : ''}`}>
      <span className="dstat__label">{label}</span>
      <b className="dstat__value">{value}</b>
      {hint && <span className="dstat__hint">{hint}</span>}
    </div>
  );
}

// Главная водителя на телефоне: машина в центре, статусы и плитки разделов.
function DriverHero({ data, debt, onPay }) {
  const { status, profile, car, today, since, rate } = data;
  const [pending, setPending] = useState(0);
  useEffect(() => {
    api.get('/me/payments')
      .then((list) => setPending(list.filter((p) => p.status === 'PENDING').length))
      .catch(() => {});
  }, []);
  const otherDebt = (data.charges || []).reduce((s, c) => s + c.left, 0);
  const overpaid = Number(status?.overpaid ?? data.overpaid ?? 0);
  const cards = [];

  if (car) {
    if (debt > 0) {
      cards.push({ tone: 'bad', label: 'Долг по аренде', value: `${fmtMoney(debt)} сум`, hint: status?.debt_from ? `с ${fmtDay(status.debt_from)}` : null });
    } else {
      const ahead = status?.ahead_until && status.ahead_until > today;
      cards.push({
        tone: 'ok',
        label: 'Аренда',
        value: ahead ? `до ${fmtDay(status.ahead_until)}` : overpaid > 0 ? `+${fmtMoney(overpaid)} сум` : 'Оплачено',
        hint: ahead || overpaid > 0 ? 'оплачено вперёд' : 'долгов нет',
      });
    }
    cards.push({ label: 'Аренда в день', value: `${fmtMoney(rate)} сум` });
  } else {
    cards.push({ tone: 'wait', label: 'Машина', value: 'Не выдана', hint: 'диспетчер закрепит автомобиль' });
  }
  if (pending > 0 || status?.pending > 0) {
    cards.push({ tone: 'wait', label: 'Ждут проверки', value: pending > 0 ? `${pending} опл.` : `${fmtMoney(status.pending)} сум`, hint: 'диспетчер проверяет' });
  }
  if (otherDebt > 0) cards.push({ tone: 'bad', label: 'Другие долги', value: `${fmtMoney(otherDebt)} сум`, hint: 'ремонт, штрафы' });
  if (profile) cards.push({ label: 'Депозит', value: `${fmtMoney(profile.deposit)} сум` });
  if (profile?.license_expires) cards.push({ label: 'ВУ действует до', value: fmtDay(profile.license_expires) });

  const photo = car?.photo_version ? `/api/v1/me/car-photo?v=${car.photo_version}` : null;

  return (
    <div className="dhero">
      <PushCard />

      <div className="dhero__car">
        {car ? (
          <>
            <Link to="/my-car" className="dhero__car-link">
              <article className="ct drv__car dhero__car-card">
                <div className="ct__visual ct__visual--hero">
                  <BrandLogo brand={car.brand} />
                  <CarVisual car={car} src={photo} />
                </div>
                <div className="ct__title">
                  <span className="ct__name">{car.brand} {car.model}</span>
                  {car.year && <span className="ct__year"> • {car.year}</span>}
                </div>
                <div className="ct__plate"><Plate value={car.plate} /></div>
              </article>
            </Link>
            {since && <p className="dhero__sub">{`${fmtDay(today)} · машина у вас с ${fmtDay(since)}`}</p>}
          </>
        ) : (
          <div className="dhero__car-empty">
            <CarVisual car={{ brand: '', model: '' }} />
            <p className="dhero__title">Машина не выдана</p>
            <p className="dhero__sub">Когда диспетчер закрепит автомобиль, здесь появятся аренда и оплаты.</p>
            <Link to="/contacts" className="btn btn--quiet">Контакты диспетчера</Link>
          </div>
        )}
      </div>

      {car && onPay && (
        <button type="button" className="btn dhero__pay" onClick={onPay}>Сообщить об оплате</button>
      )}

      <h2 className="dhero__subtitle">Мои статусы</h2>
      <div className="dstats">
        {cards.map((c) => <StatusCard key={c.label} {...c} />)}
      </div>

      <div className="mtiles dhero__tiles">
        {DRIVER_TILES.map((t) => (
          <Link key={t.to} to={t.to} className={`mtile ${t.wide ? 'mtile--wide' : ''}`}>
            <span className="mtile__card">
              <img className="mtile__img" src={`/tiles/${t.img}.webp${t.img === 'earnings' ? '?v=2' : ''}`} alt="" decoding="async" />
            </span>
            <span className="mtile__label">{t.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

const DRIVER_TILES = [
  { to: '/my-car', label: 'Автомобиль', img: 'cars' },
  { to: '/contacts', label: 'Диспетчер', img: 'dispatchers' },
  { to: '/mileage', label: 'Пробег', img: 'mileage' },
  { to: '/fuel', label: 'Заправка и зарядка', img: 'fuel' },
  { to: '/my-report', label: 'Мой заработок', img: 'earnings', wide: true },
];

export default function DriverHomePage({ view = 'home' }) {
  const { user } = useAuth();
  const isPhone = useIsPhone();
  const [period, setPeriod] = useState(lastPeriod);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [payOpen, setPayOpen] = useState(false);
  const [payVersion, setPayVersion] = useState(0);
  const [sent, setSent] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api.get(`/me/rent?from=${period.from}&to=${period.to}`));
      setError('');
    } catch (err) {
      setError(err.message || 'Не удалось загрузить данные');
    }
  }, [period.from, period.to]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  const debt = data?.status ? data.status.debt : data?.debt;
  const [reminderOpen, closeReminder] = useDebtReminder(user?.id, debt);

  if (error && !data) return <div className="notice notice--error">{error}</div>;
  if (!data) return <div className="muted">Загрузка…</div>;

  const { car } = data;
  const openPay = () => { setSent(false); setPayOpen(true); };

  if (!car) {
    if (isPhone) {
      return (
        <div className="drv">
          <DriverHero data={data} debt={0} />
          <OtherDebts charges={data.charges} />
          <MyPayments version={payVersion} onChanged={() => setPayVersion((v) => v + 1)} />
        </div>
      );
    }
    return (
      <div>
        <h1 className="page-title">Моя аренда</h1>
        <div className="empty">Сейчас за вами не закреплена машина. Когда диспетчер выдаст машину, здесь появится аренда и оплаты.</div>
        <p><Link to="/contacts" className="btn btn--quiet">Контакты диспетчера</Link></p>
        <OtherDebts charges={data.charges} />
        <MyPayments version={payVersion} onChanged={() => setPayVersion((v) => v + 1)} />
        <MyProfile profile={data.profile} />
      </div>
    );
  }

  const photo = car.photo_version ? `/api/v1/me/car-photo?v=${car.photo_version}` : null;
  const hasDebt = debt > 0;
  const debtDays = hasDebt && data.rate > 0 ? Math.ceil(debt / data.rate) : 0;

  const modals = (
    <>
      {payOpen && (
        <PayModal
          suggested={debt > 0 ? debt : data.rate}
          onClose={() => setPayOpen(false)}
          onSent={() => { setPayOpen(false); setSent(true); setPayVersion((v) => v + 1); }}
        />
      )}
      {reminderOpen && (
        <Modal title="Напоминание об оплате" onClose={closeReminder}>
          <div className="drv-remind">
            <p className="drv-remind__sum">{fmtMoney(debt)} сум</p>
            <p>{`У вас долг по аренде машины ${car.brand} ${car.model} (${car.plate})${debtDays ? `, примерно ${debtDays} дн. аренды` : ''}.`}</p>
            <p>Пожалуйста, оплатите диспетчеру наличными или переводом.</p>
            <div className="form-actions">
              <button type="button" className="btn" onClick={() => { closeReminder(); openPay(); }}>Сообщить об оплате</button>
              <button type="button" className="btn btn--quiet" onClick={closeReminder}>Понятно</button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
  const sentNotice = sent && <div className="notice notice--ok">Оплата отправлена. Когда диспетчер её проверит, она появится в разделе «Оплаты».</div>;

  if (view === 'payments') {
    return (
      <div className="drv">
        <div className="page-head">
          <div>
            <h1 className="page-title">Оплаты</h1>
            <p className="page-sub">{`${car.brand} ${car.model} · ${car.plate}`}</p>
          </div>
          <button type="button" className="btn" onClick={openPay}>Сообщить об оплате</button>
        </div>
        {sentNotice}
        <MyPayments version={payVersion} onChanged={() => setPayVersion((v) => v + 1)} />
        <OtherDebts charges={data.charges} />
        <h2 className="drv__title">Оплаты по дням</h2>
        <PeriodPicker value={period} onChange={setPeriod} />
        <div className="ledger-box">
          <LedgerSummary totals={data.ledger.totals} />
          <LedgerTable ledger={data.ledger} showDriver={false} />
        </div>
        {modals}
      </div>
    );
  }

  if (isPhone) {
    return (
      <div className="drv">
        {sentNotice}
        <DriverHero data={data} debt={debt} onPay={openPay} />
        {modals}
      </div>
    );
  }

  return (
    <div className="drv">
      <div className="page-head">
        <div>
          <h1 className="page-title">Моя аренда</h1>
          <p className="page-sub">{`${fmtDay(data.today)} · машина у вас с ${fmtDay(data.since)}`}</p>
        </div>
        <div className="form-actions">
          <button type="button" className="btn" onClick={openPay}>Сообщить об оплате</button>
          <NotifyButton />
        </div>
      </div>

      {error && <div className="notice notice--error">{error}</div>}
      {sentNotice}

      <div className="drv__top">
        <article className="ct drv__car">
          <div className="ct__visual">
            <BrandLogo brand={car.brand} />
            <CarVisual car={car} src={photo} />
          </div>
          <div className="ct__title">
            <span className="ct__name">{car.brand} {car.model}</span>
            {car.year && <span className="ct__year"> • {car.year}</span>}
          </div>
          <div className="ct__plate"><Plate value={car.plate} /></div>
          <div className="ct__info">
            <span className="muted small">Аренда в день</span> <b>{fmtMoney(data.rate)} сум</b>
          </div>
        </article>

        {data.status ? <RentStatusView status={data.status} /> : (
        <section className={`drv__debt ${hasDebt ? 'drv__debt--bad' : 'drv__debt--ok'}`} aria-live="polite">
          {hasDebt ? (
            <>
              <span className="drv__debt-label">Ваш долг по аренде</span>
              <b className="drv__debt-sum">{fmtMoney(data.debt)} сум</b>
              <span className="drv__debt-hint">
                {`${debtDays ? `Это примерно ${debtDays} дн. аренды. ` : ''}Отдайте деньги диспетчеру наличными или переводом.`}
              </span>
            </>
          ) : (
            <>
              <span className="drv__debt-label">Долгов нет</span>
              <b className="drv__debt-sum">{data.overpaid > 0 ? `+${fmtMoney(data.overpaid)} сум` : 'Всё оплачено'}</b>
              <span className="drv__debt-hint">
                {data.overpaid > 0 ? 'Вы оплатили аренду вперёд.' : 'Спасибо, аренда оплачена.'}
              </span>
            </>
          )}
        </section>
        )}
      </div>

      <OtherDebts charges={data.charges} />
      <MyPayments version={payVersion} onChanged={() => setPayVersion((v) => v + 1)} />

      <h2 className="drv__title">Оплаты по дням</h2>
      <PeriodPicker value={period} onChange={setPeriod} />
      <div className="ledger-box">
        <LedgerSummary totals={data.ledger.totals} />
        <LedgerTable ledger={data.ledger} showDriver={false} />
      </div>

      <MyProfile profile={data.profile} />
      {modals}
    </div>
  );
}
