import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import Plate from '../components/Plate';
import Modal from '../components/Modal';
import PeriodPicker from '../components/PeriodPicker';
import { BrandLogo, CarVisual } from '../components/CarTile';
import { LedgerSummary, LedgerTable } from '../components/CarLedger';
import { RentStatusView } from '../components/RentStatus';
import { fmtMoney, fmtDay, todayLocal, shiftDay } from '../labels';

const HOUR = 60 * 60 * 1000;
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

export default function DriverHomePage() {
  const { user } = useAuth();
  const [period, setPeriod] = useState(lastPeriod);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

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
  if (!car) {
    return (
      <div>
        <h1 className="page-title">Моя аренда</h1>
        <div className="empty">Сейчас за вами не закреплена машина. Когда диспетчер выдаст машину, здесь появится аренда и оплаты.</div>
      </div>
    );
  }

  const photo = car.photo_version ? `/api/v1/me/car-photo?v=${car.photo_version}` : null;
  const hasDebt = debt > 0;
  const debtDays = hasDebt && data.rate > 0 ? Math.ceil(debt / data.rate) : 0;

  return (
    <div className="drv">
      <div className="page-head">
        <div>
          <h1 className="page-title">Моя аренда</h1>
          <p className="page-sub">{`${fmtDay(data.today)} · машина у вас с ${fmtDay(data.since)}`}</p>
        </div>
        <NotifyButton />
      </div>

      {error && <div className="notice notice--error">{error}</div>}

      <div className="drv__top">
        <article className="ct drv__car">
          <div className="ct__head">
            <BrandLogo brand={car.brand} />
            <div className="ct__names">
              <div className="ct__brand">{car.brand}</div>
              <div className="ct__model">{[car.model, car.year].filter(Boolean).join(' · ')}</div>
            </div>
          </div>
          <div className="ct__visual"><CarVisual car={car} src={photo} /></div>
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

      <h2 className="drv__title">Оплаты по дням</h2>
      <PeriodPicker value={period} onChange={setPeriod} />
      <div className="ledger-box">
        <LedgerSummary totals={data.ledger.totals} />
        <LedgerTable ledger={data.ledger} showDriver={false} />
      </div>

      {reminderOpen && (
        <Modal title="Напоминание об оплате" onClose={closeReminder}>
          <div className="drv-remind">
            <p className="drv-remind__sum">{fmtMoney(debt)} сум</p>
            <p>{`У вас долг по аренде машины ${car.brand} ${car.model} (${car.plate})${debtDays ? `, примерно ${debtDays} дн. аренды` : ''}.`}</p>
            <p>Пожалуйста, оплатите диспетчеру наличными или переводом.</p>
            <div className="form-actions">
              <button type="button" className="btn" onClick={closeReminder}>Понятно</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
