import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import QRCode from 'qrcode';
import { TicketPass } from '@/components/ticket-pass';
import { EmptyState, ErrorState } from '@/components/states';
import { getMyTickets } from '@/lib/api';

export const metadata: Metadata = { title: 'Mis entradas' };

export default async function MyTicketsPage() {
  const r = await getMyTickets();
  if (!r.ok && r.status === 401) redirect('/ingresar?next=/mis-entradas');

  const now = Date.now();
  const tickets = r.ok ? r.data.items : [];
  const upcoming = tickets.filter((t) => new Date(t.event.endsAt).getTime() > now);
  const past = tickets.filter((t) => new Date(t.event.endsAt).getTime() <= now);

  // El QR se dibuja en el servidor como SVG: nítido en cualquier pantalla y sin depender de JavaScript.
  const qrSvgs = Object.fromEntries(
    await Promise.all(
      upcoming
        .filter((t) => t.qr)
        .map(async (t) => [t.id, await QRCode.toString(t.qr!, { type: 'svg', errorCorrectionLevel: 'M', margin: 0, color: { dark: '#171411', light: '#00000000' } })] as const),
    ),
  );

  return (
    <div className="mx-auto max-w-3xl px-4 pt-10 sm:px-6">
      <h1 className="text-[clamp(2.2rem,5vw,3.4rem)] font-extrabold leading-none">Mis entradas</h1>
      <p className="mt-2 text-muted">Mostrá el QR en la puerta. Funciona con el brillo de la pantalla al máximo.</p>
      <div className="mt-10">
        {!r.ok ? (
          <ErrorState message={r.error?.message ?? 'El servicio no respondió.'} />
        ) : tickets.length === 0 ? (
          <EmptyState title="Todavía no tenés entradas" body="Cuando compres o te envíen una cortesía a tu email, la vas a ver acá con su QR." action={{ href: '/eventos', label: 'Explorar eventos' }} />
        ) : (
          <>
            {upcoming.length > 0 ? (
              <ul className="space-y-6">
                {upcoming.map((t) => (
                  <li key={t.id}>
                    <TicketPass ticket={t} qrSvg={qrSvgs[t.id] ?? null} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted">No tenés entradas para eventos próximos.</p>
            )}
            {past.length > 0 ? (
              <section className="mt-14" aria-labelledby="pasadas">
                <h2 id="pasadas" className="text-xl font-bold">
                  Eventos pasados
                </h2>
                <ul className="mt-4 divide-y divide-line">
                  {past.map((t) => (
                    <li key={t.id} className="flex justify-between gap-4 py-3 text-sm">
                      <span className="font-medium">{t.event.title}</span>
                      <span className="text-muted">{t.ticketType.name}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
