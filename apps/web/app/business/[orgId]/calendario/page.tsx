import type { Metadata } from 'next';
import Link from 'next/link';
import { Card } from '@/components/business/dashboard-parts';
import { MonthCalendar, currentMonthKey, localDay, monthTitle } from '@/components/business/month-calendar';
import { StatusBadge } from '@/components/business/ui';
import { ErrorState } from '@/components/states';
import { getOverview } from '@/lib/api';
import { dateParts } from '@/lib/format';

export const metadata: Metadata = { title: 'Calendario' };

export default async function CalendarPage({ params, searchParams }: { params: Promise<{ orgId: string }>; searchParams: Promise<{ mes?: string; dia?: string }> }) {
  const { orgId } = await params;
  const { mes, dia } = await searchParams;
  const r = await getOverview(orgId);
  if (!r.ok) return <ErrorState message={r.error?.message ?? 'El servicio no respondió.'} />;
  const monthKey = /^\d{4}-\d{2}$/.test(mes ?? '') ? mes! : currentMonthKey();
  const day = /^\d{4}-\d{2}-\d{2}$/.test(dia ?? '') && dia!.startsWith(monthKey) ? dia! : null;

  const events = r.data.events.filter((e) => e.status !== 'cancelled');
  const eventDays = new Map<string, number>();
  for (const e of events) eventDays.set(localDay(e.startsAt), (eventDays.get(localDay(e.startsAt)) ?? 0) + 1);
  const inMonth = events
    .filter((e) => localDay(e.startsAt).startsWith(monthKey) && (!day || localDay(e.startsAt) === day))
    .sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt));
  const href = (k: string) => `/business/${orgId}/calendario?mes=${k}`;

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="font-display text-3xl font-extrabold tracking-[-0.03em]">Calendario</h1>
      <p className="mt-1 text-sm text-muted">Tus fechas del mes. Tocá un día marcado para ver sólo esos eventos.</p>

      <div className="mt-6 grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
        <Card>
          <MonthCalendar monthKey={monthKey} eventDays={eventDays} selectedDay={day} monthHref={href} dayHref={(d) => `${href(monthKey)}&dia=${d}`} />
        </Card>
        <Card
          title={day ? dateParts(`${day}T15:00:00Z`).long : monthTitle(monthKey)}
          action={
            day ? (
              <Link href={href(monthKey)} scroll={false} className="text-sm font-semibold underline">
                Ver todo el mes
              </Link>
            ) : null
          }
        >
          {inMonth.length === 0 ? (
            <p className="text-sm text-muted">No hay eventos {day ? 'ese día' : 'este mes'}.</p>
          ) : (
            <ul className="divide-y divide-line">
              {inMonth.map((e) => {
                const d = dateParts(e.startsAt);
                return (
                  <li key={e.id}>
                    <Link href={`/business/${orgId}/eventos/${e.id}`} className="flex items-center gap-4 py-3 hover:bg-ink/[0.02]">
                      <span className="grid size-12 shrink-0 place-content-center rounded-[12px] bg-ink text-center leading-none text-paper">
                        <span className="font-display text-lg font-extrabold">{Number(d.day)}</span>
                        <span className="text-[0.6rem] font-semibold capitalize">{d.weekdayShort}</span>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{e.title}</span>
                        <span className="block truncate text-sm text-muted">
                          {d.time} h{e.venueName ? ` · ${e.venueName}, ${e.city}` : ' · Sin lugar asignado'}
                        </span>
                      </span>
                      <StatusBadge status={e.status} />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
