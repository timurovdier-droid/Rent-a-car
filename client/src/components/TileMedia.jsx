const EARNINGS_TILE = '/tiles/earnings.webp?v=5';

export default function TileMedia({
  img,
  className = 'mtile__img',
  decoding = 'async',
  onClick,
  imgKey,
}) {
  const src = img === 'earnings' ? EARNINGS_TILE : `/tiles/${img}.webp`;
  return (
    <img
      key={imgKey}
      className={className}
      src={src}
      alt=""
      decoding={decoding}
      onClick={onClick}
    />
  );
}
