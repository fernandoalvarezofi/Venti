'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { fromLocalInput, parseMoneyToCents, send, toLocalInput } from '@/lib/client-api';
import { formatMoney } from '@/lib/format';
import type { AdminEvent, AdminTicketType, Stage } from '@/lib/types';
import { PlusIcon } from '../icons';
import { KIND_LABELS } from './event-wizard';

function useAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; message?: string }>, success?: string) =>
    start(async () => {
      setError(null);
      setOk(null);
      const r = await fn();
      if (!r.ok) setError(r.message ?? 'No se pudo completar.');
      else {
        if (success) setOk(success);
        router.refresh();
      }
    });
  return { pending, error, ok, run, setError };
}

function Feedback({ error, ok }: { error: string | null; ok: string | null }) {
  if (error)
    return (
      <p role="alert" className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
        {error}
      </p>
    );
  if (ok)
    return (
      <p role="status" className="mt-3 rounded-lg bg-success/10 px-3 py-2 text-sm text-success">
        {ok}
      </p>
    );
  return null;
}

// ─── Publicar / cancelar ───
export function EventActions({ orgId, event }: { orgId: string; event: AdminEvent }) {
  const a = useAction();
  const [cancelling, setCancelling] = useState(false);
  const closed = event.status === 'cancelled' || event.status === 'finished';
  const [reason, setReason] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [delError, setDelError] = useState<string | null>(null);
  const [delBusy, setDelBusy] = useState(false);
  const router = useRouter();
  const base = `/v1/organizations/${orgId}/events/${event.id}`;
  const canDelete = event.status === 'draft' || closed || new Date(event.endsAt).getTime() <= Date.now();

  async function remove() {
    setDelBusy(true);
    setDelError(null);
    const r = await send<{ result: 'deleted' | 'archived' }>('DELETE', base);
    setDelBusy(false);
    if (!r.ok) return setDelError(r.message);
    router.push(`/business/${orgId}/eventos`);
    router.refresh();
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {event.status === 'published' ? (
          <>
            <a href={`/acceso/${orgId}/${event.id}`} className="btn btn-ink">
              Control de ingreso
            </a>
            <a href={`/eventos/${event.id}`} target="_blank" rel="noreferrer" className="btn btn-ghost">
              Ver en Lintick ↗
            </a>
          </>
        ) : null}
        {event.status === 'draft' ? (
          <button type="button" disabled={a.pending} onClick={() => a.run(() => send('POST', `${base}/publish`), 'Evento publicado: ya está a la venta.')} className="btn-admit">
            {a.pending ? 'Publicando…' : 'Publicar'}
          </button>
        ) : null}
        {!closed ? (
          <button type="button" onClick={() => setCancelling((v) => !v)} className="btn btn-ghost text-danger">
            Cancelar evento
          </button>
        ) : null}
        {canDelete ? (
          <button type="button" onClick={() => setDeleting((v) => !v)} className="btn btn-ghost text-danger">
            Eliminar evento
          </button>
        ) : null}
      </div>
      {deleting ? (
        <div className="mt-4 rounded-[14px] bg-danger/5 p-4 shadow-[inset_0_0_0_1px_rgb(180_35_24/0.25)]">
          <p className="font-semibold text-danger">Eliminar “{event.title}”</p>
          <p className="mt-1 text-sm text-ink-soft">Desaparece de tus listas. Si nunca vendió entradas, se borra del todo; si tuvo ventas, se guardan las compras y los cobros para tu historial, pero no lo ves más en el panel.</p>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => setDeleting(false)} className="btn btn-ghost h-10 text-sm">Volver</button>
            <button type="button" disabled={delBusy} onClick={remove} className="btn h-10 bg-danger text-sm text-white hover:bg-danger/90">{delBusy ? 'Eliminando…' : 'Sí, eliminar'}</button>
          </div>
          {delError ? <p role="alert" className="mt-2 text-sm text-danger">{delError}</p> : null}
        </div>
      ) : null}
      {cancelling ? (
        <div className="mt-4 rounded-[14px] bg-danger/5 p-4 shadow-[inset_0_0_0_1px_rgb(180_35_24/0.25)]">
          <p className="font-semibold text-danger">Cancelar “{event.title}”</p>
          <p className="mt-1 text-sm text-ink-soft">Se saca de la venta, se liberan las reservas y se anulan todas las entradas emitidas. No se puede deshacer.</p>
          <label htmlFor="reason" className="mt-3 block text-sm font-semibold">
            Motivo (lo ven los compradores)
          </label>
          <input id="reason" className="field mt-1.5" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="Ej. Suspensión por alerta meteorológica" />
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => setCancelling(false)} className="btn btn-ghost h-10 text-sm">
              Volver
            </button>
            <button
              type="button"
              disabled={reason.trim().length < 5 || a.pending}
              onClick={() => a.run(() => send('POST', `${base}/cancel`, { reason: reason.trim() }), 'Evento cancelado.')}
              className="btn h-10 bg-danger text-sm text-white hover:bg-danger/90"
            >
              {a.pending ? 'Cancelando…' : 'Sí, cancelar evento'}
            </button>
          </div>
        </div>
      ) : null}
      <Feedback error={a.error} ok={a.ok} />
    </div>
  );
}

