'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

export function LogoutButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await fetch('/api/v1/auth/logout', { method: 'POST' }).catch(() => null);
          router.push('/');
          router.refresh();
        })
      }
      className="nav-exit"
      aria-label={pending ? 'Saliendo…' : 'Salir'}
      title="Salir"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="size-[17px]" aria-hidden>
        <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l-4-4 4-4M6 12h10" />
      </svg>
    </button>
  );
}
