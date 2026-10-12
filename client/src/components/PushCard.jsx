import { useEffect, useState } from 'react';
import Modal from './Modal';
import { currentSubscription, enablePush, isIos, isStandalone, pushSupported, refreshPush } from '../push';

const ASK_KEY = 'rac-push-ask';
const ASK_PAUSE = 24 * 60 * 60 * 1000;

function askedRecently() {
  return Date.now() - Number(localStorage.getItem(ASK_KEY) || 0) < ASK_PAUSE;
}

function ShareIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v12" /><path d="M7.5 7.5 12 3l4.5 4.5" /><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
    </svg>
  );
}

function AddIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <rect x="3.5" y="3.5" width="17" height="17" rx="4" /><path d="M12 8v8M8 12h8" />
    </svg>
  );
}

// В обычном Safari на iPhone уведомления недоступны — только после «На экран „Домой“».
function IosGuide({ onClose }) {
  return (
    <>
      <Modal title="Включаем уведомления" onClose={onClose}>
        <ol className="pushguide">
          <li>
            <span className="pushguide__num">1</span>
            <span>Нажмите кнопку <b className="pushguide__key"><ShareIcon /> Поделиться</b> внизу экрана</span>
          </li>
          <li>
            <span className="pushguide__num">2</span>
            <span>Выберите <b className="pushguide__key"><AddIcon /> На экран «Домой»</b> и нажмите «Добавить»</span>
          </li>
          <li>
            <span className="pushguide__num">3</span>
            <span>Откройте сайт с новой иконки <b>GTA</b> на экране телефона и нажмите <b>«Да, включить»</b></span>
          </li>
        </ol>
        <p className="muted small">Так требует Apple: на iPhone уведомления приходят только от сайтов, добавленных на экран «Домой».</p>
        <div className="form-actions form-actions--big">
          <button className="btn" type="button" onClick={onClose}>Понятно</button>
        </div>
      </Modal>
      <div className="pushguide__arrow" aria-hidden="true">⬇</div>
    </>
  );
}

export default function PushCard() {
  const supported = pushSupported();
  const [state, setState] = useState(supported ? 'checking' : 'unsupported');
  const [error, setError] = useState('');
  const [guide, setGuide] = useState(false);
  const [ask, setAsk] = useState(false);

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
          if (!askedRecently()) setAsk(true);
        }
      })
      .catch(() => setState('off'));
  }, [supported]);

  async function turnOn() {
    setAsk(false);
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

  function later() {
    localStorage.setItem(ASK_KEY, String(Date.now()));
    setAsk(false);
  }

  if (state === 'on' || state === 'checking') return null;

  if (state === 'unsupported') {
    if (!isIos() || isStandalone()) return null;
    return (
      <>
        <div className="pushcard">
          <span className="pushcard__icon pushcard__icon--ring" aria-hidden="true">🔔</span>
          <div className="pushcard__text">
            <b>Включить уведомления о долге?</b>
            <span>Напомним о долге по аренде каждые 2 часа, пока он есть.</span>
          </div>
          <button type="button" className="btn pushcard__btn" onClick={() => setGuide(true)}>Да, включить</button>
        </div>
        {guide && <IosGuide onClose={() => setGuide(false)} />}
      </>
    );
  }

  if (state === 'denied') {
    return (
      <div className="pushcard pushcard--muted">
        <span className="pushcard__icon" aria-hidden="true">🔕</span>
        <div className="pushcard__text">
          <b>Уведомления запрещены</b>
          <span>
            {isIos()
              ? 'Откройте «Настройки» iPhone → «Уведомления» → GTA и включите «Допуск уведомлений».'
              : 'Нажмите на значок замка слева от адреса сайта → «Уведомления» → «Разрешить».'}
          </span>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="pushcard">
        <span className="pushcard__icon pushcard__icon--ring" aria-hidden="true">🔔</span>
        <div className="pushcard__text">
          <b>Включить уведомления о долге?</b>
          <span>Напомним о долге по аренде каждые 2 часа, пока он есть.</span>
          {error && <span className="pushcard__error">{error}</span>}
        </div>
        <button type="button" className="btn pushcard__btn" onClick={turnOn} disabled={state === 'busy'}>
          {state === 'busy' ? '…' : 'Да, включить'}
        </button>
      </div>
      {ask && (
        <Modal title="Уведомления о долге" onClose={later}>
          <div className="pushask">
            <span className="pushask__bell" aria-hidden="true">🔔</span>
            <p>Включить напоминания о долге по аренде? Они будут приходить на телефон каждые 2 часа, пока долг есть, кроме ночи.</p>
            <p className="muted small">После «Да» телефон спросит разрешение — нажмите «Разрешить».</p>
          </div>
          <div className="form-actions form-actions--big">
            <button className="btn" type="button" onClick={turnOn}>Да, включить</button>
            <button className="btn btn--quiet" type="button" onClick={later}>Позже</button>
          </div>
        </Modal>
      )}
    </>
  );
}