// ─── Editar datos ───
export function EditEventForm({ orgId, event }: { orgId: string; event: AdminEvent }) {
  const a = useAction();
  const [v, setV] = useState({ title: event.title, description: event.description, startsAt: toLocalInput(event.startsAt), endsAt: toLocalInput(event.endsAt) });
  const dirty = v.title !== event.title || v.description !== event.description || v.startsAt !== toLocalInput(event.startsAt) || v.endsAt !== toLocalInput(event.endsAt);

  function save(e: React.FormEvent) {
    e.preventDefault();
    const patch: Record<string, unknown> = {};
    if (v.title !== event.title) patch.title = v.title.trim();
    if (v.description !== event.description) patch.description = v.description;
    if (v.startsAt !== toLocalInput(event.startsAt)) patch.startsAt = fromLocalInput(v.startsAt);
    if (v.endsAt !== toLocalInput(event.endsAt)) patch.endsAt = fromLocalInput(v.endsAt);
    a.run(() => send('PATCH', `/v1/organizations/${orgId}/events/${event.id}`, patch), 'Cambios guardados.');
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <div>
        <label htmlFor="e-title" className="mb-1.5 block text-sm font-semibold">
          Nombre
        </label>
        <input id="e-title" className="field" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} maxLength={160} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="e-start" className="mb-1.5 block text-sm font-semibold">
            Empieza
          </label>
          <input id="e-start" type="datetime-local" className="field" value={v.startsAt} onChange={(e) => setV({ ...v, startsAt: e.target.value })} />
        </div>
        <div>
          <label htmlFor="e-end" className="mb-1.5 block text-sm font-semibold">
            Termina
          </label>
          <input id="e-end" type="datetime-local" className="field" value={v.endsAt} onChange={(e) => setV({ ...v, endsAt: e.target.value })} />
        </div>
      </div>
      <div>
        <label htmlFor="e-desc" className="mb-1.5 block text-sm font-semibold">
          Descripción
        </label>
        <textarea id="e-desc" className="field h-32 py-3" value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} maxLength={20000} />
      </div>
      <button type="submit" disabled={!dirty || a.pending} className="btn btn-ink">
        {a.pending ? 'Guardando…' : 'Guardar cambios'}
      </button>
      <Feedback error={a.error} ok={a.ok} />
    </form>
  );
}

