'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { dateParts, formatMoney, posterColors } from '@/lib/format';
import type { ApiErrorBody, Hold, PublicEventDetail, PublicTicketType, Quote, SaleState } from '@/lib/types';
import { CalendarIcon, MinusIcon, PinIcon, PlusIcon, TicketIcon, UserIcon } from './icons';
import { Sheet } from './sheet';

const STATE_LABEL: Record<Exclude<SaleState, 'on_sale'>, string> = {
  sold_out: 'Agotada',
  not_started: 'Todavía no está a la venta',
  ended: 'Venta finalizada',
  unavailable: 'No disponible',
};

function lowestPrice(types: PublicTicketType[]) {
  const prices = types.filter((t) => t.saleState === 'on_sale' && t.currentStage).map((t) => t.currentStage!.priceCents);
  return prices.length ? Math.min(...prices) : null;
}

function availabilityText(types: PublicTicketType[]) {
  const onSale = types.filter((t) => t.saleState === 'on_sale');
  if (onSale.length === 0) return types.some((t) => t.saleState === 'not_started') ? 'Todavía no está a la venta' : 'Agotado';
  const left = onSale.reduce((a, t) => a + t.available, 0);
  return left <= 30 ? `Quedan ${left}` : 'Disponibles';
}

/**
 * Bloque de compra del evento: resumen en el lateral (escritorio), barra fija abajo (celular)
 * y la hoja de compra que se abre desde cualquiera de los dos.
 */
