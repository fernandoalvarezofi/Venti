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
      className="flex h-10 items-center rounded-full px-3 text-sm font-medium text-muted hover:bg-ink/5 hover:text-ink disabled:opacity-50"
    >
      {pending ? 'Saliendo…' : 'Salir'}
    </button>
  );
}