// ─── Etapas de precio de un tipo ───
function StageRow({ orgId, eventId, type, stage, current, editable }: { orgId: string; eventId: string; type: AdminTicketType; stage: Stage; current: boolean; editable: boolean }) {
  const a = useAction();
  const [editing, setEditing] = useState(false);
  const [price, setPrice] = useState(String(stage.priceCents / 100));
  const locked = stage.soldCount + stage.heldCount > 0;
  const used = stage.soldCount + stage.heldCount;

  return (
    <li className="py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <span className="font-medium">
            {stage.position}. {stage.name}
          </span>
          {current ? <span className="ml-2 rounded-full bg-success/10 px-2 py-0.5 text-xs font-semibold text-success">Vigente</span> : null}
          <p className="text-xs text-muted">
            {stage.quantityLimit ? `${used} de ${stage.quantityLimit} usadas` : `${used} usadas · sin cupo`}
            {stage.endsAt ? ` · hasta ${new Date(stage.endsAt).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'short', timeStyle: 'short' })}` : ''}
          </p>
        </div>
        {editing ? (
          <div className="flex items-center gap-2">
            <label htmlFor={`p-${stage.id}`} className="sr-only">
              Nuevo precio
            </label>
            <input id={`p-${stage.id}`} className="field h-9 w-28 text-sm" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
            <button
              type="button"
              disabled={a.pending}
              onClick={() => {
                const cents = parseMoneyToCents(price);
                if (cents === null) return a.setError('Precio inválido.');
                a.run(() => send('PATCH', `/v1/organizations/${orgId}/events/${eventId}/ticket-types/${type.id}/stages/${stage.id}`, { priceCents: cents }), 'Precio actualizado.');
                setEditing(false);
              }}
              className="btn btn-ink h-9 px-3 text-xs"
            >
              Guardar
            </button>
            <button type="button" onClick={() => setEditing(false)} className="btn btn-ghost h-9 px-3 text-xs">
              No
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <span className="font-semibold tabular-nums">{formatMoney(stage.priceCents, type.currency)}</span>
            {editable && !locked ? (
              <button type="button" onClick={() => setEditing(true)} className="text-xs font-semibold text-muted hover:text-ink">
                Editar
              </button>
            ) : locked ? (
              <span className="text-xs text-muted" title="Ya vendió: para cambiar el precio, agregá una etapa nueva.">
                Precio fijo
              </span>
            ) : null}
          </div>
        )}
      </div>
      <Feedback error={a.error} ok={a.ok} />
    </li>
  );
}

export function TicketTypeCard({ orgId, event, type }: { orgId: string; event: AdminEvent; type: AdminTicketType }) {
  const a = useAction();
  const [adding, setAdding] = useState(false);
  const [stage, setStage] = useState({ name: '', price: '' });
  const [cap, setCap] = useState(String(type.capacity));
  const editable = event.status !== 'cancelled' && event.status !== 'finished';
  const base = `/v1/organizations/${orgId}/events/${event.id}/ticket-types/${type.id}`;

  return (
    <div className="rounded-[14px] p-4 shadow-[inset_0_0_0_1px_var(--color-line-strong)] sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-lg font-bold">
            {type.name} {type.hidden ? <span className="ml-1 rounded-full bg-ink/10 px-2 py-0.5 text-xs font-semibold text-ink-soft">Oculta</span> : null}
          </p>
          <p className="text-sm text-muted">
            {KIND_LABELS[type.kind] ?? type.kind} · máx. {type.maxPerOrder} por compra
          </p>
        </div>
        {editable ? (
          <button type="button" onClick={() => a.run(() => send('PATCH', base, { hidden: !type.hidden }), type.hidden ? 'Visible otra vez.' : 'Oculta del público.')} className="text-sm font-semibold text-muted hover:text-ink">
            {type.hidden ? 'Mostrar' : 'Ocultar'}
          </button>
        ) : null}
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
        <div>
          <div className="flex h-2 overflow-hidden rounded-full bg-ink/[0.07]" role="img" aria-label={`${type.sold} vendidas, ${type.held} reservadas de ${type.capacity}`}>
            <span className="bg-ink" style={{ width: `${(type.sold / Math.max(type.capacity, 1)) * 100}%` }} />
            <span className="bg-ink/35" style={{ width: `${(type.held / Math.max(type.capacity, 1)) * 100}%` }} />
          </div>
          <p className="mt-1.5 text-xs tabular-nums text-muted">
            <span className="font-semibold text-ink">{type.sold}</span> emitidas · {type.held} en reserva · {type.available} disponibles
          </p>
        </div>
        {editable ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const n = Number(cap);
              if (!Number.isInteger(n) || n < 1) return a.setError('Capacidad inválida.');
              a.run(() => send('PATCH', `${base}/capacity`, { capacity: n }), 'Capacidad actualizada.');
            }}
            className="flex items-center gap-2"
          >
            <label htmlFor={`cap-${type.id}`} className="text-xs text-muted">
              Capacidad
            </label>
            <input id={`cap-${type.id}`} className="field h-9 w-24 text-sm" inputMode="numeric" value={cap} onChange={(e) => setCap(e.target.value.replace(/\D/g, ''))} />
            <button type="submit" disabled={cap === String(type.capacity) || a.pending} className="btn btn-ghost h-9 px-3 text-xs">
              Guardar
            </button>
          </form>
        ) : null}
      </div>

      <ul className="mt-4 divide-y divide-line border-t border-line text-sm">
        {type.stages.map((s) => (
          <StageRow key={s.id} orgId={orgId} eventId={event.id} type={type} stage={s} current={type.currentStage?.id === s.id} editable={editable} />
        ))}
      </ul>

      {editable ? (
        adding ? (
          <form
            className="mt-3 flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const cents = parseMoneyToCents(stage.price);
              if (!stage.name.trim() || cents === null) return a.setError('Completá nombre y precio de la etapa.');
              a.run(() => send('POST', `${base}/stages`, { name: stage.name.trim(), priceCents: cents }), 'Etapa agregada.');
              setAdding(false);
              setStage({ name: '', price: '' });
            }}
          >
            <div>
              <label htmlFor={`sn-${type.id}`} className="mb-1 block text-xs font-semibold">
                Nombre
              </label>
              <input id={`sn-${type.id}`} className="field h-9 w-40 text-sm" value={stage.name} onChange={(e) => setStage({ ...stage, name: e.target.value })} placeholder="Puerta" />
            </div>
            <div>
              <label htmlFor={`sp-${type.id}`} className="mb-1 block text-xs font-semibold">
                Precio
              </label>
              <input id={`sp-${type.id}`} className="field h-9 w-28 text-sm" inputMode="decimal" value={stage.price} onChange={(e) => setStage({ ...stage, price: e.target.value })} placeholder="25000" />
            </div>
            <button type="submit" disabled={a.pending} className="btn btn-ink h-9 px-3 text-xs">
              Agregar
            </button>
            <button type="button" onClick={() => setAdding(false)} className="btn btn-ghost h-9 px-3 text-xs">
              Cancelar
            </button>
          </form>
        ) : (
          <button type="button" onClick={() => setAdding(true)} className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold hover:underline">
            <PlusIcon className="size-4" /> Agregar etapa
          </button>
        )
      ) : null}
      <Feedback error={a.error} ok={a.ok} />
    </div>
  );
}

