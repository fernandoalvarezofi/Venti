import Link from 'next/link';
import { MascotFace } from '../header';
import type { Org } from '@/lib/types';
import { LogoutButton } from '../logout-button';
import { NavLinks, type NavGroup } from './nav-links';
import { PanelIcon } from './panel-icons';

const ROLE_LABEL: Record<Org['role'], string> = {
  owner: 'Dueño',
  admin: 'Administrador',
  manager: 'Producción',
  finance: 'Finanzas',
  sales: 'Ventas',
  access_staff: 'Acceso',
  viewer: 'Lectura',
};

/** Marco de Lintick Business: menú lateral en escritorio, barra superior con pestañas en el celular. */
export function BusinessShell({ org, orgs, userName, children }: { org: Org; orgs: Org[]; userName: string; children: React.ReactNode }) {
  const base = `/business/${org.id}`;
  const can = (p: Org['permissions'][number]) => org.permissions?.includes(p) ?? false;
  // Sólo secciones que existen y que este rol puede usar (la API igual valida cada pedido).
  const allGroups: NavGroup[] = [
    {
      title: 'General',
      items: [
        { href: base, label: 'Inicio', icon: 'home', exact: true },
        { href: `${base}/eventos`, label: 'Mis eventos', icon: 'events', exact: true },
        { href: `${base}/calendario`, label: 'Calendario', icon: 'calendar' },
      ],
    },
    { title: 'Ventas y operaciones', items: can('access.scan') ? [{ href: '/acceso', label: 'Check-in', icon: 'scan' as const }] : [] },
    {
      title: 'Administración',
      items: [
        ...(can('finance.read') ? [{ href: `${base}/cobros`, label: 'Finanzas', icon: 'money' as const }] : []),
        ...(can('members.manage') ? [{ href: `${base}/equipo`, label: 'Equipo', icon: 'team' as const }] : []),
      ],
    },
  ];
  const groups = allGroups.filter((g) => g.items.length > 0);
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[260px_1fr]">
      <aside className="border-b border-line bg-surface lg:sticky lg:top-0 lg:h-dvh lg:border-b-0 lg:border-r">
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between gap-3 px-5 pb-3 pt-4 lg:block lg:pb-6 lg:pt-6">
            <Link href="/business" className="logo inline-flex items-center gap-1.5 font-display text-[1.35rem] font-extrabold tracking-[-0.04em]">
              <MascotFace size={30} />
              <span>
                Lintick<span className="text-accent">.</span> <span className="text-sm font-semibold tracking-normal text-muted">business</span>
              </span>
            </Link>
            <div className="lg:mt-6">
              <p className="hidden text-xs text-muted lg:block">Productora</p>
              {/* Siempre con menú: para cambiar de productora o crear una propia (aunque sólo tengas una). */}
              {orgs.length >= 1 ? (
                <details className="relative">
                  <summary className="cursor-pointer list-none truncate font-semibold lg:mt-0.5">{org.name} ▾</summary>
                  <ul className="absolute right-0 z-20 mt-2 w-56 rounded-xl bg-paper p-1.5 shadow-[0_12px_32px_-12px_rgb(23_20_17/0.4)] lg:left-0">
                    {orgs.map((o) => (
                      <li key={o.id}>
                        <Link href={`/business/${o.id}`} className="block truncate rounded-lg px-3 py-2 text-sm hover:bg-ink/5">
                          {o.name}
                        </Link>
                      </li>
                    ))}
                    <li className="border-t border-line pt-1">
                      <Link href="/business?nueva=1" className="block rounded-lg px-3 py-2 text-sm text-muted hover:bg-ink/5">
                        + Nueva productora
                      </Link>
                    </li>
                  </ul>
                </details>
              ) : (
                <p className="truncate font-semibold lg:mt-0.5">{org.name}</p>
              )}
              <p className="hidden text-xs text-muted lg:block">{ROLE_LABEL[org.role]}</p>
            </div>
          </div>
          {can('events.write') ? (
            <div className="hidden px-6 pb-5 lg:block">
              <Link href={`${base}/eventos/nuevo`} className="flex h-10 items-center justify-center gap-2 rounded-full bg-ink text-sm font-semibold text-paper transition-colors hover:bg-ink/85">
                <PanelIcon name="plus" className="size-4" /> Crear evento
              </Link>
            </div>
          ) : null}
          <NavLinks groups={groups} />
          <div className="mt-auto hidden border-t border-line p-5 text-sm lg:block">
            <p className="truncate font-semibold">{userName}</p>
            <div className="mt-2 flex items-center gap-3">
              <Link href="/" className="text-muted hover:text-ink">
                Ver Lintick
              </Link>
              <LogoutButton />
            </div>
          </div>
        </div>
      </aside>
      <main id="contenido" className="min-w-0 px-4 pb-20 pt-6 sm:px-6 lg:px-10 lg:pt-10">
        {children}
      </main>
    </div>
  );
}
