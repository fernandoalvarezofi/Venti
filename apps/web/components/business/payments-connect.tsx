'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/** Botones de la sección Cobros: conectar (lleva a Mercado Pago) y desconectar. */
export function PaymentsConnect({ orgId, connected, canManage }: { orgId: string; connected: boolean; canManage: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function connect() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/v1/organizations/${orgId}/payments/mercadopago/connect`, { method: 'POST' }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as { authorizeUrl?: string; error?: { message?: string } } | null;
    if (!res?.ok || !body?.authorizeUrl) {
      setBusy(false);
      setError(body?.error?.message ?? 'No pudimos iniciar la conexión. Intentá de nuevo.');
      return;
    }
    window.location.assign(body.authorizeUrl);
  }

  async function disconnect() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/v1/organizations/${orgId}/payments/mercadopago`, { method: 'DELETE' }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return setError('No pudimos desconectar la cuenta. Intentá de nuevo.');
    setConfirming(false);
    router.refresh();
  }

  if (!canManage) return <p className="text-sm text-muted">Sólo el dueño, la administración o finanzas pueden conectar o cambiar la cuenta de cobro.</p>;

  return (
    <div>
      {error ? (
        <p role="alert" className="mb-3 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
      {!connected ? (
        <button type="button" onClick={connect} disabled={busy} className="inline-flex h-12 items-center gap-3 rounded-xl bg-[#009ee3] px-5 font-semibold text-white transition-colors hover:bg-[#0089c7] disabled:opacity-60">
          <span className="grid size-7 place-items-center rounded-md bg-white text-[0.65rem] font-extrabold text-[#009ee3]" aria-hidden>
            MP
          </span>
          {busy ? 'Abriendo Mercado Pago…' : 'Conectar Mercado Pago'}
        </button>
      ) : confirming ? (
        <div className="rounded-xl bg-danger/5 p-4 shadow-[inset_0_0_0_1px_rgb(180_35_24/0.25)]">
          <p className="font-semibold text-danger">¿Desconectar la cuenta?</p>
          <p className="mt-1 text-sm text-muted">Mientras no conectes otra, tus eventos no van a poder cobrar online. Las entradas ya vendidas siguen válidas.</p>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => setConfirming(false)} className="btn btn-ghost h-10 text-sm">
              Cancelar
            </button>
            <button type="button" onClick={disconnect} disabled={busy} className="btn h-10 bg-danger text-sm text-white">
              {busy ? 'Desconectando…' : 'Sí, desconectar'}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={connect} disabled={busy} className="btn btn-ghost h-10 text-sm">
            Conectar otra cuenta
          </button>
          <button type="button" onClick={() => setConfirming(true)} className="btn btn-ghost h-10 text-sm text-danger">
            Desconectar
          </button>
        </div>
      )}
    </div>
  );
}
