import Link from 'next/link';
import { formatMoney } from '@/lib/format';
import type { AdminEvent, EventStats } from '@/lib/types';

const pct = (n: number, of: number) => (of > 0 ? Math.round((n / of) * 100) : 0);

/** Plata del evento: la productora cobra el precio completo; el cargo por servicio lo pagó el comprador. */
export function MoneyBreakdown({ s }: { s: EventStats }) {
  const rate = (s.commissionBps / 100).toLocaleString('es-AR');
  return (
    <div>
      <p className="text-sm text-muted">Para tu productora</p>
      <p className="mt-1 font-display text-[2.6rem] font-extrabold leading-none tracking-[-0.04em] tabular-nums">{formatMoney(s.netCents)}</p>
      <dl className="mt-5 space-y-2 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Entradas vendidas (precio completo)</dt>
          <dd className="tabular-nums">{formatMoney(s.grossCents)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Cargo por servicio ({rate}%, lo pagó el comprador)</dt>
          <dd className="tabular-nums text-muted">{formatMoney(s.commissionCents)}</dd>
        </div>
        <div className="flex justify-between gap-3 border-t border-line pt-2 font-semibold">
          <dt>Total que pagaron los compradores</dt>
          <dd className="tabular-nums">{formatMoney(s.grossCents + s.commissionCents)}</dd>
        </div>
      </dl>
      <p className="mt-4 text-xs text-muted">Cobrás el precio completo de cada entrada. El cargo por servicio lo paga el comprador y es el ingreso de Lintick; las cortesías no tienen cargo.</p>
    </div>
  );
}

/** Ingreso en la puerta: barra de progreso + acceso directo al escáner. */
export function EntryProgress({ s, orgId, eventId, published }: { s: EventStats; orgId: string; eventId: string; published: boolean }) {
  const issued = s.sold;
  const p = pct(s.checkedIn, issued);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-display text-[2.6rem] font-extrabold leading-none tracking-[-0.04em] tabular-nums">{s.checkedIn.toLocaleString('es-AR')}</p>
        <p className="text-sm text-muted">de {issued.toLocaleString('es-AR')} ingresaron · {p}%</p>
      </div>
      <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-ink/[0.07]" role="progressbar" aria-valuenow={p} aria-valuemin={0} aria-valuemax={100} aria-label="Ingreso al evento">
        <div className="h-full rounded-full bg-success transition-[width] duration-700" style={{ width: `${p}%` }} />
      </div>
      {published ? (
        <Link href={`/acceso/${orgId}/${eventId}`} className="btn btn-ink mt-5 w-full">
          Abrir control de ingreso
        </Link>
      ) : (
        <p className="mt-4 text-xs text-muted">El control de ingreso se habilita cuando publicás el evento.</p>
      )}
    </div>
  );
}