export function BuyPanel({ event, loggedIn }: { event: PublicEventDetail; loggedIn: boolean }) {
  const [open, setOpen] = useState(false);
  const from = lowestPrice(event.ticketTypes);
  const buyable = event.status === 'published' && from !== null;
  const currency = event.ticketTypes[0]?.currency ?? 'ARS';
  const closedText =
    event.status === 'cancelled'
      ? 'Evento cancelado'
      : event.status === 'finished'
        ? 'Evento finalizado'
        : event.ticketTypes.length === 0
          ? 'Entradas a confirmar'
          : availabilityText(event.ticketTypes);

  return (
    <>
      <div className="hidden overflow-hidden rounded-[var(--radius-ticket)] bg-surface lg:block">
        <div className="p-6">
          <p className="eyebrow">Entradas</p>
          {from !== null ? (
            <p className="mt-2">
              <span className="text-muted">Desde </span>
              <span className="font-display text-4xl font-extrabold tabular-nums">{formatMoney(from, currency)}</span>
            </p>
          ) : (
            <p className="mt-2 font-display text-2xl font-bold">{closedText}</p>
          )}
          <ul className="mt-4 space-y-2 text-sm">
            {event.ticketTypes.map((t) => (
              <li key={t.id} className="flex justify-between gap-3">
                <span className="truncate">{t.name}</span>
                <span className={t.saleState === 'on_sale' ? 'tabular-nums text-ink-soft' : 'text-muted'}>
                  {t.saleState === 'on_sale' && t.currentStage ? formatMoney(t.currentStage.priceCents, t.currency) : STATE_LABEL[t.saleState as Exclude<SaleState, 'on_sale'>]}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="cut" aria-hidden>
          <span />
        </div>
        <div className="p-6 pt-3">
          <button type="button" onClick={() => setOpen(true)} disabled={!buyable} className="btn btn-primary w-full">
            {buyable ? 'Comprar entradas' : closedText}
          </button>
          {buyable ? <p className="mt-3 text-center text-xs text-muted">{availabilityText(event.ticketTypes)} · El precio final lo ves antes de confirmar</p> : null}
        </div>
      </div>

      {/* Barra fija en el celular: el precio siempre a mano. */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-md lg:hidden">
        <div className="mx-auto flex max-w-6xl items-center gap-4">
          <div className="min-w-0 flex-1">
            {from !== null ? (
              <>
                <p className="text-xs text-muted">Desde</p>
                <p className="font-display text-xl font-extrabold leading-none tabular-nums">{formatMoney(from, currency)}</p>
              </>
            ) : (
              <p className="font-semibold">{closedText}</p>
            )}
          </div>
          <button type="button" onClick={() => setOpen(true)} disabled={!buyable} className="btn btn-primary px-6">
            Comprar
          </button>
        </div>
      </div>

      <Sheet open={open} onClose={() => setOpen(false)} label={`Comprar entradas para ${event.title}`}>
        <CheckoutSheet event={event} loggedIn={loggedIn} onClose={() => setOpen(false)} />
      </Sheet>
    </>
  );
}

type QuoteState = { status: 'idle' } | { status: 'loading' } | { status: 'ok'; quote: Quote } | { status: 'error'; message: string };

function CheckoutSheet({ event, loggedIn, onClose }: { event: PublicEventDetail; loggedIn: boolean; onClose: () => void }) {
  const router = useRouter();
  const [qty, setQty] = useState<Record<string, number>>({});
  const [quote, setQuote] = useState<QuoteState>({ status: 'idle' });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const seq = useRef(0);
  const d = dateParts(event.startsAt);
  const c = posterColors(event.id);

  const items = useMemo(
    () =>
      Object.entries(qty)
        .filter(([, q]) => q > 0)
        .map(([ticketTypeId, quantity]) => ({ ticketTypeId, quantity })),
    [qty],
  );
  const units = items.reduce((a, i) => a + i.quantity, 0);

  // Cotización del servidor (precio vigente + cargo). Se pide con una pequeña espera para no
  // disparar una consulta por cada toque, y se descartan respuestas viejas.
  useEffect(() => {
    if (items.length === 0) {
      setQuote({ status: 'idle' });
      return;
    }
    const id = ++seq.current;
    setQuote({ status: 'loading' });
    const t = setTimeout(async () => {
      const res = await fetch('/api/v1/checkout/quote', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ eventId: event.id, items }),
      }).catch(() => null);
      if (id !== seq.current) return;
      if (!res) return setQuote({ status: 'error', message: 'No pudimos calcular el precio. Revisá tu conexión.' });
      const body = (await res.json().catch(() => null)) as Quote | ApiErrorBody | null;
      if (id !== seq.current) return;
      if (!res.ok || !body || 'error' in body) {
        setQuote({ status: 'error', message: (body && 'error' in body && body.error.message) || 'No pudimos calcular el precio.' });
        return;
      }
      setQuote({ status: 'ok', quote: body });
    }, 250);
    return () => clearTimeout(t);
  }, [items, event.id]);

  function change(t: PublicTicketType, delta: number) {
    setError(null);
    setQty((prev) => {
      const max = Math.min(t.maxPerOrder, t.available);
      return { ...prev, [t.id]: Math.max(0, Math.min(max, (prev[t.id] ?? 0) + delta)) };
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
        body: JSON.stringify({ eventId: event.id, items }),
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

  const q = quote.status === 'ok' ? quote.quote : null;
  const canReserve = units > 0 && quote.status === 'ok' && !pending;
  const cta = !loggedIn
    ? 'Ingresá para reservar'
    : pending
      ? 'Reservando…'
      : units === 0
        ? 'Elegí tus entradas'
        : q
          ? `Reservar ${units === 1 ? '1 entrada' : `${units} entradas`} · ${formatMoney(q.totalCents, q.currency)}`
          : 'Calculando precio…';

  return (
    <>
      {/* Encabezado: mini afiche + datos del evento */}
      <div className="flex items-start gap-4 px-5 pb-4 pt-3 sm:px-6 sm:pt-6">
        <div className="grid size-16 shrink-0 place-content-center rounded-xl text-center leading-none" style={{ background: c.bg, color: c.fg }} aria-hidden>
          <span className="font-display text-2xl font-extrabold tracking-[-0.05em]">{d.day}</span>
          <span className="text-[0.65rem] font-bold tracking-[0.1em]">{d.month}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="eyebrow truncate">{event.organization.name}</p>
          <h2 className="mt-1 line-clamp-2 text-xl font-bold leading-tight">{event.title}</h2>
        </div>
        <button type="button" onClick={onClose} className="grid size-9 shrink-0 place-items-center rounded-full bg-ink/5 text-ink hover:bg-ink/10" aria-label="Cerrar">
          <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-6 sm:px-6">
        <div className="fact-grid grid-cols-2 text-sm">
          <div className="flex gap-2.5">
            <CalendarIcon className="mt-0.5 size-4 shrink-0 text-muted" />
            <div className="min-w-0">
              <p className="font-semibold">{d.weekday} {d.day}</p>
              <p className="text-xs text-muted">{d.time} h</p>
            </div>
          </div>
          <div className="flex gap-2.5">
            <PinIcon className="mt-0.5 size-4 shrink-0 text-muted" />
            <div className="min-w-0">
              <p className="truncate font-semibold">{event.venue?.name ?? 'A confirmar'}</p>
              <p className="truncate text-xs text-muted">{event.venue?.city ?? ''}</p>
            </div>
          </div>
          <div className="flex gap-2.5">
            <TicketIcon className="mt-0.5 size-4 shrink-0 text-muted" />
            <div>
              <p className="font-semibold">{availabilityText(event.ticketTypes)}</p>
              <p className="text-xs text-muted">Hasta {Math.max(...event.ticketTypes.map((t) => t.maxPerOrder), 1)} por compra</p>
            </div>
          </div>
          <div className="flex gap-2.5">
            <UserIcon className="mt-0.5 size-4 shrink-0 text-muted" />
            <div className="min-w-0">
              <p className="truncate font-semibold">Organiza</p>
              <p className="truncate text-xs text-muted">{event.organization.name}</p>
            </div>
          </div>
        </div>

        <h3 className="mt-6 text-lg font-bold">Elegí tus entradas</h3>
        <ul className="mt-2 divide-y divide-line">
          {event.ticketTypes.map((t) => {
            const n = qty[t.id] ?? 0;
            const onSale = t.saleState === 'on_sale' && t.currentStage;
            const max = Math.min(t.maxPerOrder, t.available);
            return (
              <li key={t.id} className={`flex items-center gap-4 py-4 ${onSale ? '' : 'opacity-60'}`}>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold leading-tight">{t.name}</p>
                  {onSale ? (
                    <p className="mt-1 text-sm">
                      <span className="font-semibold tabular-nums">{formatMoney(t.currentStage!.priceCents, t.currency)}</span>
                      <span className="text-muted"> · {t.currentStage!.name}</span>
                      {t.available <= 20 ? <span className="ml-2 text-xs font-semibold text-warn">Quedan {t.available}</span> : null}
                    </p>
                  ) : (
                    <p className="mt-1 text-sm text-muted">{STATE_LABEL[t.saleState as Exclude<SaleState, 'on_sale'>] ?? 'No disponible'}</p>
                  )}
                  {t.description ? <p className="mt-1 text-xs text-muted">{t.description}</p> : null}
                </div>
                {onSale ? (
                  <div className="flex items-center gap-1" role="group" aria-label={`Cantidad de ${t.name}`}>
                    <button type="button" onClick={() => change(t, -1)} disabled={n === 0 || pending} className="grid size-9 place-items-center rounded-full shadow-[inset_0_0_0_1px_var(--color-line-strong)] hover:bg-ink/5 disabled:opacity-30" aria-label={`Quitar una ${t.name}`}>
                      <MinusIcon className="size-4" />
                    </button>
                    <output className="w-7 text-center font-semibold tabular-nums" aria-live="polite">
                      {n}
                    </output>
                    <button type="button" onClick={() => change(t, 1)} disabled={n >= max || pending} className="grid size-9 place-items-center rounded-full shadow-[inset_0_0_0_1px_var(--color-line-strong)] hover:bg-ink/5 disabled:opacity-30" aria-label={`Agregar una ${t.name}`}>
                      <PlusIcon className="size-4" />
                    </button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>

        {/* Desglose: sólo con números del servidor */}
        {units > 0 ? (
          <div className="mt-4 rounded-[14px] bg-surface p-4 text-sm" aria-live="polite" aria-busy={quote.status === 'loading'}>
            {quote.status === 'loading' ? (
              <div className="space-y-2.5" aria-label="Calculando precio">
                <div className="skeleton h-4 w-3/4" />
                <div className="skeleton h-4 w-1/2" />
                <div className="skeleton h-5 w-2/3" />
              </div>
            ) : quote.status === 'error' ? (
              <p className="text-danger">{quote.message}</p>
            ) : q ? (
              <dl className="space-y-1.5">
                {q.lines.map((l) => (
                  <div key={l.ticketTypeId} className="flex justify-between gap-3 text-ink-soft">
                    <dt>
                      {l.quantity} × {l.ticketTypeName} <span className="text-muted">({l.stageName})</span>
                    </dt>
                    <dd className="tabular-nums">{formatMoney(l.lineTotalCents, q.currency)}</dd>
                  </div>
                ))}
                <div className="flex justify-between gap-3 text-muted">
                  <dt>Cargo por servicio ({(q.feeBps / 100).toLocaleString('es-AR')}%)</dt>
                  <dd className="tabular-nums">{formatMoney(q.feeCents, q.currency)}</dd>
                </div>
                <div className="mt-2 flex items-baseline justify-between gap-3 border-t border-line pt-3">
                  <dt className="font-semibold">Total</dt>
                  <dd className="font-display text-2xl font-extrabold tabular-nums">{formatMoney(q.totalCents, q.currency)}</dd>
                </div>
              </dl>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="border-t border-line bg-paper px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 sm:px-6">
        {error ? (
          <p role="alert" className="mb-3 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        ) : null}
        <button type="button" onClick={reserve} disabled={loggedIn ? !canReserve : false} className="btn btn-primary w-full">
          {cta}
        </button>
        <p className="mt-2.5 text-center text-xs text-muted">Apartamos tus entradas 10 minutos para que completes el pago.</p>
      </div>
    </>
  );
}
