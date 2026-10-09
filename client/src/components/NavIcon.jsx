const PATHS = {
  home: 'M3.5 11 12 4l8.5 7M6 9.5V20h12V9.5M10 20v-5h4v5',
  bell: 'M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 1.5h-15L6 16.5ZM10 21h4',
  car: 'M4 16v-3.5l1.9-4.8A1.5 1.5 0 0 1 7.3 6.8h9.4a1.5 1.5 0 0 1 1.4.9L20 12.5V16a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1ZM4 12.5h16M7 17v2M17 17v2M7.5 14.5h1M15.5 14.5h1',
  users: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM2.5 20a6.5 6.5 0 0 1 13 0M16 4.3a3.5 3.5 0 0 1 0 6.4M18 14.2a6.5 6.5 0 0 1 3.5 5.8',
  briefcase: 'M4 8h16v11H4V8ZM9 8V5.5h6V8M4 13h16',
  headset: 'M4.5 14v-2a7.5 7.5 0 0 1 15 0v2M4.5 14h3v5h-2a1 1 0 0 1-1-1v-4ZM19.5 14h-3v5h2a1 1 0 0 0 1-1v-4ZM16.5 19c0 1.3-1.8 2-4.5 2',
  wallet: 'M4 7.5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-10ZM4 7.5V6.5a2 2 0 0 1 2-2h10M16 13.5h1.5',
  calendar: 'M4 6.5h16V20H4V6.5ZM4 10.5h16M8 4v4M16 4v4M9 15l2 2 4-4',
  chart: 'M4 20h16M7 20v-6M12 20V8M17 20v-10',
  list: 'M8.5 4.5h7v3h-7v-3ZM6.5 6H5v15h14V6h-1.5M8.5 12h7M8.5 16h5',
  sliders: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 4.5v5M9 14.5v5',
  help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM9.6 9.3a2.5 2.5 0 0 1 4.9.7c0 1.7-2.5 2.2-2.5 3.8M12 17h.01',
  menu: 'M4 7h16M4 12h16M4 17h16',
  close: 'M6 6l12 12M18 6 6 18',
};

export default function NavIcon({ name, size = 20 }) {
  return (
    <svg
      className="nav-icon" viewBox="0 0 24 24" width={size} height={size} aria-hidden="true"
      fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
    >
      <path d={PATHS[name] || PATHS.home} />
    </svg>
  );
}
