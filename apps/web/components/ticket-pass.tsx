'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { dateParts, formatMoney, ticketCode } from '@/lib/format';
import type { Ticket, Transfer } from '@/lib/types';
import { RefreshIcon } from './icons';

const STATUS: Record<Ticket['status'], { label: string; tone: string }> = {
  valid: { label: 'Vigente', tone: 'bg-success/10 text-success' },
  locked: { label: 'Transferencia pendiente', tone: 'bg-warn/10 text-warn' },
  used: { label: 'Ya ingresó', tone: 'bg-ink/10 text-ink-soft' },
  void: { label: 'Transferida', tone: 'bg-ink/10 text-ink-soft' },
  cancelled: { label: 'Cancelada', tone: 'bg-danger/10 text-danger' },
  refunded: { label: 'Devuelta', tone: 'bg-ink/10 text-ink-soft' },
};

/** Formulario para transferir la entrada a otra persona (le llega un mail y la acepta con su cuenta). */
function TransferForm({ ticketId, onDone, onCancel }: { ticketId: string; onDone: () => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="mt-4 w-full max-w-[16rem] space-y-2 text-left text-sm"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const res = await fetch(`/api/v1/me/tickets/${ticketId}/transfer`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ toName: name, toEmail: email }) }).catch(() => null);
        setBusy(false);
        if (!res?.ok) {
          const body = (await res?.json().catch(() => null)) as { error?: { message?: string } } | null;
          setError(body?.error?.message ?? 'No pudimos enviarla. Revisá los datos e intentá de nuevo.');
          return;
        }
        onDone();
      }}
    >
      <p className="text-xs text-muted">Le llega un mail y la acepta con su cuenta de Lintick. Al aceptarla, queda a su nombre con un QR nuevo y deja de estar en tu cuenta.</p>
      <label className="block">
        <span className="text-xs font-semibold">Nombre</span>
        <input required minLength={2} value={name} onChange={(e) => setName(e.target.value)} className="field mt-1 h-10 w-full" autoComplete="off" />
      </label>
      <label className="block">
        <span className="text-xs font-semibold">Email</span>
        <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="field mt-1 h-10 w-full" inputMode="email" autoComplete="off" />
      </label>
      {error ? <p role="alert" className="text-xs text-danger">{error}</p> : null}
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onCancel} className="btn btn-ghost h-10 flex-1 px-2 text-sm">Volver</button>
        <button type="submit" disabled={busy} className="btn btn-ink h-10 flex-1 px-2 text-sm">{busy ? 'Enviando…' : 'Enviar'}</button>
      </div>
    </form>
  );
}

