/** Íconos del panel: trazo de 1.75 px en una grilla de 24, mismo peso en todos (nada de mezclar sets). */
const P = {
  home: 'M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z',
  events: 'M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4zM14 5v2m0 3v2m0 3v2',
  calendar: 'M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1zM4 10h16M8 3.5V7m8-3.5V7',
  scan: 'M4 8V5a1 1 0 0 1 1-1h3m8 0h3a1 1 0 0 1 1 1v3m0 8v3a1 1 0 0 1-1 1h-3m-8 0H5a1 1 0 0 1-1-1v-3M4 12h16',
  money: 'M3.5 7h17v10h-17zM12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM6.5 10v.01M17.5 14v.01',
  team: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm-5.5 8.5c.6-3 3-4.5 5.5-4.5s4.9 1.5 5.5 4.5M16 5.3a3 3 0 0 1 0 5.4m2 3.6c1.4.6 2.3 1.9 2.6 3.7',
  plus: 'M12 5v14M5 12h14',
  arrow: 'M5 12h14m-5-5 5 5-5 5',
  chevronLeft: 'm15 6-6 6 6 6',
  chevronRight: 'm9 6 6 6-6 6',
  pin: 'M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11zm0-8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  clock: 'M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm0-12v4.5l3 2',
  ticket: 'M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2 2 2 0 0 0 0 4 2 2 0 0 0 0 4 2 2 0 0 1-2 2H6a2 2 0 0 1-2-2 2 2 0 0 0 0-4 2 2 0 0 0 0-4z',
  users: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm-5.5 8.5c.6-3 3-4.5 5.5-4.5s4.9 1.5 5.5 4.5M17 11.5a2.5 2.5 0 1 0 0-5M20.5 19c-.3-2-1.4-3.4-3-4',
  check: 'm5 12.5 4.5 4.5L19 7.5',
} as const;

export type PanelIconName = keyof typeof P;

export function PanelIcon({ name, className = 'size-[18px]' }: { name: PanelIconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={P[name]} />
    </svg>
  );
}
