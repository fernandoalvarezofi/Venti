import Link from 'next/link';
import { InstallApp } from '@/components/app-install';
import { MascotFace } from '@/components/header';
import { getAccessEvents } from '@/lib/api';
import { dateParts } from '@/lib/format';

export const metadata = { title: 'Control de ingreso' };

export default async function AccessHome() {
  const res = await getAccessEvents();
  const items = res.ok ? res.data.items : [];
  return (
    <main className="mx-auto max-w-xl px-4 pb-16 pt-6">
      <header className="flex items-center justify-between">
        <Link href="/" className="logo inline-flex items-center gap-1.5 font-display text-xl font-extrabold tracking-[-0.04em]">
          <MascotFace size={28} />
          Lintick<span className="text-accent">.</span>
          <span className="ml-1 rounded-full bg-paper/10 px-2 py-0.5 text-xs font-semibold tracking-normal">Access</span>
        </Link>
        <Link href="/business" className="text-sm text-paper/60 hover:text-paper">
          Panel
        </Link>
      </header>

      <h1 className="mt-10 text-4xl font-extrabold leading-tight">Control de ingreso</h1>
      <p className="mt-2 text-paper/60">Elegí el evento y escaneá el QR de cada entrada. Cada entrada entra una sola vez.</p>
      <InstallApp className="mt-6 text-ink" />

      {!res.ok ? (
        <p role="alert" className="mt-8 rounded-2xl bg-danger/20 px-4 py-3 text-sm">
          {res.error?.message ?? 'No pudimos cargar tus eventos.'} Probá de nuevo en unos segundos.
        </p>
      ) : items.length === 0 ? (
        <div className="mt-8 rounded-2xl bg-paper/5 px-5 py-8 text-center">
          <p className="text-lg font-bold">No tenés eventos para controlar ahora</p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-paper/60">
            Si sos parte del equipo de acceso, pedile a la productora que te asigne un turno en el evento.
          </p>
        </div>
      ) : (
        <ul className="mt-8 space-y-3">
          {items.map((e) => {
            const d = dateParts(e.startsAt);
            return (
              <li key={e.eventId}>
                <Link
                  href={`/acceso/${e.orgId}/${e.eventId}`}
                  className="flex items-center gap-4 rounded-2xl bg-paper/[0.06] p-4 ring-1 ring-paper/10 transition-colors hover:bg-paper/[0.1]"
                >
                  <div className="w-14 shrink-0 text-center leading-none">
                    <p className="font-display text-3xl font-extrabold">{d.day}</p>
                    <p className="mt-1 text-xs font-bold uppercase text-paper/60">{d.month}</p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">{e.title}</p>
                    <p className="truncate text-sm text-paper/60">
                      {d.time} h{e.venueName ? ` · ${e.venueName}` : ''} · {e.orgName}
                    </p>
                    {e.shift ? (
                      <p className="mt-1 text-xs text-paper/50">
                        Tu turno: {dateParts(e.shift.from).time} a {dateParts(e.shift.until).time} h
                      </p>
                    ) : null}
                  </div>
                  <span className="rounded-full bg-accent px-3 py-1.5 text-sm font-bold">Escanear</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
