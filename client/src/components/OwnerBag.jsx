import { useId } from 'react';

/** Объёмная сумка в цветах сайта для плитки «Арендодатели». */
export default function OwnerBag({ className = '', size }) {
  const uid = useId().replace(/:/g, '');
  const body = `bag-body-${uid}`;
  const flap = `bag-flap-${uid}`;
  const shine = `bag-shine-${uid}`;

  return (
    <svg
      className={`owner-bag ${className}`.trim()}
      viewBox="0 0 220 200"
      width={size}
      height={size}
      aria-hidden="true"
      role="presentation"
    >
      <defs>
        <linearGradient id={body} x1="20%" y1="10%" x2="80%" y2="95%">
          <stop offset="0%" stopColor="#FFE94D" />
          <stop offset="45%" stopColor="#FCE000" />
          <stop offset="100%" stopColor="#E0C400" />
        </linearGradient>
        <linearGradient id={flap} x1="30%" y1="0%" x2="70%" y2="100%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#F2F2F2" />
        </linearGradient>
        <linearGradient id={shine} x1="20%" y1="0%" x2="80%" y2="100%">
          <stop offset="0%" stopColor="#fff" stopOpacity=".55" />
          <stop offset="60%" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>

      <path
        d="M78 58c0-22 14-40 32-40s32 18 32 40"
        fill="none"
        stroke="#28282B"
        strokeWidth="16"
        strokeLinecap="round"
      />

      <rect x="28" y="62" width="164" height="118" rx="36" fill={`url(#${body})`} />
      <path d="M28 98h164v46c0 20-16 36-36 36H64c-20 0-36-16-36-36V98Z" fill="#E6C800" opacity=".35" />
      <path d="M52 78c18-10 98-10 116 0" fill="none" stroke={`url(#${shine})`} strokeWidth="10" strokeLinecap="round" />

      <path d="M28 62h164c0 0-8 38-82 38S28 62 28 62Z" fill={`url(#${flap})`} />
      <rect x="92" y="78" width="36" height="28" rx="10" fill="#28282B" />
      <rect x="100" y="86" width="20" height="8" rx="4" fill="#FCE000" />
    </svg>
  );
}
