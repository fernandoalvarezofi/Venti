'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SearchIcon, TicketIcon } from './icons';
import { LogoutButton } from './logout-button';

/**
 * Menú principal: cápsula de vidrio con los accesos; la sección actual queda resaltada en tinta.
 * La persona aparece como una ficha con su inicial; "Salir" es un botón redondo con ícono.
 */
export function MainNav({ user }: { user: { firstName: string; email: string } | null }) {
  const path = usePathname();
  const links = [
    { href: '/eventos', label: 'Explorar', icon: <SearchIcon className="size-[17px]" /> },
    ...(user ? [{ href: '/mis-entradas', label: 'Mis entradas', icon: <TicketIcon className="size-[17px]" /> }] : []),
  ];
  return (
    <nav aria-label="Principal" className="ml-auto flex items-center gap-2">
      <ul className="nav-dock">
        {links.map((l) => {
          const active = path === l.href || path.startsWith(`${l.href}/`);
          return (
            <li key={l.href}>
              <Link href={l.href} aria-current={active ? 'page' : undefined} className="nav-item" aria-label={l.label}>
                {l.icon}
                <span className="hidden sm:inline">{l.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
      {user ? (
        <>
          <span className="nav-user hidden md:inline-flex" title={user.email}>
            <span className="nav-avatar" aria-hidden>
              {user.firstName.charAt(0).toUpperCase()}
            </span>
            Hola, {user.firstName}
          </span>
          <LogoutButton />
        </>
      ) : (
        <Link href="/ingresar" className="nav-cta">
          Ingresar
        </Link>
      )}
    </nav>
  );
}
