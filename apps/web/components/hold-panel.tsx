'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { formatMoney } from '@/lib/format';
import type { Hold } from '@/lib/types';
import { ClockIcon, LockIcon } from './icons';

function useRemaining(expiresAt: string) {
  const target = new Date(expiresAt).getTime();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return Math.max(0, Math.floor((target - now) / 1000));
}

export function HoldPanel({ hold }: { hold: Hold }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [releaseError, setReleaseError] = useState<string | null>(null);
  const remaining = useRemaining(hold.expiresAt);
  const expired = hold.status !== 'active' || remaining === 0;
  const mm = String(Math.floor(remaining / 60)).padStart(2, '0');
  const ss = String(remaining % 60).padStart(2, '0');

  function release() {
    start(async () => {
      const res = await fetch(`/api/v1/holds/${hold.id}`, { method: 'DELETE' }).catch(() => null);
      if (!res || (!res.ok && res.status !== 404)) {
        setReleaseError('No pudimos liberar la reserva. Igual se libera sola al vencer.');
        return;
      }
      router.push(`/eventos/${hold.eventId}`);
      router.refresh();
    });
  }

  const statusText =
    hold.status === 'released' ? 'Liberaste esta reserva.' : hold.status === 'converted' ? 'Esta reserva ya se convirtió en una compra.' : 'La reserva venció y las entradas volvieron a la venta.';

  return (
    <div className="rounded-[var(--radius-ticket)] bg-surface">
      <div className="flex items-center justify-between gap-4 p-6">
        {expired ? (
          <p className="font-semibold text-muted">{statusText}</p>
        ) : (
          <div className="flex items-center gap-3">
            <ClockIcon className="size-6 text-ink-soft" />
            <div>
              <p className="text-sm text-muted">Tus entradas están apartadas por</p>
              <p className="font-display text-3xl font-extrabold tabular-nums" aria-live="off">
                {mm}:{ss}
              </p>
            </div>
          </div>
        )}
      </div>
      <div className="cut" aria-hidden><span /></div>
      <div className="p-6">
        <ul className="divide-y divide-line">
          {hold.items.map((i) => (
            <li key={i.ticketTypeId} className="flex items-baseline justify-between gap-4 py-3">
              <div>
                <p className="font-semibold">
                  {i.quantity} × {i.ticketTypeName}
                </p>
                {i.stageName ? <p className="text-sm text-muted">{i.stageName}</p> : null}
              </div>
              <p className="tabular-nums">{formatMoney(i.unitPriceCents * i.quantity, hold.currency)}</p>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex items-baseline justify-between border-t border-line pt-4">
          <span className="font-semibold">Total</span>
          <span className="font-display text-3xl font-extrabold tabular-nums">{formatMoney(hold.totalCents, hold.currency)}</span>
        </div>

        {expired ? (
          <Link href={`/eventos/${hold.eventId}`} className="btn btn-ink mt-6 w-full">
            Volver a elegir entradas
          </Link>
        ) : (
          <>
            <div className="mt-6 rounded-xl bg-ink/[0.04] p-4">
              <div className="flex gap-3">
                <LockIcon className="mt-0.5 size-5 shrink-0 text-ink-soft" />
                <div className="text-sm">
                  <p className="font-semibold">El pago online todavía no está habilitado</p>
                  <p className="mt-1 text-muted">
                    Estamos conectando Mercado Pago y transferencias. Hasta entonces no se cobra nada: la reserva se libera sola cuando termina el tiempo.
                  </p>
                </div>
              </div>
            </div>
            <button type="button" disabled className="btn btn-primary mt-4 w-full" aria-describedby="pago-nota">
              Pagar {formatMoney(hold.totalCents, hold.currency)}
            </button>
            <p id="pago-nota" className="sr-only">
              Botón deshabilitado: el pago online todavía no está disponible.
            </p>
            {releaseError ? (
              <p role="alert" className="mt-3 text-sm text-danger">
                {releaseError}
              </p>
            ) : null}
            <button type="button" onClick={release} disabled={pending} className="btn btn-ghost mt-3 w-full">
              {pending ? 'Liberando…' : 'Liberar reserva'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
