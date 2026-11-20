'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function NavLinks({ links }: { links: { href: string; label: string; exact?: boolean }[] }) {
  const path = usePathname();
  return (
    <nav aria-label="Panel" className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:px-3 lg:pb-0">
      {links.map((l) => {
        const active = l.exact ? path === l.href : path.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? 'page' : undefined}
            className={`shrink-0 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${active ? 'bg-ink text-paper' : 'text-ink-soft hover:bg-ink/5'}`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
