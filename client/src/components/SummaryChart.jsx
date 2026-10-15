import { useId } from 'react';

const LINE = 'M24 168 C 70 158, 92 132, 118 138 C 150 146, 168 112, 198 108 C 236 102, 258 128, 292 96 C 322 70, 348 88, 382 64 C 422 36, 458 58, 502 40 C 536 26, 568 34, 616 18';

/** Линейный график сводки на весь фон широкой плитки. */
export default function SummaryChart({ className = '' }) {
  const uid = useId().replace(/:/g, '');
  const area = `area-${uid}`;
  const glow = `glow-${uid}`;

  return (
    <svg
      className={`summary-chart ${className}`.trim()}
      viewBox="0 0 640 200"
      preserveAspectRatio="xMaxYMid slice"
      aria-hidden="true"
      role="presentation"
    >
      <defs>
        <linearGradient id={area} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--c-primary, #FCE000)" stopOpacity=".38" />
          <stop offset="100%" stopColor="var(--c-primary, #FCE000)" stopOpacity="0" />
        </linearGradient>
        <filter id={glow} x="-8%" y="-40%" width="116%" height="180%">
          <feGaussianBlur stdDeviation="3.2" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <g stroke="var(--c-line-strong)" strokeWidth="1" fill="none" opacity=".55">
        <path d="M0 40h640M0 80h640M0 120h640M0 160h640" />
        <path d="M128 0v200M256 0v200M384 0v200M512 0v200" />
      </g>
      <path d={`${LINE} L616 200 L24 200 Z`} fill={`url(#${area})`} />
      <path
        d={LINE}
        fill="none"
        stroke="var(--c-primary, #FCE000)"
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
        filter={`url(#${glow})`}
      />
    </svg>
  );
}
