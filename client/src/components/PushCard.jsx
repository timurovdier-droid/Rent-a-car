import { useEffect, useState } from 'react';
import { currentSubscription, enablePush, isIos, isStandalone, pushSupported, refreshPush } from '../push';

// Карточка «Включите уведомления о долге». Прячется, когда уведомления уже включены.
export default function PushCard() {
  const supported = pushSupported();
  const [state, setState] = useState(supported ? 'checking' : 'unsupported');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!supported) return;
    if (Notification.permission === 'denied') { setState('denied'); return; }
    currentSubscription()
      .then((sub) => {
        if (sub && Notification.permission === 'granted') {
          setState('on');
          refreshPush();
        } else {
          setState('off');
        }
      })
      .catch(() => setState('off'));
  }, [supported]);

  async function turnOn() {
    setState('busy');
    setError('');
    try {
      await enablePush();
      setState('on');
    } catch (err) {
      setError(err.message || 'Не получилось включить уведомления');
      setState(Notification.permission === 'denied' ? 'denied' : 'off');
    }
  }

  if (state === 'on' || state === 'checking') return null;

  if (state === 'unsupported') {
    if (!isIos() || isStandalone()) return null;
    return (
      <div className="pushcard">
        <span className="pushcard__icon" aria-hidden="true">🔔</span>
        <div className="pushcard__text">
          <b>Уведомления о долге на iPhone</b>
          <span>Нажмите «Поделиться» <span aria-hidden="true">⬆️</span> внизу Safari → «На экран „Домой“». Откройте сайт с иконки на экране и включите уведомления.</span>
        </div>
      </div>
    );
  }

  if (state === 'denied') {
    return (
      <div className="pushcard pushcard--muted">
        <span className="pushcard__icon" aria-hidden="true">🔕</span>
        <div className="pushcard__text">
          <b>Уведомления запрещены</b>
          <span>Разрешите уведомления для этого сайта в настройках браузера, чтобы получать напоминания о долге.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="pushcard">
      <span className="pushcard__icon pushcard__icon--ring" aria-hidden="true">🔔</span>
      <div className="pushcard__text">
        <b>Включите уведомления</b>
        <span>Напомним о долге по аренде каждые 2 часа, пока он есть.</span>
        {error && <span className="pushcard__error">{error}</span>}
      </div>
      <button type="button" className="btn pushcard__btn" onClick={turnOn} disabled={state === 'busy'}>
        {state === 'busy' ? '…' : 'Включить'}
      </button>
    </div>
  );
}
