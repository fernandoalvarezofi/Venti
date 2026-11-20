import Link from 'next/link';
import { categoryLabel, dateParts, formatMoney, mediaSrc } from '@/lib/format';
import type { OverviewEvent } from '@/lib/types';
import { PanelIcon, type PanelIconName } from './panel-icons';

/** Tarjeta base del tablero: superficie clara, sin sombras pesadas ni bordes de color. */
export function Card({ title, action, children, className = '' }: { title?: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-[18px] bg-surface p-5 ${className}`} aria-label={title}>
      {title ? (
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-semibold">{title}</h2>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Kpi({ icon, label, value, hint }: { icon: PanelIconName; label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-center gap-4 rounded-[18px] bg-surface p-4">
      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-accent text-white">
        <PanelIcon name={icon} className="size-5" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-xs text-muted">{label}</p>
        <p className="font-display text-[1.45rem] font-extrabold leading-tight tracking-[-0.03em] tabular-nums">{value}</p>
        {hint ? <p className="truncate text-xs text-muted">{hint}</p> : null}
      </div>
    </div>
  );
}

/**
 * Anillo de entradas: vendidas / reservadas ahora / disponibles. Tres colores con trabajo distinto
 * (tinta, acento, fondo) y leyenda con número y porcentaje: nunca depende sólo del color.
 */
export function TicketsDonut({ sold, held, capacity }: { sold: number; held: number; capacity: number }) {
  const available = Math.max(0, capacity - sold - held);
  const total = Math.max(1, capacity);
  const r = 52;
  const c = 2 * Math.PI * r;
  const segs = [
    { key: 'Vendidas', value: sold, color: 'var(--color-ink)' },
    { key: 'Reservadas ahora', value: held, color: 'var(--color-accent)' },
    { key: 'Disponibles', value: available, color: 'rgb(23 20 17 / 0.1)' },
  ];
  let offset = 0;
  return (
    <div>
      <div className="relative mx-auto size-44">
        <svg viewBox="0 0 128 128" className="size-full -rotate-90" role="img" aria-label={`${sold} vendidas, ${held} reservadas y ${available} disponibles de ${capacity}`}>
          {segs.map((s) => {
            const len = (s.value / total) * c;
            // 2px de separación entre segmentos para que se lean como partes distintas.
            const el = len > 0 ? <circle key={s.key} cx="64" cy="64" r={r} fill="none" stroke={s.color} strokeWidth="16" strokeDasharray={`${Math.max(0, len - 2)} ${c}`} strokeDashoffset={-offset} /> : null;
            offset += len;
            return el;
          })}
        </svg>
        <div className="absolute inset-0 grid place-content-center text-center">
          <p className="text-xs text-muted">Capacidad</p>
          <p className="font-display text-2xl font-extrabold tabular-nums tracking-[-0.03em]">{capacity.toLocaleString('es-AR')}</p>
        </div>
      </div>
      <ul className="mt-5 space-y-3 text-sm">
        {segs.map((s) => (
          <li key={s.key} className="flex items-center gap-3">
            <span className="h-8 w-1.5 shrink-0 rounded-full" style={{ background: s.color }} aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block text-xs text-muted">{s.key}</span>
              <span className="font-semibold tabular-nums">{s.value.toLocaleString('es-AR')}</span>
            </span>
            <span className="rounded-md bg-ink/[0.05] px-2 py-1 text-xs font-semibold tabular-nums">{Math.round((s.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const MONTH = (key: string) => {
  const [y, m] = key.split('-').map(Number) as [number, number];
  return new Intl.DateTimeFormat('es-AR', { month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 15))).replace('.', '');
};

/** Recaudación por mes: barras finas de un solo color, mes actual destacado, valor visible al pasar el mouse. */
export function MonthlyBars({ data }: { data: { month: string; grossCents: number; tickets: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.grossCents));
  return (
    <div>
      <div className="flex h-44 items-end gap-3 border-b border-line pb-px" role="img" aria-label="Recaudación por mes">
        {data.map((d, i) => {
          const last = i === data.length - 1;
          return (
            <div key={d.month} className="group relative flex h-full flex-1 flex-col justify-end">
              <span className="pointer-events-none absolute -top-1 left-1/2 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md bg-ink px-2 py-1 text-xs font-semibold text-paper opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                {formatMoney(d.grossCents)} · {d.tickets} entradas
              </span>
              <span
                className={`mx-auto w-full max-w-9 rounded-t-[4px] ${last ? 'bg-accent' : 'bg-ink/[0.14] group-hover:bg-ink/25'}`}
                style={{ height: d.grossCents ? `${Math.max(4, (d.grossCents / max) * 100)}%` : '2px' }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex gap-3 text-center text-xs text-muted">
        {data.map((d) => (
          <span key={d.month} className="flex-1 capitalize">
            {MONTH(d.month)}
          </span>
        ))}
      </div>
      <table className="sr-only">
        <caption>Recaudación por mes</caption>
        <tbody>
          {data.map((d) => (
            <tr key={d.month}>
              <th scope="row">{d.month}</th>
              <td>{formatMoney(d.grossCents)}</td>
              <td>{d.tickets} entradas</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Portada del evento o, si no tiene, un bloque con la fecha en el color de la categoría (nunca una imagen rota). */
export function EventCover({ e, orgId, className = '' }: { e: OverviewEvent; orgId: string; className?: string }) {
  const src = e.coverUrl ? (e.coverUrl.startsWith('/v1/') ? mediaSrc(e.coverUrl, orgId) : e.coverUrl) : null;
  const d = dateParts(e.startsAt);
  return (
    <div className={`relative overflow-hidden bg-[#c4553a] text-[#fff7ef] ${className}`}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <span className="absolute bottom-3 left-4 font-display leading-none">
          <span className="block text-4xl font-extrabold tracking-[-0.05em]">{d.day}</span>
          <span className="text-sm font-bold">{d.month}</span>
        </span>
      )}
      <span className="absolute left-3 top-3 rounded-full bg-paper/95 px-2.5 py-1 text-[0.7rem] font-semibold text-ink">{categoryLabel(e.category)}</span>
    </div>
  );
}

export function EventMeta({ e }: { e: OverviewEvent }) {
  const d = dateParts(e.startsAt);
  return (
    <ul className="space-y-1 text-sm text-muted">
      <li className="flex items-center gap-2">
        <PanelIcon name="clock" className="size-4 shrink-0" />
        {d.long} · {d.time} h
      </li>
      <li className="flex items-center gap-2">
        <PanelIcon name="pin" className="size-4 shrink-0" />
        <span className="truncate">{e.venueName ? `${e.venueName}, ${e.city}` : 'Sin lugar asignado'}</span>
      </li>
    </ul>
  );
}

export function SeeAll({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold shadow-[inset_0_0_0_1px_var(--color-line-strong)] hover:bg-ink/5">
      {children}
    </Link>
  );
}
