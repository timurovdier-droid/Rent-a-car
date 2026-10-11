import { useEffect, useState } from 'react';

const CHECK_EVERY = 5 * 60 * 1000;

function scriptName(html) {
  return /\/assets\/index-[^"']+\.js/.exec(html)?.[0] || null;
}

// Открытая вкладка продолжает работать на старом коде, пока её не перезагрузят.
// Сравниваем имя главного скрипта с тем, что сейчас отдаёт сайт, и предлагаем обновить.
export default function UpdateBanner() {
  const [stale, setStale] = useState(false);

  useEffect(() => {
    const current = scriptName(document.documentElement.innerHTML);
    if (!current) return undefined;
    let stop = false;
    async function check() {
      if (stop || document.hidden) return;
      try {
        const res = await fetch('/', { cache: 'no-store' });
        const latest = scriptName(await res.text());
        if (latest && latest !== current) setStale(true);
      } catch {
        // нет сети — проверим в следующий раз
      }
    }
    const timer = setInterval(check, CHECK_EVERY);
    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);
    return () => {
      stop = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('focus', check);
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
