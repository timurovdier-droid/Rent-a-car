import EarningsWalletIcon from './EarningsWalletIcon';

export default function TileMedia({
  img,
  className = 'mtile__img',
  decoding = 'async',
  onClick,
  imgKey,
}) {
  if (img === 'earnings') {
    const Tag = onClick ? 'button' : 'span';
    return (
      <Tag
        key={imgKey}
        type={onClick ? 'button' : undefined}
        className={`${className} mtile__img--svg-wrap`.trim()}
        onClick={onClick}
        aria-hidden={onClick ? undefined : true}
      >
        <EarningsWalletIcon className="mtile__img--svg" />
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
