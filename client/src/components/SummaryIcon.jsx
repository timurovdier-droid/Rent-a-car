import { useId } from 'react';

/** Иконка сводки: сектор диаграммы + столбцы в жёлто-золотых цветах сайта. */
export default function SummaryIcon({ size = 120, className = '' }) {
  const uid = useId().replace(/:/g, '');
  const gradId = `summary-g-${uid}`;

  return (
    <svg
      className={`summary-icon ${className}`.trim()}
      viewBox="0 0 512 512"
      width={size}
      height={size}
      aria-hidden="true"
      role="presentation"
    >
      <defs>
        <linearGradient id={gradId} x1="42%" y1="6%" x2="58%" y2="96%">
          <stop offset="0%" stopColor="var(--summary-icon-top, #FFF7B8)" />
          <stop offset="40%" stopColor="var(--summary-icon-mid, #FCE000)" />
          <stop offset="100%" stopColor="var(--summary-icon-bottom, #C48A00)" />
        </linearGradient>
      </defs>
      <g fill={`url(#${gradId})`}>
        <path d="M236 72A190 190 0 1 0 440 300L328 300A70 70 0 0 1 236 208Z" />
        <path d="M292 52A176 176 0 0 1 460 220L404 244A46 46 0 0 0 354 194L308 112A46 46 0 0 1 292 52Z" />
      </g>
      <g fill="var(--summary-icon-bars, #fff)">
        <rect x="164" y="304" width="40" height="70" rx="20" />
        <rect x="220" y="268" width="40" height="106" rx="20" />
        <rect x="276" y="228" width="40" height="146" rx="20" />
      </g>
    </svg>
  );
}
