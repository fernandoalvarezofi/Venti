import Link from 'next/link';
import { PanelIcon } from './panel-icons';

const TZ = 'America/Argentina/Buenos_Aires';
const WEEK = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'];

/** "2026-11" del día de hoy en Argentina. */
export function currentMonthKey(now = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: TZ }).slice(0, 7);
}
/** Fecha "YYYY-MM-DD" de un instante, en hora de Argentina. */
export function localDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ });
}
export function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
export function monthTitle(key: string): string {
  const [y, m] = key.split('-').map(Number) as [number, number];
  const s = new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 15)));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Mes con los días que tienen eventos marcados. Navegación con enlaces reales (?mes=YYYY-MM),
 * así funciona sin JavaScript. `hrefFor` arma el destino de cada mes y de cada día.
 */
export function MonthCalendar({
  monthKey,
  eventDays,
  monthHref,
  dayHref,
  selectedDay,
  compact = false,
}: {
  monthKey: string;
  eventDays: Map<string, number>;
  monthHref: (key: string) => string;
  dayHref?: (day: string) => string;
  selectedDay?: string | null;
  compact?: boolean;
}) {
  const [y, m] = monthKey.split('-').map(Number) as [number, number];
  const first = new Date(Date.UTC(y, m - 1, 1));
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7; // lunes primero
  const today = new Date().toLocaleDateString('en-CA', { timeZone: TZ });
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => `${monthKey}-${String(i + 1).padStart(2, '0')}`)];
  while (cells.length % 7) cells.push(null);

  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="font-semibold">{monthTitle(monthKey)}</p>
        <div className="flex gap-1">
          <Link href={monthHref(shiftMonth(monthKey, -1))} scroll={false} className="grid size-8 place-items-center rounded-full text-ink-soft shadow-[inset_0_0_0_1px_var(--color-line-strong)] hover:bg-ink/5" aria-label="Mes anterior">
            <PanelIcon name="chevronLeft" className="size-4" />
          </Link>
          <Link href={monthHref(shiftMonth(monthKey, 1))} scroll={false} className="grid size-8 place-items-center rounded-full text-ink-soft shadow-[inset_0_0_0_1px_var(--color-line-strong)] hover:bg-ink/5" aria-label="Mes siguiente">
            <PanelIcon name="chevronRight" className="size-4" />
          </Link>
        </div>
      </div>
      <table className="mt-3 w-full table-fixed text-center text-sm">
        <thead>
          <tr className="text-xs text-muted">
            {WEEK.map((d) => (
              <th key={d} scope="col" className="pb-2 font-medium">
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: cells.length / 7 }, (_, row) => (
            <tr key={row}>
              {cells.slice(row * 7, row * 7 + 7).map((day, i) => {
                if (!day) return <td key={i} />;
                const n = eventDays.get(day) ?? 0;
                const isToday = day === today;
                const isSel = day === selectedDay;
                const label = `${Number(day.slice(8))}${n ? `, ${n} ${n === 1 ? 'evento' : 'eventos'}` : ''}`;
                const inner = (
                  <span
                    className={`relative mx-auto grid ${compact ? 'size-8' : 'size-9'} place-items-center rounded-full tabular-nums ${
                      isSel ? 'bg-ink text-paper' : isToday ? 'bg-accent text-white' : n ? 'font-semibold text-ink' : 'text-ink-soft'
                    }`}
                  >
                    {Number(day.slice(8))}
                    {n && !isSel && !isToday ? <span className="absolute bottom-1 left-1/2 size-1 -translate-x-1/2 rounded-full bg-accent" aria-hidden /> : null}
                  </span>
                );
                return (
                  <td key={i} className="py-0.5">
                    {dayHref && n ? (
                      <Link href={dayHref(day)} scroll={false} aria-label={label} className="block rounded-full hover:bg-ink/5">
                        {inner}
                      </Link>
                    ) : (
                      <span aria-label={label}>{inner}</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
