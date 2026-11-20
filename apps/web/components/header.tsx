import Link from 'next/link';
import { MainNav } from './main-nav';
import { getCurrentUser } from '@/lib/api';

/** Carita de la mascota para acompañar el logo (decorativa). */
export function MascotFace({ size = 34 }: { size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/mascota/lintick-cara-128.webp" alt="" aria-hidden width={Math.round(size * 1.1)} height={size} className="logo-face shrink-0" draggable={false} />
  );
}

/**
 * Marca del menú: una entrada en miniatura (tinta, muescas a los lados, talón perforado)
 * con la "L." de Lintick. SVG puro: nítida en cualquier pantalla y sin descargar nada.
 */
export function TicketMark({ size = 40 }: { size?: number }) {
  return (
    <svg viewBox="0 0 48 32" width={size} height={Math.round((size * 32) / 48)} aria-hidden className="logo-ticket shrink-0" focusable="false">
      <defs>
        <mask id="lt-notch">
          <rect width="48" height="32" fill="#fff" />
          {/* Muescas a mitad de altura y en la línea del talón (arriba y abajo). */}
          <circle cx="2" cy="16" r="3.4" fill="#000" />
          <circle cx="46" cy="16" r="3.4" fill="#000" />
          <circle cx="35" cy="2" r="2.2" fill="#000" />
          <circle cx="35" cy="30" r="2.2" fill="#000" />
        </mask>
        <linearGradient id="lt-sheen" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.14" />
          <stop offset="0.55" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <g mask="url(#lt-notch)">
        <rect x="2" y="2" width="44" height="28" rx="5" fill="var(--color-ink)" />
        <rect x="2" y="2" width="44" height="28" rx="5" fill="url(#lt-sheen)" />
      </g>
      {/* Perforación del talón. */}
      <path d="M35 6.5v19" stroke="var(--color-paper)" strokeOpacity="0.45" strokeWidth="1.1" strokeDasharray="1.6 2" strokeLinecap="round" />
      {/* Líneas finas del talón (como un código). */}
      <path d="M39.5 10.5v11M42 10.5v11" stroke="var(--color-paper)" strokeOpacity="0.35" strokeWidth="1" strokeLinecap="round" />
      {/* "L." */}
      <path d="M13.5 9.5v12.2h8.2" fill="none" stroke="var(--color-paper)" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="26.6" cy="21.4" r="2.25" fill="var(--color-accent)" />
    </svg>
  );
}

export function Logo({ mark = 'face' }: { mark?: 'face' | 'ticket' }) {
  return (
    <span className="logo inline-flex items-center gap-2">
      {mark === 'ticket' ? <TicketMark /> : <MascotFace />}
      <span className="font-display text-[1.45rem] font-extrabold tracking-[-0.04em]">
        Lintick<span className="text-accent">.</span>
      </span>
    </span>
  );
}

export async function Header() {
  const user = await getCurrentUser();
  const firstName = user?.fullName.split(' ')[0];
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link href="/" aria-label="Lintick, inicio" className="shrink-0">
          <Logo mark="ticket" />
        </Link>
        <MainNav user={user ? { firstName: firstName ?? '', fullName: user.fullName, email: user.email } : null} />
      </div>
    </header>
  );
}
