'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PanelIcon, type PanelIconName } from './panel-icons';

export interface NavItem {
  href: string;
  label: string;
  icon: PanelIconName;
  exact?: boolean;
}
export interface NavGroup {
  title: string;
  items: NavItem[];
}

/**
 * Menú del panel agrupado por área. En escritorio: columna con títulos de grupo.
 * En el celular: una sola fila desplazable con todos los accesos (sin títulos, que no entran).
 * Sólo recibe secciones que existen y que el rol puede ver.
 */
export function NavLinks({ groups }: { groups: NavGroup[] }) {
  const path = usePathname();
  const isActive = (l: NavItem) => (l.exact ? path === l.href : path === l.href || path.startsWith(`${l.href}/`));
  const all = groups.flatMap((g) => g.items);
  return (
    <nav aria-label="Panel">
      <ul className="flex gap-1 overflow-x-auto px-3 pb-3 lg:hidden">
        {all.map((l) => (
          <li key={l.href} className="shrink-0">
            <Link
              href={l.href}
              aria-current={isActive(l) ? 'page' : undefined}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${isActive(l) ? 'bg-ink text-paper' : 'text-ink-soft hover:bg-ink/5'}`}
            >
              <PanelIcon name={l.icon} className="size-4" />
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
      <div className="hidden space-y-6 px-3 lg:block">
        {groups.map((g) => (
          <div key={g.title}>
            <p className="px-3 pb-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-muted">{g.title}</p>
            <ul className="space-y-0.5">
              {g.items.map((l) => {
                const active = isActive(l);
                return (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      aria-current={active ? 'page' : undefined}
                      className={`relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150 ${
                        active ? 'bg-accent/[0.09] text-accent-ink' : 'text-ink-soft hover:bg-ink/[0.04] hover:text-ink'
                      }`}
                    >
                      {active ? <span className="absolute -left-3 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-accent" aria-hidden /> : null}
                      <PanelIcon name={l.icon} />
                      {l.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}
