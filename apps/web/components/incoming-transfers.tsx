'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { dateParts } from '@/lib/format';
import type { Transfer } from '@/lib/types';

/** "Te enviaron entradas": aceptar (queda a tu nombre con QR nuevo) o rechazar (vuelve a quien la envió). */
export function IncomingTransfers({ items }: { items: Transfer[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (items.length === 0) return null;

  async function act(id: string, action: 'accept' | 'decline') {
    setBusy(id + action);
    setError(null);
    const res = await fetch(`/api/v1/me/transfers/${id}/${action}`, { method: 'POST' }).catch(() => null);
    setBusy(null);
    if (!res?.ok) {
      const body = (await res?.json().catch(() => null)) as { error?: { message?: string } } | null;
      setError(body?.error?.message ?? 'No pudimos completar la acción. Intentá de nuevo.');
      return;
    }
    router.refresh();
  }

  return (
    <section id="recibidas" aria-labelledby="recibidas-titulo" className="mt-8 scroll-mt-24 rounded-[var(--radius-ticket)] border-2 border-dashed border-accent/40 bg-accent/5 p-5">
      <h2 id="recibidas-titulo" className="text-lg font-bold">
        {items.length === 1 ? 'Te enviaron una entrada' : `Te enviaron ${items.length} entradas`}
      </h2>
      <p className="text-sm text-muted">Al aceptarla queda a tu nombre, con tu propio QR.</p>
      <ul className="mt-4 space-y-3">
        {items.map((t) => {
          const d = dateParts(t.event.startsAt);
          return (
            <li key={t.id} className="flex flex-col gap-3 rounded-[14px] bg-surface p-4 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="font-semibold leading-tight">{t.event.title}</p>
                <p className="text-sm text-muted">
                  {t.ticketTypeName} · {d.long} · {d.time} h{t.event.venueName ? ` · ${t.event.venueName}` : ''}
                </p>
                {t.fromName ? <p className="mt-1 text-xs text-muted">Te la envió {t.fromName}</p> : null}
              </div>
              <div className="flex gap-2">
                <button type="button" disabled={busy !== null} onClick={() => act(t.id, 'decline')} className="btn btn-ghost h-10 px-4 text-sm">
                  {busy === t.id + 'decline' ? '…' : 'Rechazar'}
                </button>
                <button type="button" disabled={busy !== null} onClick={() => act(t.id, 'accept')} className="btn btn-primary h-10 px-4 text-sm">
                  {busy === t.id + 'accept' ? 'Aceptando…' : 'Aceptar'}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {error ? <p role="alert" className="mt-3 text-sm text-danger">{error}</p> : null}
    </section>
  );
}