// ─── Nuevo tipo de entrada ───
export function AddTicketTypeForm({ orgId, eventId }: { orgId: string; eventId: string }) {
  const a = useAction();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ name: '', kind: 'general', capacity: '', maxPerOrder: '6', stageName: 'General', price: '' });

  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn btn-ghost w-full">
        <PlusIcon className="size-4" /> Agregar tipo de entrada
      </button>
    );

  return (
    <form
      className="rounded-[14px] p-4 shadow-[inset_0_0_0_1px_var(--color-line-strong)] sm:p-5"
      onSubmit={(e) => {
        e.preventDefault();
        const cents = parseMoneyToCents(v.price);
        const cap = Number(v.capacity);
        if (!v.name.trim() || !Number.isInteger(cap) || cap < 1 || cents === null) return a.setError('Completá nombre, cantidad y precio.');
        a.run(
          () =>
            send('POST', `/v1/organizations/${orgId}/events/${eventId}/ticket-types`, {
              name: v.name.trim(),
              kind: v.kind,
              capacity: cap,
              maxPerOrder: Number(v.maxPerOrder) || 6,
              stages: [{ name: v.stageName.trim() || 'General', priceCents: cents }],
            }),
          'Tipo de entrada agregado.',
        );
        setOpen(false);
      }}
    >
      <p className="font-semibold">Nuevo tipo de entrada</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <input className="field" aria-label="Nombre" placeholder="Nombre (ej. VIP)" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} maxLength={80} />
        <select className="field" aria-label="Tipo" value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value })}>
          {Object.entries(KIND_LABELS).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
        <input className="field" aria-label="Cantidad" inputMode="numeric" placeholder="Cantidad" value={v.capacity} onChange={(e) => setV({ ...v, capacity: e.target.value.replace(/\D/g, '') })} />
        <input className="field" aria-label="Nombre de la etapa" placeholder="Etapa (ej. General)" value={v.stageName} onChange={(e) => setV({ ...v, stageName: e.target.value })} />
        <input className="field" aria-label="Precio" inputMode="decimal" placeholder="Precio" value={v.price} onChange={(e) => setV({ ...v, price: e.target.value })} />
        <input className="field" aria-label="Máximo por compra" inputMode="numeric" placeholder="Máx. por compra" value={v.maxPerOrder} onChange={(e) => setV({ ...v, maxPerOrder: e.target.value.replace(/\D/g, '') })} />
      </div>
      <div className="mt-3 flex gap-2">
        <button type="submit" disabled={a.pending} className="btn btn-ink h-10 text-sm">
          Agregar
        </button>
        <button type="button" onClick={() => setOpen(false)} className="btn btn-ghost h-10 text-sm">
          Cancelar
        </button>
      </div>
      <Feedback error={a.error} ok={a.ok} />
    </form>
  );
}

