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
      className="text-sm font-medium text-muted transition-colors hover:text-danger disabled:opacity-50"
    >
      {pending ? 'Saliendo…' : 'Salir'}
    </button>
  );
}
