'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState, useTransition } from 'react';
import { SearchIcon, TicketIcon } from './icons';
import { forgetOfflinePages } from './app-install';

/**
 * Menú principal sobrio: enlaces de texto con subrayado que se dibuja al pasar el mouse,
 * la sección actual subrayada en naranja, y un menú de cuenta desplegable con la inicial.
 */
export function MainNav({ user }: { user: { firstName: string; fullName: string; email: string } | null }) {
  const path = usePathname();
  const links = [
    { href: '/eventos', label: 'Explorar', icon: <SearchIcon className="size-[18px]" /> },
    ...(user ? [{ href: '/mis-entradas', label: 'Mis entradas', icon: <TicketIcon className="size-[18px]" /> }] : []),
  ];
  return (
    <nav aria-label="Principal" className="ml-auto flex items-center gap-1 sm:gap-3">
      <ul className="flex items-center gap-1 sm:gap-2">
        {links.map((l) => {
          const active = path === l.href || path.startsWith(`${l.href}/`);
          return (
            <li key={l.href}>
              <Link href={l.href} aria-current={active ? 'page' : undefined} className="nx-link" aria-label={l.label}>
                <span className="sm:hidden">{l.icon}</span>
                <span className="nx-label hidden sm:inline">{l.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
      <span aria-hidden className="hidden h-5 w-px bg-line-strong sm:block" />
      {user ? (
        <AccountMenu user={user} />
      ) : (
        <Link href="/ingresar" className="nx-cta">
          Ingresar
        </Link>
      )}
    </nav>
  );
}

function AccountMenu({ user }: { user: { firstName: string; fullName: string; email: string } }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const path = usePathname();
  const root = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        root.current?.querySelector<HTMLButtonElement>('button[aria-haspopup]')?.focus();
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const items = [...(root.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
        const i = items.indexOf(document.activeElement as HTMLElement);
        const next = e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
        items[next]?.focus();
        e.preventDefault();
      }
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    root.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function logout() {
    start(async () => {
      await fetch('/api/v1/auth/logout', { method: 'POST' }).catch(() => null);
      forgetOfflinePages();
      setOpen(false);
      router.push('/');
      router.refresh();
    });
  }

  const initial = user.firstName.charAt(0).toUpperCase() || '·';
  return (
    <div ref={root} className="relative">
      <button type="button" className="nx-account" aria-haspopup="menu" aria-expanded={open} aria-controls={menuId} onClick={() => setOpen((v) => !v)}>
        <span className="nx-avatar" aria-hidden>
          {initial}
        </span>
        <span className="hidden text-sm font-semibold md:inline">{user.firstName}</span>
        <svg viewBox="0 0 24 24" className={`nx-chevron ${open ? 'rotate-180' : ''}`} aria-hidden fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="m6 9 6 6 6-6" />
        </svg>
        <span className="sr-only">Menú de tu cuenta</span>
      </button>
      {open ? (
        <div id={menuId} role="menu" aria-label="Tu cuenta" className="nx-menu">
          <div className="border-b border-line px-4 pb-3 pt-3.5">
            <p className="truncate text-sm font-semibold">{user.fullName}</p>
            <p className="truncate text-xs text-muted">{user.email}</p>
          </div>
          <div className="p-1.5">
            <Link role="menuitem" href="/mis-entradas" className="nx-item">
              Mis entradas
            </Link>
            <Link role="menuitem" href="/business" className="nx-item">
              Panel de productora
            </Link>
            <Link role="menuitem" href="/acceso" className="nx-item">
              Control de ingreso
            </Link>
          </div>
          <div className="border-t border-line p-1.5">
            <button role="menuitem" type="button" onClick={logout} disabled={pending} className="nx-item nx-item-danger">
              {pending ? 'Saliendo…' : 'Cerrar sesión'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
