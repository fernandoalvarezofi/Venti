import type { Metadata } from 'next';
import Link from 'next/link';
import { Card, EventCover, EventMeta, Kpi, MonthlyBars, SeeAll, TicketsDonut } from '@/components/business/dashboard-parts';
import { MonthCalendar, currentMonthKey, localDay } from '@/components/business/month-calendar';
import { PanelIcon } from '@/components/business/panel-icons';
import { StatusBadge } from '@/components/business/ui';
import { ErrorState } from '@/components/states';
import { getCurrentUser, getMyOrgs, getOverview, getPaymentAccount } from '@/lib/api';
import { dateParts, formatMoney } from '@/lib/format';

export const metadata: Metadata = { title: 'Inicio' };

const timeAgo = (iso: string) => {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return 'recién';
  if (mins < 60) return `hace ${mins} min`;
  const h = Math.round(mins / 60);
  if (h < 24) return `hace ${h} h`;
  return dateParts(iso).long;
};

export default async function OrgHome({ params, searchParams }: { params: Promise<{ orgId: string }>; searchParams: Promise<{ mes?: string }> }) {
  const { orgId } = await params;
  const { mes } = await searchParams;
  const [r, user, orgs] = await Promise.all([getOverview(orgId), getCurrentUser(), getMyOrgs()]);
  if (!r.ok) return <ErrorState message={r.error?.message ?? 'El servicio no respondió.'} />;
  const org = orgs.ok ? orgs.data.items.find((o) => o.id === orgId) : undefined;
  const canFinance = org?.permissions?.includes('finance.read') ?? false;
  const canWrite = org?.permissions?.includes('events.write') ?? false;
  const pay = canFinance ? await getPaymentAccount(orgId) : null;

  const { totals, events, monthly, recent } = r.data;
  const now = Date.now();
  const upcoming = events
    .filter((e) => new Date(e.endsAt).getTime() > now && e.status !== 'cancelled')
    .sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt));
  const next = upcoming.find((e) => e.status === 'published') ?? upcoming[0];
  const held = events.reduce((a, e) => a + e.held, 0);
  const occupancy = totals.capacity ? Math.round((totals.ticketsSold / totals.capacity) * 100) : 0;
  const top = [...events].filter((e) => e.capacity > 0).sort((a, b) => b.grossCents - a.grossCents || b.sold - a.sold).slice(0, 4);
  const monthKey = /^\d{4}-\d{2}$/.test(mes ?? '') ? mes! : currentMonthKey();
  const eventDays = new Map<string, number>();
  for (const e of events) if (e.status !== 'cancelled') eventDays.set(localDay(e.startsAt), (eventDays.get(localDay(e.startsAt)) ?? 0) + 1);

  // Tareas: sólo cosas reales y accionables.
  const tasks: { text: string; href: string }[] = [];
  if (pay?.ok && pay.data.available && !pay.data.connected) tasks.push({ text: 'Conectá Mercado Pago para cobrar tus ventas', href: `/business/${orgId}/cobros` });
  if (totals.drafts > 0) tasks.push({ text: `${totals.drafts === 1 ? 'Tenés 1 evento en borrador' : `Tenés ${totals.drafts} eventos en borrador`}: revisalo y publicalo`, href: `/business/${orgId}/eventos` });
  for (const e of upcoming.filter((e) => !e.venueName).slice(0, 2)) tasks.push({ text: `"${e.title}" no tiene lugar asignado`, href: `/business/${orgId}/eventos/${e.id}` });
  for (const e of upcoming.filter((e) => e.status === 'published' && e.capacity === 0).slice(0, 2)) tasks.push({ text: `"${e.title}" no tiene entradas cargadas`, href: `/business/${orgId}/eventos/${e.id}?tab=entradas` });

  const firstName = user?.fullName.split(' ')[0] ?? '';

  return (
    <div className="mx-auto max-w-[1280px]">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-[-0.03em]">Inicio</h1>
          <p className="mt-1 text-sm text-muted">Hola{firstName ? `, ${firstName}` : ''}. Así viene {org?.name ?? 'tu productora'}.</p>
        </div>
        {canWrite ? (
          <Link href={`/business/${orgId}/eventos/nuevo`} className="inline-flex h-10 items-center gap-2 rounded-full bg-ink px-4 text-sm font-semibold text-paper hover:bg-ink/85 lg:hidden">
            <PanelIcon name="plus" className="size-4" /> Crear evento
          </Link>
        ) : null}
      </header>

      <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        {/* Columna principal */}
        <div className="min-w-0 space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
            <Kpi icon="money" label="Recaudación" value={formatMoney(totals.grossCents)} hint="Precio completo de lo vendido" />
            <Kpi icon="ticket" label="Entradas vendidas" value={totals.ticketsSold.toLocaleString('es-AR')} hint={`${occupancy}% de ocupación`} />
            <Kpi icon="users" label="Compradores" value={totals.buyers.toLocaleString('es-AR')} hint="Personas que compraron" />
            <Kpi icon="scan" label="Ingresaron" value={totals.checkedIn.toLocaleString('es-AR')} hint={totals.ticketsSold ? `${Math.round((totals.checkedIn / totals.ticketsSold) * 100)}% de las vendidas` : 'Todavía nadie'} />
          </div>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
            <Card title="Entradas">
              <TicketsDonut sold={totals.ticketsSold} held={held} capacity={totals.capacity} />
            </Card>
            <div className="min-w-0 space-y-5">
              <Card title="Recaudación por mes">
                <p className="-mt-2 mb-4 text-sm text-muted">
                  Últimos 6 meses · <span className="font-semibold text-ink">{formatMoney(monthly.reduce((a, m) => a + m.grossCents, 0))}</span>
                </p>
                <MonthlyBars data={monthly} />
              </Card>
              <Card title="Rendimiento por evento" action={<SeeAll href={`/business/${orgId}/eventos`}>Ver todos</SeeAll>}>
                {top.length === 0 ? (
                  <p className="text-sm text-muted">Cuando cargues entradas en tus eventos, vas a ver acá cómo se venden.</p>
                ) : (
                  <ul className="space-y-3">
                    {top.map((e) => {
                      const pct = e.capacity ? Math.round((e.sold / e.capacity) * 100) : 0;
                      return (
                        <li key={e.id}>
                          <Link href={`/business/${orgId}/eventos/${e.id}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 rounded-lg hover:bg-ink/[0.03] sm:grid-cols-[minmax(0,180px)_minmax(0,1fr)_auto]">
                            <span className="truncate text-sm font-medium">{e.title}</span>
                            <span className="order-3 col-span-2 h-6 overflow-hidden rounded-md bg-ink/[0.05] sm:order-none sm:col-span-1">
                              <span className="flex h-full items-center rounded-md bg-ink px-2 text-xs font-semibold text-paper" style={{ width: `${Math.max(pct, 9)}%` }}>
                                {pct}%
                              </span>
                            </span>
                            <span className="text-right text-xs tabular-nums text-muted">
                              {e.sold.toLocaleString('es-AR')} de {e.capacity.toLocaleString('es-AR')}
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card title="Actividad reciente">
              {recent.length === 0 ? (
                <p className="text-sm text-muted">Acá vas a ver cada compra apenas se acredite.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {recent.map((o) => (
                    <li key={o.orderId} className="flex items-center gap-3 py-2.5 text-sm">
                      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-ink/[0.06] text-xs font-bold">{o.buyerFirstName.charAt(0).toUpperCase() || '·'}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">
                          <span className="font-semibold">{o.buyerFirstName || 'Alguien'}</span> compró {o.tickets === 1 ? '1 entrada' : `${o.tickets} entradas`}
                        </span>
                        <span className="block truncate text-xs text-muted">
                          {o.eventTitle} · {timeAgo(o.paidAt)}
                        </span>
                      </span>
                      <span className="font-semibold tabular-nums">{formatMoney(o.subtotalCents)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card title="Pendientes">
              {tasks.length === 0 ? (
                <p className="flex items-center gap-2 text-sm text-muted">
                  <PanelIcon name="check" className="size-4 text-success" /> Todo en orden. No hay nada pendiente.
                </p>
              ) : (
                <ul className="space-y-2">
                  {tasks.map((t) => (
                    <li key={t.text}>
                      <Link href={t.href} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm shadow-[inset_0_0_0_1px_var(--color-line)] hover:bg-ink/[0.03]">
                        <span className="size-2 shrink-0 rounded-full bg-accent" aria-hidden />
                        <span className="min-w-0 flex-1">{t.text}</span>
                        <PanelIcon name="arrow" className="size-4 shrink-0 text-muted" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          {events.length > 0 ? (
            <Card title="Tus eventos" action={<SeeAll href={`/business/${orgId}/eventos`}>Ver todos</SeeAll>}>
              <ul className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
                {(upcoming.length ? upcoming : events).slice(0, 3).map((e) => (
                  <li key={e.id}>
                    <Link href={`/business/${orgId}/eventos/${e.id}`} className="group block">
                      <EventCover e={e} orgId={orgId} className="aspect-[16/10] rounded-[14px]" />
                      <div className="mt-3 flex items-start justify-between gap-2">
                        <p className="min-w-0 font-semibold leading-snug group-hover:underline">{e.title}</p>
                        <StatusBadge status={e.status} />
                      </div>
                      <p className="mt-0.5 truncate text-sm text-muted">{e.venueName ? `${e.venueName}, ${e.city}` : dateParts(e.startsAt).long}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>

        {/* Columna derecha */}
        <aside className="space-y-5">
          <Card title="Próximo evento">
            {next ? (
              <div className="overflow-hidden rounded-[14px] shadow-[inset_0_0_0_1px_var(--color-line)]">
                <EventCover e={next} orgId={orgId} className="aspect-[16/10]" />
                <div className="p-4">
                  <p className="text-lg font-bold leading-snug">{next.title}</p>
                  <div className="mt-2">
                    <EventMeta e={next} />
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-3">
                    <span className="text-xs tabular-nums text-muted">
                      {next.sold.toLocaleString('es-AR')} de {next.capacity.toLocaleString('es-AR')} vendidas
                    </span>
                    <Link href={`/business/${orgId}/eventos/${next.id}`} className="inline-flex h-9 items-center rounded-full bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-ink">
                      Ver evento
                    </Link>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-sm text-muted">
                <p>No tenés eventos próximos.</p>
                {canWrite ? (
                  <Link href={`/business/${orgId}/eventos/nuevo`} className="mt-3 inline-flex font-semibold text-ink underline">
                    Crear un evento
                  </Link>
                ) : null}
              </div>
            )}
          </Card>

          <Card>
            <MonthCalendar monthKey={monthKey} eventDays={eventDays} compact monthHref={(k) => `/business/${orgId}?mes=${k}`} dayHref={(d) => `/business/${orgId}/calendario?mes=${d.slice(0, 7)}&dia=${d}`} />
            {upcoming.length > 0 ? (
              <ul className="mt-4 space-y-2">
                {upcoming.slice(0, 3).map((e, i) => {
                  const d = dateParts(e.startsAt);
                  return (
                    <li key={e.id}>
                      <Link href={`/business/${orgId}/eventos/${e.id}`} className={`flex items-center gap-3 rounded-[12px] p-2.5 ${i === 0 ? 'bg-accent/[0.08]' : 'bg-ink/[0.03]'} hover:bg-ink/[0.06]`}>
                        <span className={`grid size-11 shrink-0 place-content-center rounded-[10px] text-center leading-none ${i === 0 ? 'bg-accent text-white' : 'bg-ink text-paper'}`}>
                          <span className="font-display text-lg font-extrabold">{Number(d.day)}</span>
                          <span className="text-[0.6rem] font-semibold capitalize">{d.weekdayShort}</span>
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold">{e.title}</span>
                          <span className="block truncate text-xs text-muted">
                            {d.time} h{e.venueName ? ` · ${e.venueName}` : ''}
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </Card>
        </aside>
      </div>
    </div>
  );
}
