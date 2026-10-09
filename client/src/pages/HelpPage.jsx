import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSlug from 'rehype-slug';
import textRu from '../../../docs/knowledge-base.md?raw';
import textUz from '../../../docs/knowledge-base.uz.md?raw';
import { useLang } from '../i18n';

function Img({ src, alt, title }) {
  return (
    <a href={src} target="_blank" rel="noreferrer" className={`help__shot ${title === 'phone' ? 'help__shot--phone' : ''}`}>
      <img src={src} alt={alt} loading="lazy" />
    </a>
  );
}

function findSection(hash) {
  const byId = document.getElementById(decodeURIComponent(hash));
  if (byId) return byId;
  const num = hash.match(/^(\d+)-/)?.[1];
  if (!num) return null;
  return [...document.querySelectorAll('.help h2')].find((h) => h.textContent.trim().startsWith(`${num}.`)) || null;
}

function Link({ href = '', children, node, ...rest }) {
  if (href.startsWith('#')) {
    const go = (e) => {
      e.preventDefault();
      findSection(href.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    return <a href={href} onClick={go} {...rest}>{children}</a>;
  }
  return <a href={href} target="_blank" rel="noreferrer" {...rest}>{children}</a>;
}

export default function HelpPage() {
  const lang = useLang();
  return (
    <div className="help">
      <div data-no-translate>
        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSlug]} components={{ a: Link, img: Img }}>
          {lang === 'uz' ? textUz : textRu}
        </ReactMarkdown>
      </div>
      <button type="button" className="btn btn--quiet help__top" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
        Наверх
      </button>
    </div>
  );
}
