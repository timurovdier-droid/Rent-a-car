/** Плитка «Мой забороток»: кошелёк без жёлтой карты, белая застёжка и точка. */
export default function EarningsWalletIcon({ className = '' }) {
  return (
    <svg
      className={className}
      viewBox="0 0 420 330"
      width="100%"
      height="100%"
      aria-hidden="true"
      role="presentation"
    >
      <rect x="36" y="72" width="348" height="218" rx="52" fill="#28282B" />
      <rect x="198" y="154" width="186" height="76" rx="38" fill="#FFFFFF" />
      <circle cx="178" cy="192" r="20" fill="#FFFFFF" />
    </svg>
  );
}
