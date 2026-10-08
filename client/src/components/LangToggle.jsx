import { setLang, useLang } from '../i18n';

export default function LangToggle({ className = '' }) {
  const lang = useLang();
  return (
    <div className={`lang-toggle ${className}`} role="group" aria-label="Язык" data-no-translate>
      <button type="button" className={`lang-toggle__btn ${lang === 'ru' ? 'lang-toggle__btn--on' : ''}`} onClick={() => setLang('ru')}>RU</button>
      <button type="button" className={`lang-toggle__btn ${lang === 'uz' ? 'lang-toggle__btn--on' : ''}`} onClick={() => setLang('uz')}>UZ</button>
    </div>
  );
}
