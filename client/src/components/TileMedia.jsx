import { useEffect, useState } from 'react';

function useDarkTheme() {
  const read = () => document.documentElement.dataset.theme === 'dark';
  const [dark, setDark] = useState(read);
  useEffect(() => {
    const root = document.documentElement;
    const sync = () => setDark(read());
    const obs = new MutationObserver(sync);
    obs.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);
  return dark;
}

function tileSrc(img, dark) {
  if (img === 'earnings') {
    return dark ? '/tiles/earnings-dark.webp?v=4' : '/tiles/earnings.webp?v=6';
  }
  return `/tiles/${img}.webp`;
}

export default function TileMedia({
  img,
  className = 'mtile__img',
  decoding = 'async',
  onClick,
  imgKey,
}) {
  const dark = useDarkTheme();
  const src = tileSrc(img, dark);
  const extra = img === 'earnings' ? ' mtile__img--earnings' : '';
  return (
    <img
      key={imgKey}
      className={`${className}${extra}`.trim()}
      src={src}
      alt=""
      decoding={decoding}
      onClick={onClick}
    />
  );
}
