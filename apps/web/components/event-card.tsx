import Link from 'next/link';
import { categoryLabel, dateParts, formatMoney, posterColors } from '@/lib/format';
import type { PublicEvent } from '@/lib/types';

/** Afiche tipográfico: reemplaza la foto mientras el evento no tenga una propia. */
export function EventPoster({ event, size = 'md' }: { event: PublicEvent; size?: 'md' | 'lg' }) {
  const d = dateParts(event.startsAt);
  const c = posterColors(event.id);
  if (event.coverImageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={event.coverImageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
    );
  }
  return (
    <div className="relative flex h-full w-full flex-col justify-between overflow-hidden p-5" style={{ background: c.bg, color: c.fg }} aria-hidden>
      <div className="flex items-start justify-between text-[0.7rem] font-semibold uppercase tracking-[0.16em] opacity-80">
        <span>{categoryLabel(event.category)}</span>
        <span>{d.weekdayShort}</span>
      </div>
      <div className="leading-[0.82]">
        <span className={`block font-display font-extrabold tracking-[-0.06em] ${size === 'lg' ? 'text-[clamp(6rem,18vw,11rem)]' : 'text-[5.5rem]'}`}>{d.day}</span>
        <span className={`block font-display font-bold tracking-[-0.03em] ${size === 'lg' ? 'text-5xl' : 'text-3xl'}`}>{d.month}</span>
      </div>
      <span className="pointer-events-none absolute -bottom-6 -right-3 font-display text-[7rem] font-extrabold leading-none tracking-[-0.06em] opacity-[0.07]">
        {event.title.slice(0, 2).toUpperCase()}
      </span>
    </div>
  );
}

export function EventCard({ event }: { event: PublicEvent }) {
  const d = dateParts(event.startsAt);
  return (
    <Link
      href={`/eventos/${event.id}`}
      className="group block rounded-[var(--radius-ticket)] focus-visible:outline-offset-4"
      aria-label={`${event.title}, ${d.long} ${d.time} h${event.venue ? `, ${event.venue.name}` : ''}`}
    >
      <article className="rounded-[var(--radius-ticket)] bg-surface transition-transform duration-300 ease-[var(--ease-out-quint)] group-hover:-translate-y-1">
        <div className="aspect-[4/3.4] overflow-hidden rounded-t-[var(--radius-ticket)]">
          <EventPoster event={event} />
        </div>
        <div className="cut -mt-[11px]" aria-hidden><span className="opacity-0" /></div>
        <div className="space-y-1.5 px-5 pb-5 pt-1">
          <h3 className="line-clamp-2 text-[1.2rem] font-bold leading-tight">{event.title}</h3>
          <p className="text-sm text-muted">
            {d.weekday} {d.time} h{event.venue ? ` · ${event.venue.name}, ${event.venue.city}` : ''}
          </p>
          <p className="pt-1 text-sm">
            {event.fromPriceCents != null ? (
              <>
                <span className="text-muted">Desde </span>
                <span className="font-semibold tabular-nums">{formatMoney(event.fromPriceCents)}</span>
              </>
            ) : (
              <span className="text-muted">Precio a confirmar</span>
            )}
          </p>
        </div>
      </article>
    </Link>
  );
}