export function TicketPass({ ticket, qrSvg, position, transfer }: { ticket: Ticket; qrSvg: string | null; position?: { i: number; n: number }; transfer?: Transfer | null }) {
  const [transferring, setTransferring] = useState(false);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const d = dateParts(ticket.event.startsAt);
  const s = STATUS[ticket.status];

  function rotate() {
    start(async () => {
      setError(null);
      const res = await fetch(`/api/v1/me/tickets/${ticket.id}/rotate-qr`, { method: 'POST' }).catch(() => null);
      if (!res?.ok) {
        setError('No pudimos generar un QR nuevo. Intentá de nuevo.');
        return;
      }
      setConfirming(false);
      router.refresh();
    });
  }

  return (
    <article className="grid rounded-[var(--radius-ticket)] bg-surface sm:grid-cols-[1fr_auto]" aria-label={`Entrada ${ticket.ticketType.name} para ${ticket.event.title}`}>
      <div className="p-6 sm:p-7">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${s.tone}`}>{s.label}</span>
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">{ticket.ticketType.name}</span>
          {position && position.n > 1 ? <span className="ml-auto rounded-full bg-ink px-2.5 py-1 text-xs font-bold text-paper">Entrada {position.i} de {position.n}</span> : null}
        </div>
        <h2 className="mt-3 text-2xl font-bold leading-tight">{ticket.event.title}</h2>
        <p className="mt-2 text-sm">
          {d.long} · {d.time} h
        </p>
        {ticket.event.venueName ? (
          <p className="text-sm text-muted">
            {ticket.event.venueName}
            {ticket.event.city ? `, ${ticket.event.city}` : ''}
          </p>
        ) : null}
        <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-muted">Titular</dt>
            <dd className="font-semibold">{ticket.holderName}</dd>
          </div>
          <div>
            <dt className="text-muted">Valor</dt>
            <dd className="font-semibold tabular-nums">{ticket.priceCents === 0 ? 'Cortesía' : formatMoney(ticket.priceCents, ticket.currency)}</dd>
          </div>
        </dl>
      </div>

      <div className="vcut border-t border-dashed border-line-strong p-6 sm:border-l sm:border-t-0 sm:p-7">
        {ticket.status === 'valid' && transferring ? (
          <div className="flex flex-col items-center">
            <p className="font-semibold">Transferir esta entrada</p>
            <TransferForm ticketId={ticket.id} onCancel={() => setTransferring(false)} onDone={() => { setTransferring(false); router.refresh(); }} />
          </div>
        ) : ticket.status === 'locked' && transfer ? (
          <div className="flex max-w-[16rem] flex-col items-center text-center">
            <div className="grid size-44 place-items-center rounded-xl bg-warn/10 p-4 text-sm text-ink-soft">
              Enviada a <strong className="block text-base text-ink">{transfer.toName}</strong>
              <span className="block text-xs text-muted">{transfer.toEmail}</span>
              Esperando que la acepte. Mientras tanto, no entra.
            </div>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  setError(null);
                  const res = await fetch(`/api/v1/me/transfers/${transfer.id}/cancel`, { method: 'POST' }).catch(() => null);
                  if (!res?.ok) setError('No pudimos cancelarla. Intentá de nuevo.');
                  else router.refresh();
                })
              }
              className="btn btn-ghost mt-3 h-9 px-3 text-xs"
            >
              {pending ? '…' : 'Cancelar y recuperarla'}
            </button>
            {error ? <p role="alert" className="mt-2 text-xs text-danger">{error}</p> : null}
          </div>
        ) : qrSvg && ticket.status === 'valid' ? (
          <div className="flex flex-col items-center">
            <div className="size-44 rounded-xl bg-white p-3" role="img" aria-label="Código QR de la entrada" dangerouslySetInnerHTML={{ __html: qrSvg }} />
            <p className="mt-3 text-center">
              <span className="block text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-muted">Entrada Nº</span>
              <span className="font-mono text-lg font-bold tracking-[0.08em]">{ticketCode(ticket.id)}</span>
            </p>
            {confirming ? (
              <div className="mt-4 w-44 text-center text-xs">
                <p className="text-muted">El QR actual deja de servir. ¿Seguro?</p>
                <div className="mt-2 flex gap-2">
                  <button type="button" onClick={() => setConfirming(false)} className="btn btn-ghost h-9 flex-1 px-2 text-xs">
                    No
                  </button>
                  <button type="button" onClick={rotate} disabled={pending} className="btn btn-ink h-9 flex-1 px-2 text-xs">
                    {pending ? '…' : 'Sí, cambiar'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-4 flex flex-col items-center gap-2">
                <button type="button" onClick={() => setTransferring(true)} className="btn btn-ghost h-9 px-4 text-xs">
                  Transferir a otra persona
                </button>
                <button type="button" onClick={() => setConfirming(true)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted hover:text-ink">
                  <RefreshIcon className="size-3.5" /> Generar QR nuevo
                </button>
              </div>
            )}
            {error ? (
              <p role="alert" className="mt-2 w-44 text-center text-xs text-danger">
                {error}
              </p>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-col items-center">
            <div className="grid size-44 place-items-center rounded-xl bg-ink/5 p-4 text-center text-sm text-muted">
              {ticket.status === 'used' && ticket.usedAt ? `Ingresó el ${dateParts(ticket.usedAt).long} a las ${dateParts(ticket.usedAt).time} h.` : 'Esta entrada ya no habilita el ingreso.'}
            </div>
            <p className="mt-3 font-mono text-sm font-bold tracking-[0.08em] text-muted">Nº {ticketCode(ticket.id)}</p>
          </div>
        )}
      </div>
    </article>
  );
}
