'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { send } from '@/lib/client-api';
import type { OrgRole } from '@/lib/types';

export function AddMemberForm({ orgId, roles }: { orgId: string; roles: { value: OrgRole; label: string; body: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<OrgRole>('manager');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setMsg({ ok: false, text: 'Escribí un email válido.' });
        start(async () => {
          const r = await send('PUT', `/v1/organizations/${orgId}/members`, { email: email.trim(), role });
          if (!r.ok) {
            setMsg({ ok: false, text: r.status === 404 ? 'No hay ninguna cuenta de VENTI con ese email. Pedile que se registre primero.' : r.message });
            return;
          }
          setMsg({ ok: true, text: `${email.trim()} ya forma parte del equipo.` });
          setEmail('');
          router.refresh();
        });
      }}
      className="space-y-4"
    >
      <div className="grid gap-3 sm:grid-cols-[1fr_220px_auto]">
        <input className="field" type="email" aria-label="Email" placeholder="email@ejemplo.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        <select className="field" aria-label="Rol" value={role} onChange={(e) => setRole(e.target.value as OrgRole)}>
          {roles.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
        <button type="submit" disabled={pending} className="btn btn-ink">
          {pending ? 'Sumando…' : 'Sumar'}
        </button>
      </div>
      <p className="text-sm text-muted">{roles.find((r) => r.value === role)?.body}</p>
      {msg ? (
        <p role={msg.ok ? 'status' : 'alert'} className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}>
          {msg.text}
        </p>
      ) : null}
    </form>
  );
}
