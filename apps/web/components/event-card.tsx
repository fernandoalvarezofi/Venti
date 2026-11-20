import Link from 'next/link';
import { categoryLabel, dateParts, formatMoney, mediaSrc, posterColors } from '@/lib/format';
import type { PublicEvent } from '@/lib/types';

/**
 * Afiche del evento. Con imagen: la foto de la productora de fondo, con la categoría, el día y la fecha
 * encima sobre un degradado de tinta para que se lean sobre cualquier foto.
 * Sin imagen: afiche tipográfico de color.
 */
export function EventPoster({ event, size = 'md', orgId, priority = false }: { event: PublicEvent; size?: 'md' | 'lg'; orgId?: string; priority?: boolean }) {
  const d = dateParts(event.startsAt);
  const c = posterColors(event.id);
  const cover = event.coverImage ? mediaSrc(event.coverImage.url, orgId) : event.coverImageUrl;
  return (
    <div
      className="relative flex h-full w-full flex-col justify-between overflow-hidden p-5"
      style={cover ? { background: '#171411', color: '#fbf8f2' } : { background: c.bg, color: c.fg }}
      aria-hidden
    >
      {cover ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={cover}
            alt=""
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-[var(--ease-out-quint)] group-hover:scale-[1.03]"
            loading={priority ? 'eager' : 'lazy'}
            decoding="async"
          />
          <span className="absolute inset-0 bg-[linear-gradient(180deg,rgb(23_20_17/0.55)_0%,rgb(23_20_17/0.05)_38%,rgb(23_20_17/0.15)_55%,rgb(23_20_17/0.78)_100%)]" />
        </>
      ) : null}
      <div className="relative flex items-start justify-between text-[0.7rem] font-semibold uppercase tracking-[0.16em] opacity-90 [text-shadow:0_1px_8px_rgb(0_0_0/0.25)]">
        <span>{categoryLabel(event.category)}</span>
        <span>{d.weekdayShort}</span>
      </div>
      <div className="relative leading-[0.82] [text-shadow:0_2px_18px_rgb(0_0_0/0.25)]">
        <span className={`block font-display font-extrabold tracking-[-0.06em] ${size === 'lg' ? 'text-[clamp(6rem,18vw,11rem)]' : 'text-[5.5rem]'}`}>{d.day}</span>
        <span className={`block font-display font-bold tracking-[-0.03em] ${size === 'lg' ? 'text-5xl' : 'text-3xl'}`}>{d.month}</span>
      </div>
      {cover ? null : (
        <span className="pointer-events-none absolute -bottom-6 -right-3 font-display text-[7rem] font-extrabold leading-none tracking-[-0.06em] opacity-[0.07]">
          {event.title.slice(0, 2).toUpperCase()}
        </span>
      )}
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
      <article className="card-glass rounded-[var(--radius-ticket)] group-hover:-translate-y-1">
        <div className="relative aspect-[4/3.4] overflow-hidden rounded-t-[calc(var(--radius-ticket)-1.5px)]">
          <EventPoster event={event} />
          <span className="glass-sheen" aria-hidden />
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
