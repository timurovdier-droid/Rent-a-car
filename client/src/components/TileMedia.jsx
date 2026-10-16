import { useEffect, useState } from 'react';
import WalletTileIcon from './WalletTileIcon';

function useDarkTheme() {
  const read = () => document.documentElement.dataset.theme !== 'light';
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

export default function TileMedia({
  img,
  className = 'mtile__img',
  decoding = 'async',
  onClick,
  imgKey,
}) {
  const dark = useDarkTheme();

  if (img === 'earnings') {
    const Tag = onClick ? 'button' : 'span';
    return (
      <Tag
        key={imgKey}
        type={onClick ? 'button' : undefined}
        className={`${className} mtile__img--earnings`.trim()}
        onClick={onClick}
        aria-hidden={onClick ? undefined : true}
      >
        <WalletTileIcon dark={dark} className="wallet-tile" />
      </Tag>
    );
  }

  return (
    <img
      key={imgKey}
      className={className}
      src={`/tiles/${img}.webp`}
      alt=""
      decoding={decoding}
      onClick={onClick}
    />
  );
}
