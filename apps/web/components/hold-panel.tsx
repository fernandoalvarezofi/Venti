'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { formatMoney } from '@/lib/format';
import type { Hold } from '@/lib/types';
import { ClockIcon, LockIcon } from './icons';
import { TicketButton } from './ticket-button';

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
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  /** Crea la orden y el enlace de pago, y lleva a Mercado Pago. Las entradas se emiten sólo cuando MP confirma. */
  async function pay() {
    setPaying(true);
    setPayError(null);
    const res = await fetch(`/api/v1/holds/${hold.id}/checkout`, { method: 'POST' }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as { orderId?: string; status?: string; checkoutUrl?: string | null; error?: { message?: string } } | null;
    if (!res?.ok || !body?.orderId) {
      setPaying(false);
      setPayError(body?.error?.message ?? 'No pudimos iniciar el pago. Revisá tu conexión e intentá de nuevo.');
      return;
    }
    if (body.status === 'paid' || !body.checkoutUrl) {
      router.push(`/compra/${body.orderId}`);
      return;
    }
    window.location.assign(body.checkoutUrl);
  }
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
          {hold.feeCents > 0 ? (
            <li className="flex items-baseline justify-between gap-4 py-3 text-ink-soft">
              <p>Cargo por servicio</p>
              <p className="tabular-nums">{formatMoney(hold.feeCents, hold.currency)}</p>
            </li>
          ) : null}
        </ul>
        <div className="mt-2 flex items-baseline justify-between border-t border-line pt-4">
          <span className="font-semibold">Total</span>
          <span className="font-display text-3xl font-extrabold tabular-nums">{formatMoney(hold.totalCents, hold.currency)}</span>
        </div>

        {expired ? (
          <Link href={`/eventos/${hold.eventId}`} className="btn btn-ink mt-6 w-full">
            Volver a elegir entradas
          </Link>
        ) : (
          <>
            <div className="mt-6 flex items-center gap-3 rounded-xl p-4 shadow-[inset_0_0_0_1px_var(--color-line-strong)]">
              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-[#009ee3] text-xs font-extrabold text-white" aria-hidden>
                MP
              </span>
              <span className="min-w-0 text-sm">
                <span className="block font-semibold">Pagás con Mercado Pago</span>
                <span className="block text-xs text-muted">Tarjeta de crédito o débito, o dinero en tu cuenta.</span>
              </span>
            </div>
            <div className="mt-3 flex gap-3 rounded-xl bg-ink/[0.04] p-4 text-sm">
              <LockIcon className="mt-0.5 size-5 shrink-0 text-ink-soft" />
              <p className="text-muted">
                El pago lo procesa Mercado Pago: Lintick nunca ve los datos de tu tarjeta. Tus entradas aparecen en “Mis entradas” apenas se confirma.
              </p>
            </div>
            {payError ? (
              <p role="alert" className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
                {payError}
              </p>
            ) : null}
            <TicketButton type="button" onClick={pay} disabled={paying} className="mt-4 w-full" stub={formatMoney(hold.totalCents, hold.currency)}>
              {paying ? 'Abriendo Mercado Pago…' : 'Pagar'}
            </TicketButton>
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
