'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { formatMoney } from '@/lib/format';
import type { ApiErrorBody, Hold, PublicTicketType, SaleState } from '@/lib/types';
import { MinusIcon, PlusIcon } from './icons';

const STATE_LABEL: Record<Exclude<SaleState, 'on_sale'>, string> = {
  sold_out: 'Agotada',
  not_started: 'Todavía no está a la venta',
  ended: 'Venta finalizada',
  unavailable: 'No disponible',
};

export function TicketSelector({
  event,
  ticketTypes,
  loggedIn,
}: {
  event: { id: string; status: string };
  ticketTypes: PublicTicketType[];
  loggedIn: boolean;
}) {
  const router = useRouter();
  const [qty, setQty] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const lines = useMemo(
    () =>
      ticketTypes
        .filter((t) => (qty[t.id] ?? 0) > 0 && t.currentStage)
        .map((t) => ({ t, q: qty[t.id]!, subtotal: qty[t.id]! * t.currentStage!.priceCents })),
    [qty, ticketTypes],
  );
  const total = lines.reduce((a, l) => a + l.subtotal, 0);
  const units = lines.reduce((a, l) => a + l.q, 0);
  const currency = lines[0]?.t.currency ?? ticketTypes[0]?.currency ?? 'ARS';

  function change(t: PublicTicketType, delta: number) {
    setError(null);
    setQty((prev) => {
      const max = Math.min(t.maxPerOrder, t.available);
      const next = Math.max(0, Math.min(max, (prev[t.id] ?? 0) + delta));
      return { ...prev, [t.id]: next };
    });
  }

  function reserve() {
    if (!loggedIn) {
      router.push(`/ingresar?next=${encodeURIComponent(`/eventos/${event.id}`)}`);
      return;
    }
    start(async () => {
      setError(null);
      const res = await fetch('/api/v1/holds', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ eventId: event.id, items: lines.map((l) => ({ ticketTypeId: l.t.id, quantity: l.q })) }),
      }).catch(() => null);
      if (!res) return setError('No pudimos conectarnos. Revisá tu conexión e intentá de nuevo.');
      if (res.status === 401) return router.push(`/ingresar?next=${encodeURIComponent(`/eventos/${event.id}`)}`);
      const body = (await res.json().catch(() => null)) as Hold | ApiErrorBody | null;
      if (!res.ok || !body || 'error' in body) {
        setError((body && 'error' in body && body.error.message) || 'No se pudo reservar. Intentá de nuevo.');
        router.refresh();
        return;
      }
      router.push(`/reserva/${body.id}`);
    });
  }

  if (event.status !== 'published') {
    return <div className="ticket bg-surface p-6 text-muted">Las entradas de este evento ya no están a la venta.</div>;
  }
  if (ticketTypes.length === 0) {
    return <div className="ticket bg-surface p-6 text-muted">La productora todavía no habilitó entradas para este evento.</div>;
  }

  return (
    <div className="rounded-[var(--radius-ticket)] bg-surface">
      <div className="p-6 pb-4">
        <h2 className="text-2xl font-bold">Entradas</h2>
        <ul className="mt-4 divide-y divide-line">
          {ticketTypes.map((t) => {
            const q = qty[t.id] ?? 0;
            const onSale = t.saleState === 'on_sale' && t.currentStage;
            const max = Math.min(t.maxPerOrder, t.available);
            const few = onSale && t.available <= 20;
            return (
              <li key={t.id} className="flex items-center gap-4 py-4">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold leading-tight">{t.name}</p>
                  {onSale ? (
                    <p className="mt-1 text-sm">
                      <span className="font-semibold tabular-nums">{formatMoney(t.currentStage!.priceCents, t.currency)}</span>
                      <span className="text-muted"> · {t.currentStage!.name}</span>
                    </p>
                  ) : (
                    <p className="mt-1 text-sm text-muted">{STATE_LABEL[t.saleState as Exclude<SaleState, 'on_sale'>] ?? 'No disponible'}</p>
                  )}
                  {few ? <p className="mt-1 text-xs font-semibold text-warn">Quedan pocas</p> : null}
                  {t.description ? <p className="mt-1 text-xs text-muted">{t.description}</p> : null}
                </div>
                {onSale ? (
                  <div className="flex items-center gap-1" role="group" aria-label={`Cantidad de ${t.name}`}>
                    <button type="button" onClick={() => change(t, -1)} disabled={q === 0 || pending} className="grid size-9 place-items-center rounded-full shadow-[inset_0_0_0_1px_var(--color-line-strong)] hover:bg-ink/5 disabled:opacity-30" aria-label={`Quitar una ${t.name}`}>
                      <MinusIcon className="size-4" />
                    </button>
                    <output className="w-7 text-center font-semibold tabular-nums" aria-live="polite">
                      {q}
                    </output>
                    <button type="button" onClick={() => change(t, 1)} disabled={q >= max || pending} className="grid size-9 place-items-center rounded-full shadow-[inset_0_0_0_1px_var(--color-line-strong)] hover:bg-ink/5 disabled:opacity-30" aria-label={`Agregar una ${t.name}`}>
                      <PlusIcon className="size-4" />
                    </button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>
      <div className="cut" aria-hidden><span /></div>
      <div className="p-6 pt-3">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-muted">{units === 0 ? 'Elegí tus entradas' : units === 1 ? '1 entrada' : `${units} entradas`}</span>
          <span className="font-display text-3xl font-extrabold tabular-nums">{formatMoney(total, currency)}</span>
        </div>
        {error ? (
          <p role="alert" className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        ) : null}
        <button type="button" onClick={reserve} disabled={units === 0 || pending} className="btn btn-primary mt-4 w-full">
          {pending ? 'Reservando…' : loggedIn ? 'Reservar entradas' : 'Ingresá para reservar'}
        </button>
        <p className="mt-3 text-center text-xs text-muted">Las entradas quedan apartadas por 10 minutos mientras completás la compra.</p>
      </div>
    </div>
  );
}