// ─── Cortesías ───
export function CourtesyForm({ orgId, event }: { orgId: string; event: AdminEvent }) {
  const a = useAction();
  const [v, setV] = useState({ ticketTypeId: event.ticketTypes[0]?.id ?? '', quantity: '1', holderName: '', holderEmail: '', holderDocument: '' });
  if (event.ticketTypes.length === 0) return <p className="text-sm text-muted">Agregá un tipo de entrada para poder emitir cortesías.</p>;
  if (event.status === 'cancelled' || event.status === 'finished') return <p className="text-sm text-muted">El evento está cerrado.</p>;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const q = Number(v.quantity);
        if (v.holderName.trim().length < 2 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.holderEmail.trim()) || !Number.isInteger(q) || q < 1 || q > 50) {
          return a.setError('Completá nombre, un email válido y una cantidad entre 1 y 50.');
        }
        if (v.holderDocument && !/^\d{7,9}$/.test(v.holderDocument)) return a.setError('El DNI tiene que tener entre 7 y 9 números.');
        a.run(
          () =>
            send('POST', `/v1/organizations/${orgId}/events/${event.id}/courtesies`, {
              ticketTypeId: v.ticketTypeId,
              quantity: q,
              holderName: v.holderName.trim(),
              holderEmail: v.holderEmail.trim(),
              ...(v.holderDocument ? { holderDocument: v.holderDocument } : {}),
            }),
          `${q === 1 ? 'Cortesía emitida' : `${q} cortesías emitidas`} para ${v.holderEmail.trim()}. Le llega a "Mis entradas" cuando ingrese con ese email confirmado.`,
        );
        setV({ ...v, quantity: '1', holderName: '', holderEmail: '', holderDocument: '' });
      }}
      className="grid gap-3 sm:grid-cols-2"
    >
      <select className="field sm:col-span-2" aria-label="Tipo de entrada" value={v.ticketTypeId} onChange={(e) => setV({ ...v, ticketTypeId: e.target.value })}>
        {event.ticketTypes.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name} ({t.available} disponibles)
          </option>
        ))}
      </select>
      <input className="field" aria-label="Cantidad" inputMode="numeric" value={v.quantity} onChange={(e) => setV({ ...v, quantity: e.target.value.replace(/\D/g, '') })} placeholder="Cantidad" />
      <input className="field" aria-label="Nombre del invitado" value={v.holderName} onChange={(e) => setV({ ...v, holderName: e.target.value })} placeholder="Nombre y apellido" maxLength={120} />
      <input className="field" aria-label="Email del invitado" type="email" value={v.holderEmail} onChange={(e) => setV({ ...v, holderEmail: e.target.value })} placeholder="Email" />
      <input className="field" aria-label="DNI (opcional)" inputMode="numeric" value={v.holderDocument} onChange={(e) => setV({ ...v, holderDocument: e.target.value.replace(/\D/g, '') })} placeholder="DNI (opcional)" maxLength={9} />
      <button type="submit" disabled={a.pending} className="btn btn-ink">
        {a.pending ? 'Emitiendo…' : 'Emitir cortesía'}
      </button>
      <div className="sm:col-span-2">
        <Feedback error={a.error} ok={a.ok} />
      </div>
    </form>
  );
}
