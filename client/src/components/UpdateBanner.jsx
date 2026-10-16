import { useEffect, useState } from 'react';

const CHECK_EVERY = 60 * 1000;
const AUTO_RELOAD_KEY = 'rac-auto-updated';

function scriptName(html) {
  return /\/assets\/index-[^"']+\.js/.exec(html)?.[0] || null;
}

function currentScript() {
  return scriptName(document.documentElement.innerHTML);
}

// Открытая вкладка (особенно на телефоне) часто остаётся на старом бандле, пока её не перезагрузят.
export default function UpdateBanner() {
  const [stale, setStale] = useState(false);

  useEffect(() => {
    const current = currentScript();
    if (!current) return undefined;
    let stop = false;

    async function check(tryAutoReload = false) {
      if (stop || document.hidden) return;
      try {
        const res = await fetch('/', { cache: 'no-store' });
        const latest = scriptName(await res.text());
        if (!latest || latest === current) return;
        if (tryAutoReload) {
          try {
            if (!sessionStorage.getItem(AUTO_RELOAD_KEY)) {
              sessionStorage.setItem(AUTO_RELOAD_KEY, '1');
              window.location.reload();
              return;
            }
          } catch {
            // sessionStorage недоступен — покажем баннер
          }
        }
        setStale(true);
      } catch {
        // нет сети — проверим позже
      }
    }

    check(true);
    const timer = setInterval(() => check(false), CHECK_EVERY);
    const onWake = () => check(true);
    document.addEventListener('visibilitychange', onWake);
    window.addEventListener('focus', onWake);
    window.addEventListener('pageshow', onWake);

    const clearAuto = setTimeout(() => {
      try { sessionStorage.removeItem(AUTO_RELOAD_KEY); } catch { /* ignore */ }
    }, 20000);

    return () => {
      stop = true;
      clearInterval(timer);
      clearTimeout(clearAuto);
      document.removeEventListener('visibilitychange', onWake);
      window.removeEventListener('focus', onWake);
      window.removeEventListener('pageshow', onWake);
    };
  }, []);

  if (!stale) return null;
  return (
    <div className="update-banner" role="status">
      <span>Вышла новая версия сайта</span>
      <button type="button" className="btn btn--sm" onClick={() => window.location.reload()}>Обновить</button>
    </div>
  );
}
