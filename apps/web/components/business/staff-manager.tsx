'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { fromLocalInput, send, toLocalInput } from '@/lib/client-api';
import type { Member, StaffShift } from '@/lib/types';

const fmt = (iso: string) => new Date(iso).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'short', timeStyle: 'short' });

/**
 * Turnos del personal de acceso: sólo pueden escanear dentro de su turno y en este evento.
 * Por defecto el turno va de 2 h antes del inicio a 1 h después del final.
 */
export function StaffManager({
  orgId,
  eventId,
  startsAt,
  endsAt,
  shifts,
  accessMembers,
}: {
  orgId: string;
  eventId: string;
  startsAt: string;
  endsAt: string;
  shifts: StaffShift[];
  accessMembers: Member[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [userId, setUserId] = useState(accessMembers[0]?.userId ?? '');
  const [from, setFrom] = useState(toLocalInput(new Date(new Date(startsAt).getTime() - 2 * 3_600_000).toISOString()));
  const [until, setUntil] = useState(toLocalInput(new Date(new Date(endsAt).getTime() + 3_600_000).toISOString()));
  const base = `/v1/organizations/${orgId}/events/${eventId}/staff`;

  const act = (fn: () => Promise<{ ok: boolean; message?: string }>, ok: string) =>
    start(async () => {
      setMsg(null);
      const r = await fn();
      if (!r.ok) setMsg({ ok: false, text: r.message ?? 'No se pudo completar.' });
      else {
        setMsg({ ok: true, text: ok });
        router.refresh();
      }
    });

  return (
    <div className="space-y-4">
      {shifts.length === 0 ? (
        <p className="text-sm text-muted">Nadie del equipo de acceso tiene turno en este evento. Sin turno no pueden escanear.</p>
      ) : (
        <ul className="divide-y divide-line">
          {shifts.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-sm">
              <div className="min-w-0">
                <p className="font-medium">{s.fullName}</p>
                <p className="text-xs text-muted">
                  {fmt(s.validFrom)} → {fmt(s.validUntil)}
                </p>
              </div>
              <button type="button" disabled={pending} onClick={() => act(() => send('DELETE', `${base}/${s.userId}`), 'Turno quitado.')} className="text-xs font-semibold text-muted hover:text-danger">
                Quitar
              </button>
            </li>
          ))}
        </ul>
      )}

      {accessMembers.length === 0 ? (
        <p className="text-sm text-muted">Para asignar turnos, sumá personas con rol “Acceso” en Equipo.</p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const vf = fromLocalInput(from);
            const vu = fromLocalInput(until);
            if (!userId || !vf || !vu) return setMsg({ ok: false, text: 'Completá persona, inicio y fin del turno.' });
            act(() => send('PUT', base, { userId, validFrom: vf, validUntil: vu }), 'Turno asignado.');
          }}
          className="grid gap-3 sm:grid-cols-[1.2fr_1fr_1fr_auto] sm:items-end"
        >
          <div>
            <label htmlFor="staff-user" className="mb-1 block text-xs font-semibold">
              Persona
            </label>
            <select id="staff-user" className="field h-10 text-sm" value={userId} onChange={(e) => setUserId(e.target.value)}>
              {accessMembers.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.fullName}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="staff-from" className="mb-1 block text-xs font-semibold">
              Desde
            </label>
            <input id="staff-from" type="datetime-local" className="field h-10 text-sm" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label htmlFor="staff-until" className="mb-1 block text-xs font-semibold">
              Hasta
            </label>
            <input id="staff-until" type="datetime-local" className="field h-10 text-sm" value={until} onChange={(e) => setUntil(e.target.value)} />
          </div>
          <button type="submit" disabled={pending} className="btn btn-ink h-10 text-sm">
            Asignar
          </button>
        </form>
      )}
      {msg ? (
        <p role={msg.ok ? 'status' : 'alert'} className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}>
          {msg.text}
        </p>
      ) : null}
    </div>
  );
}
