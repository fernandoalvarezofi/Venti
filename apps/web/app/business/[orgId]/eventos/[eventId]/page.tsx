import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AddTicketTypeForm, CourtesyForm, EditEventForm, EventActions, TicketTypeCard } from '@/components/business/event-manage';
import { ContentEditor, MediaEditor } from '@/components/business/content-editor';
import { StaffManager } from '@/components/business/staff-manager';
import { EntryProgress, EventTabs, EVENT_TABS, MoneyBreakdown, Readiness, TypeBreakdown, type EventTab } from '@/components/business/insights';
import { SalesChart } from '@/components/business/sales-chart';
import { PageTitle, Panel, StatCard, StatusBadge } from '@/components/business/ui';
import { ErrorState } from '@/components/states';
import { getAttendees, getEventStats, getMembers, getOrgEvent, getStaffShifts } from '@/lib/api';
import { dateParts, formatMoney } from '@/lib/format';

export const metadata: Metadata = { title: 'Evento' };

const TICKET_STATUS: Record<string, string> = {
  valid: 'Vigente',
  locked: 'En reventa',
  used: 'Ingresó',
  void: 'Transferida',
  cancelled: 'Cancelada',
  refunded: 'Devuelta',
};

export default async function ManageEventPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string; eventId: string }>;
  searchParams: Promise<{ q?: string; aviso?: string; pagina?: string; tab?: string }>;
}) {
  const { orgId, eventId } = await params;
  const { q, aviso, pagina, tab: tabRaw } = await searchParams;
  const tab: EventTab = EVENT_TABS.some((t) => t.id === tabRaw) ? (tabRaw as EventTab) : 'resumen';
  if (!/^[0-9a-f-]{36}$/.test(eventId)) notFound();
  const page = Math.max(0, Number(pagina) || 0);
  const [ev, stats, attendees, shifts, members] = await Promise.all([
    getOrgEvent(orgId, eventId),
    getEventStats(orgId, eventId),
    getAttendees(orgId, eventId, { q, offset: page * 50 }),
    getStaffShifts(orgId, eventId),
    getMembers(orgId),
  ]);
  if (!ev.ok) {
    if (ev.status === 404) notFound();
    return <ErrorState message={ev.error?.message ?? 'El servicio no respondió.'} />;
  }
  const e = ev.data;
  const d = dateParts(e.startsAt);
  const s = stats.ok ? stats.data : null;

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <Link href={`/business/${orgId}`} className="text-sm font-medium text-muted hover:text-ink">
          ← Resumen
        </Link>
        <div className="mt-3">
          <PageTitle eyebrow={`${d.long} · ${d.time} h${e.venue ? ` · ${e.venue.name}, ${e.venue.city}` : ''}`} title={e.title} actions={<StatusBadge status={e.status} />} />
        </div>
        {aviso ? (
          <p role="alert" className="mt-4 rounded-lg bg-warn/10 px-4 py-3 text-sm text-warn">
            {aviso}
          </p>
        ) : null}
        <div className="mt-5">
          <EventActions orgId={orgId} event={e} />
        </div>
      </div>

      <EventTabs base={`/business/${orgId}/eventos/${e.id}`} active={tab} counts={{ entradas: e.ticketTypes.length, asistentes: attendees.ok ? attendees.data.total : undefined, equipo: shifts.ok ? shifts.data.items.length : undefined }} />

      {tab === 'resumen' ? (
        s ? (
          <div className="space-y-8">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard label="Emitidas" value={s.sold.toLocaleString('es-AR')} hint={`de ${s.capacity.toLocaleString('es-AR')} · ${s.courtesies} cortesías`} />
              <StatCard label="Disponibles" value={s.available.toLocaleString('es-AR')} hint={s.held > 0 ? `${s.held} en reserva ahora` : undefined} />
              <StatCard label="Ingresaron" value={s.checkedIn.toLocaleString('es-AR')} hint={s.sold > 0 ? `${Math.round((s.checkedIn / s.sold) * 100)}% de las emitidas` : undefined} />
              <StatCard label="Neto a cobrar" value={formatMoney(s.netCents)} hint={`Bruto ${formatMoney(s.grossCents)}`} />
            </div>
            <div className="grid gap-8 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
              <Panel title="Ventas" description="Entradas emitidas por día, últimos 30 días.">
                <SalesChart days={s.daily} />
              </Panel>
              <Panel title="Ingreso en la puerta">
                <EntryProgress s={s} orgId={orgId} eventId={e.id} published={e.status === 'published'} />
              </Panel>
            </div>
            <div className="grid gap-8 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
              <Panel title="Por tipo de entrada">
                <TypeBreakdown s={s} />
              </Panel>
              <Panel title="Plata">
                <MoneyBreakdown s={s} />
              </Panel>
            </div>
            {e.status !== 'cancelled' && e.status !== 'finished' ? (
              <Panel title="Para vender más" description="Lo que falta para que el evento esté completo.">
                <Readiness e={e} orgId={orgId} staffCount={shifts.ok ? shifts.data.items.length : 0} />
              </Panel>
            ) : null}
          </div>
        ) : (
          <ErrorState message={stats.ok ? '' : stats.error?.message ?? 'No pudimos cargar las estadísticas.'} />
        )
      ) : null}
      {tab === 'entradas' ? (
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Panel title="Entradas y precios" description="Stock en tiempo real. Las etapas se venden en orden.">
          <div className="space-y-4">
            {e.ticketTypes.length === 0 ? <p className="text-sm text-muted">Todavía no hay tipos de entrada. Agregá al menos uno para publicar.</p> : null}
            {e.ticketTypes.map((t) => (
              <TicketTypeCard key={t.id} orgId={orgId} event={e} type={t} />
            ))}
            {e.status !== 'cancelled' && e.status !== 'finished' ? <AddTicketTypeForm orgId={orgId} eventId={e.id} /> : null}
          </div>
        </Panel>

        <div className="space-y-8">
          <Panel title="Cortesías" description="Entradas sin cargo que descuentan stock real.">
            <CourtesyForm orgId={orgId} event={e} />
          </Panel>
        </div>
      </div>

      ) : null}
      {tab === 'contenido' ? (
        <div className="space-y-8">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <Panel title="Imágenes" description="La portada aparece de fondo en la tarjeta del evento.">
            <MediaEditor orgId={orgId} event={e} />
          </Panel>
          <Panel title="Contenido" description="Line-up, qué hay en el evento, datos útiles y enlaces.">
            <ContentEditor orgId={orgId} event={e} />
          </Panel>
        </div>
        {e.status !== 'cancelled' && e.status !== 'finished' ? (
          <Panel title="Datos del evento" description="Título, categoría, fechas y lugar.">
            <EditEventForm orgId={orgId} event={e} />
          </Panel>
        ) : null}
        </div>
      ) : null}
      {tab === 'asistentes' ? (
      <Panel title="Asistentes" description={attendees.ok ? `${attendees.data.total.toLocaleString('es-AR')} entradas emitidas` : undefined}>
        <form method="get" className="mb-4 flex flex-wrap gap-2" role="search">
          <input type="hidden" name="tab" value="asistentes" />
          <label htmlFor="q" className="sr-only">
            Buscar por nombre, email o DNI
          </label>
          <input id="q" name="q" defaultValue={q ?? ''} className="field h-10 max-w-sm" placeholder="Nombre, email o DNI completo" minLength={2} />
          <button type="submit" className="btn btn-ghost h-10 text-sm">
            Buscar
          </button>
          {q ? (
            <Link href={`/business/${orgId}/eventos/${eventId}?tab=asistentes`} className="btn btn-ghost h-10 text-sm">
              Limpiar
            </Link>
          ) : null}
          {attendees.ok && attendees.data.total > 0 ? (
            <a href={`/business/${orgId}/eventos/${eventId}/asistentes.csv`} className="btn btn-ink ml-auto h-10 text-sm" download>
              Descargar planilla (CSV)
            </a>
          ) : null}
        </form>
        {!attendees.ok ? (
          <p className="text-sm text-muted">No tenés permiso para ver los datos de los asistentes.</p>
        ) : attendees.data.items.length === 0 ? (
          <p className="text-sm text-muted">{q ? 'Nadie coincide con esa búsqueda.' : 'Todavía no hay entradas emitidas.'}</p>
        ) : (
          <>
            <div className="-mx-5 overflow-x-auto sm:mx-0">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="text-xs uppercase tracking-[0.08em] text-muted">
                  <tr className="border-b border-line">
                    <th scope="col" className="px-5 py-2.5 font-semibold sm:px-0">Titular</th>
                    <th scope="col" className="py-2.5 font-semibold">Entrada</th>
                    <th scope="col" className="py-2.5 font-semibold">Estado</th>
                    <th scope="col" className="py-2.5 text-right font-semibold">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {attendees.data.items.map((a) => (
                    <tr key={a.id}>
                      <td className="px-5 py-3 sm:px-0">
                        <p className="font-medium">
                          {a.holderName}
                          {a.holderDocLast3 ? <span className="ml-2 font-mono text-xs text-muted">DNI •••{a.holderDocLast3}</span> : null}
                        </p>
                        <p className="text-xs text-muted">{a.holderEmail}</p>
                        {a.pendingClaim ? <p className="mt-0.5 text-xs font-semibold text-warn">Pendiente: todavía no confirmó su email</p> : null}
                      </td>
                      <td className="py-3">{a.ticketTypeName}</td>
                      <td className="py-3">
                        {TICKET_STATUS[a.status] ?? a.status}
                        {a.usedAt ? <span className="block text-xs text-muted">{new Date(a.usedAt).toLocaleTimeString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', minute: '2-digit' })} h</span> : null}
                      </td>
                      <td className="py-3 text-right tabular-nums">{a.courtesy ? 'Cortesía' : formatMoney(a.priceCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {attendees.data.total > 50 ? (
              <div className="mt-4 flex items-center justify-between text-sm">
                <span className="text-muted">
                  {page * 50 + 1}–{Math.min((page + 1) * 50, attendees.data.total)} de {attendees.data.total}
                </span>
                <span className="flex gap-2">
                  {page > 0 ? (
                    <Link className="btn btn-ghost h-9 text-xs" href={`?${new URLSearchParams({ tab: 'asistentes', ...(q ? { q } : {}), pagina: String(page - 1) })}`}>
                      Anterior
                    </Link>
                  ) : null}
                  {(page + 1) * 50 < attendees.data.total ? (
                    <Link className="btn btn-ghost h-9 text-xs" href={`?${new URLSearchParams({ tab: 'asistentes', ...(q ? { q } : {}), pagina: String(page + 1) })}`}>
                      Siguiente
                    </Link>
                  ) : null}
                </span>
              </div>
            ) : null}
          </>
        )}
      </Panel>
      ) : null}
      {tab === 'equipo' ? (
        <div className="space-y-8">
        {shifts.ok && e.status !== 'cancelled' && e.status !== 'finished' ? (
          <Panel title="Personal de acceso" description="Sólo escanean dentro de su turno y en este evento.">
            <StaffManager
              orgId={orgId}
              eventId={e.id}
              startsAt={e.startsAt}
              endsAt={e.endsAt}
              shifts={shifts.data.items}
              accessMembers={members.ok ? members.data.items.filter((m) => m.role === 'access_staff') : []}
            />
          </Panel>
        ) : null}
          {!shifts.ok || e.status === 'cancelled' || e.status === 'finished' ? <p className="text-sm text-muted">El evento está cerrado o no tenés permiso para gestionar turnos.</p> : null}
          <p className="text-sm text-muted">
            Para sumar personas a tu productora (y darles el rol de acceso), andá a{' '}
            <Link href={`/business/${orgId}/equipo`} className="font-semibold text-ink underline">
              Equipo
            </Link>
            .
          </p>
        </div>
      ) : null}
    </div>
  );
}
