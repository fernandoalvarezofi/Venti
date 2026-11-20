import type { Metadata } from 'next';
import Link from 'next/link';
import { PageTitle, StatCard, StatusBadge, StockBar } from '@/components/business/ui';
import { EmptyState, ErrorState } from '@/components/states';
import { getOverview } from '@/lib/api';
import { dateParts, formatMoney } from '@/lib/format';
import { AdmitLink } from '@/components/ticket-button';

export const metadata: Metadata = { title: 'Resumen' };

export default async function OrgDashboard({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const r = await getOverview(orgId);
  if (!r.ok) return <ErrorState message={r.error?.message ?? 'El servicio no respondió.'} />;
  const { totals, events } = r.data;
  const now = Date.now();
  const upcoming = events.filter((e) => new Date(e.endsAt).getTime() > now && e.status !== 'cancelled');
  const past = events.filter((e) => !upcoming.includes(e));
  const occupancy = totals.capacity > 0 ? Math.round((totals.ticketsSold / totals.capacity) * 100) : 0;

  return (
    <div className="mx-auto max-w-6xl">
      <PageTitle
        eyebrow="Resumen"
        title="Tus eventos"
        actions={
          <AdmitLink href={`/business/${orgId}/eventos/nuevo`}>Crear evento</AdmitLink>
        }
      />

      <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Neto a cobrar" value={formatMoney(totals.netCents)} hint="Precio completo de las entradas vendidas" />
        <StatCard label="Entradas emitidas" value={totals.ticketsSold.toLocaleString('es-AR')} hint={`${occupancy}% de ${totals.capacity.toLocaleString('es-AR')} lugares`} />
        <StatCard label="Ingresaron" value={totals.checkedIn.toLocaleString('es-AR')} hint={totals.ticketsSold > 0 ? `${Math.round((totals.checkedIn / totals.ticketsSold) * 100)}% de las emitidas` : undefined} />
        <StatCard label="A la venta" value={String(totals.published)} hint={totals.drafts ? `${totals.drafts} en borrador` : 'Sin borradores'} />
      </div>

      <section className="mt-10" aria-labelledby="proximos">
        <h2 id="proximos" className="text-xl font-bold">
          Próximos
        </h2>
        {upcoming.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              title="Todavía no tenés eventos"
              body="Creá el primero: datos, lugar, entradas con sus etapas de precio, y publicalo cuando esté listo."
              action={{ href: `/business/${orgId}/eventos/nuevo`, label: 'Crear evento' }}
            />
          </div>
        ) : (
          <ul className="mt-4 grid gap-3">
            {upcoming.map((e) => {
              const d = dateParts(e.startsAt);
              return (
                <li key={e.id}>
                  <Link href={`/business/${orgId}/eventos/${e.id}`} className="grid items-center gap-4 rounded-[14px] bg-surface p-5 transition-colors hover:bg-ink/[0.03] sm:grid-cols-[72px_1fr_220px]">
                    <div className="hidden text-center leading-none sm:block">
                      <p className="font-display text-3xl font-extrabold tracking-[-0.05em]">{d.day}</p>
                      <p className="text-xs font-bold tracking-[0.12em] text-muted">{d.month}</p>
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={e.status} />
                        <span className="text-xs text-muted sm:hidden">
                          {d.day} {d.month}
                        </span>
                      </div>
                      <p className="mt-1.5 truncate text-lg font-bold">{e.title}</p>
                      <p className="truncate text-sm text-muted">
                        {d.weekday} {d.time} h{e.venueName ? ` · ${e.venueName}, ${e.city}` : ' · Sin lugar asignado'}
                      </p>
                    </div>
                    <div>
                      <StockBar sold={e.sold} held={e.held} capacity={e.capacity} label={e.title} />
                      <p className="mt-1 text-xs tabular-nums text-muted">
                        {formatMoney(e.grossCents)} recaudado{e.checkedIn > 0 ? ` · ${e.checkedIn} ingresaron` : ''}
                      </p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {past.length > 0 ? (
        <section className="mt-10" aria-labelledby="anteriores">
          <h2 id="anteriores" className="text-xl font-bold">
            Anteriores y cancelados
          </h2>
          <ul className="mt-4 divide-y divide-line rounded-[14px] bg-surface">
            {past.map((e) => (
              <li key={e.id}>
                <Link href={`/business/${orgId}/eventos/${e.id}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 hover:bg-ink/[0.03]">
                  <span className="min-w-0 truncate font-medium">{e.title}</span>
                  <span className="flex items-center gap-3 text-sm text-muted">
                    {dateParts(e.startsAt).long}
                    <StatusBadge status={e.status} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
