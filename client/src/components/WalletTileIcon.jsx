/** Кошелёк для плиток: на тёмном фоне — светлый корпус, чтобы не сливался. */
export default function WalletTileIcon({ dark = true, className = '' }) {
  const body = dark ? '#F3F4F7' : '#28282B';
  const clasp = dark ? '#28282B' : '#FFFFFF';
  return (
    <svg
      className={className}
      viewBox="0 0 200 140"
      aria-hidden="true"
      role="presentation"
    >
      <rect x="6" y="16" width="188" height="108" rx="28" fill={body} />
      <rect x="108" y="48" width="92" height="44" rx="22" fill={clasp} />
      <rect x="118" y="58" width="82" height="24" rx="12" fill={body} />
      <circle cx="136" cy="70" r="7" fill={clasp} />
    </svg>
  );
}