/** Desglose por tipo de entrada: ocupación, ingresos y recaudación. */
export function TypeBreakdown({ s }: { s: EventStats }) {
  if (s.byType.length === 0) return <p className="text-sm text-muted">Todavía no hay tipos de entrada.</p>;
  return (
    <div className="-mx-5 overflow-x-auto sm:mx-0">
      <table className="w-full min-w-[420px] text-left text-sm">
        <thead className="text-xs uppercase tracking-[0.08em] text-muted">
          <tr className="border-b border-line">
            <th scope="col" className="px-5 py-2.5 font-semibold sm:px-0">Tipo</th>
            <th scope="col" className="py-2.5 font-semibold">Ocupación</th>
            <th scope="col" className="py-2.5 pr-4 text-right font-semibold">Ingresaron</th>
            <th scope="col" className="py-2.5 text-right font-semibold">Recaudado</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {s.byType.map((t) => {
            const p = pct(t.sold, t.capacity);
            return (
              <tr key={t.id}>
                <td className="px-5 py-3 font-medium sm:px-0">
                  {t.name}
                  {t.courtesies > 0 ? <span className="block text-xs font-normal text-muted">{t.courtesies} cortesías</span> : null}
                </td>
                <td className="py-3 pr-4">
                  <div className="flex min-w-[120px] flex-col gap-1">
                    <div className="h-2 overflow-hidden rounded-full bg-ink/[0.07]">
                      <div className="h-full rounded-full bg-ink" style={{ width: `${p}%` }} />
                    </div>
                    <span className="text-xs tabular-nums text-muted">
                      {t.sold}/{t.capacity} · {p}%
                    </span>
                  </div>
                </td>
                <td className="py-3 pr-4 text-right tabular-nums">{t.checkedIn}</td>
                <td className="py-3 text-right tabular-nums">{formatMoney(t.grossCents)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Lista de chequeo antes y después de publicar: qué falta para que el evento venda bien. */
export function Readiness({ e, orgId, staffCount, paymentsConnected }: { e: AdminEvent; orgId: string; staffCount: number; paymentsConnected: boolean | null }) {
  const base = `/business/${orgId}/eventos/${e.id}`;
  const items = [
    { ok: e.ticketTypes.length > 0, label: 'Tipos de entrada con precio', href: `${base}?tab=entradas`, required: true },
    { ok: Boolean(e.venue), label: 'Lugar asignado', href: `${base}?tab=contenido`, required: true },
    { ok: Boolean(e.coverImage), label: 'Portada (aparece de fondo en la tarjeta)', href: `${base}?tab=contenido` },
    { ok: e.lineup.length > 0, label: 'Line-up cargado', href: `${base}?tab=contenido` },
    { ok: e.amenities.length + e.extraAmenities.length > 0, label: 'Qué hay en el evento', href: `${base}?tab=contenido` },
    { ok: e.description.trim().length >= 40, label: 'Descripción de al menos 40 letras', href: `${base}?tab=contenido` },
    { ok: staffCount > 0, label: 'Personal de acceso con turno', href: `${base}?tab=equipo` },
    ...(paymentsConnected === null ? [] : [{ ok: paymentsConnected, label: 'Cuenta de Mercado Pago conectada (para cobrar online)', href: `/business/${orgId}/cobros`, required: true }]),
  ];
  const done = items.filter((i) => i.ok).length;
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <p className="text-sm text-muted">
          {done} de {items.length} listos
        </p>
        <p className="font-display text-xl font-extrabold tabular-nums">{pct(done, items.length)}%</p>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink/[0.07]">
        <div className="h-full rounded-full bg-accent" style={{ width: `${pct(done, items.length)}%` }} />
      </div>
      <ul className="mt-4 space-y-1">
        {items.map((i) => (
          <li key={i.label}>
            <Link href={i.href} className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-ink/[0.04]">
              <span aria-hidden className={`grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-bold ${i.ok ? 'bg-success text-white' : 'shadow-[inset_0_0_0_1.5px_var(--color-line-strong)]'}`}>
                {i.ok ? '✓' : ''}
              </span>
              <span className={i.ok ? 'text-muted line-through decoration-ink/20' : ''}>{i.label}</span>
              {!i.ok && i.required ? <span className="ml-auto text-xs font-semibold text-danger">Obligatorio</span> : null}
              <span className="sr-only">{i.ok ? '(listo)' : '(pendiente)'}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export const EVENT_TABS = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'entradas', label: 'Entradas' },
  { id: 'contenido', label: 'Contenido' },
  { id: 'asistentes', label: 'Asistentes' },
  { id: 'equipo', label: 'Equipo' },
] as const;
export type EventTab = (typeof EVENT_TABS)[number]['id'];

export function EventTabs({ base, active, counts }: { base: string; active: EventTab; counts?: Partial<Record<EventTab, number>> }) {
  return (
    <nav aria-label="Secciones del evento" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-1 border-b border-line">
        {EVENT_TABS.map((t) => {
          const on = t.id === active;
          return (
            <li key={t.id}>
              <Link
                href={t.id === 'resumen' ? base : `${base}?tab=${t.id}`}
                aria-current={on ? 'page' : undefined}
                className={`relative inline-flex h-11 items-center gap-2 px-4 text-sm font-semibold transition-colors ${on ? 'text-ink' : 'text-muted hover:text-ink'}`}
              >
                {t.label}
                {counts?.[t.id] !== undefined ? <span className="rounded-full bg-ink/[0.07] px-1.5 py-0.5 text-[11px] tabular-nums">{counts[t.id]}</span> : null}
                {on ? <span className="absolute inset-x-3 -bottom-px h-[2.5px] rounded-full bg-ink" /> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
