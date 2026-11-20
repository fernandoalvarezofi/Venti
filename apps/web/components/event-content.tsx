import { AMENITY_LABELS, LINEUP_ROLE_LABELS, LINEUP_ROLE_PLURALS, dateParts, mediaSrc } from '@/lib/format';
import type { EventContent, LineupItem, Venue } from '@/lib/types';

const ROLE_ORDER = ['headliner', 'guest', 'support', 'resident', 'dj', 'host'] as const;
const LINK_LABELS: Record<string, string> = { instagram: 'Instagram', tiktok: 'TikTok', spotify: 'Spotify', youtube: 'YouTube', website: 'Sitio web' };

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10" aria-labelledby={id}>
      <h2 id={id} className="text-xl font-bold">
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** Datos rápidos: apertura de puertas, edad mínima, vestimenta. */
export function QuickFacts({ c }: { c: EventContent }) {
  const items = [
    c.doorsOpenAt ? { k: 'Apertura de puertas', v: `${dateParts(c.doorsOpenAt).time} h` } : null,
    c.minAge !== null ? { k: 'Edad mínima', v: c.minAge === 0 ? 'Todas las edades' : `+${c.minAge}` } : null,
    c.dressCode ? { k: 'Vestimenta', v: c.dressCode } : null,
  ].filter(Boolean) as { k: string; v: string }[];
  if (items.length === 0) return null;
  return (
    <dl className="mt-6 flex flex-wrap gap-2">
      {items.map((i) => (
        <div key={i.k} className="rounded-xl bg-surface px-4 py-2.5">
          <dt className="text-xs text-muted">{i.k}</dt>
          <dd className="font-semibold">{i.v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Line-up agrupado por rol: principales primero, después invitados, soporte, residentes. */
export function Lineup({ items }: { items: LineupItem[] }) {
  if (items.length === 0) return null;
  const groups = ROLE_ORDER.map((role) => ({ role, artists: items.filter((i) => i.role === role) })).filter((g) => g.artists.length > 0);
  return (
    <Section id="lineup" title="Line-up">
      <div className="space-y-6">
        {groups.map((g) => (
          <div key={g.role}>
            <p className="eyebrow mb-2">{g.artists.length > 1 ? LINEUP_ROLE_PLURALS[g.role] : LINEUP_ROLE_LABELS[g.role]}</p>
            <ul className={g.role === 'headliner' ? 'space-y-1' : 'flex flex-wrap gap-2'}>
              {g.artists.map((a, i) => {
                const meta = [a.startsAt ? `${dateParts(a.startsAt).time} h` : null, a.stage].filter(Boolean).join(' · ');
                return g.role === 'headliner' ? (
                  <li key={`${a.name}-${i}`} className="flex flex-wrap items-baseline justify-between gap-x-4 border-b border-line py-2">
                    <span className="font-display text-[clamp(1.6rem,4vw,2.4rem)] font-extrabold leading-tight tracking-[-0.03em]">{a.name}</span>
                    {meta ? <span className="text-sm text-muted">{meta}</span> : null}
                  </li>
                ) : (
                  <li key={`${a.name}-${i}`} className="rounded-full bg-surface px-4 py-2 text-sm">
                    <span className="font-semibold">{a.name}</span>
                    {meta ? <span className="text-muted"> · {meta}</span> : null}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </Section>
  );
}

export function Amenities({ codes, extra }: { codes: string[]; extra: string[] }) {
  const labels = [...codes.map((c) => AMENITY_LABELS[c] ?? c), ...extra];
  if (labels.length === 0) return null;
  return (
    <Section id="que-hay" title="Qué hay en el evento">
      <ul className="grid grid-cols-2 gap-x-6 gap-y-2.5 sm:grid-cols-3">
        {labels.map((l) => (
          <li key={l} className="flex items-center gap-2 text-ink-soft">
            <CheckIcon />
            {l}
          </li>
        ))}
      </ul>
    </Section>
  );
}

export function Gallery({ images, title }: { images: EventContent['gallery']; title: string }) {
  if (images.length === 0) return null;
  return (
    <Section id="galeria" title="Galería">
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {images.map((img, i) => (
          <li key={img.id} className={i === 0 && images.length > 2 ? 'col-span-2 row-span-2' : ''}>
            <a href={mediaSrc(img.url)} target="_blank" rel="noreferrer" className="block h-full overflow-hidden rounded-xl bg-ink/5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={mediaSrc(img.url)} alt={`Foto ${i + 1} de ${title}`} loading="lazy" decoding="async" className="aspect-square h-full w-full object-cover transition-transform duration-500 hover:scale-[1.03]" />
            </a>
          </li>
        ))}
      </ul>
    </Section>
  );
}

export function Policies({ text }: { text: string }) {
  if (!text.trim()) return null;
  return (
    <Section id="condiciones" title="Condiciones">
      <div className="max-w-[65ch] whitespace-pre-line text-sm leading-relaxed text-ink-soft">{text}</div>
    </Section>
  );
}

export function LinksAndMap({ links, venue }: { links: EventContent['links']; venue: Venue | null }) {
  const entries = Object.entries(links).filter(([, v]) => v) as [string, string][];
  const mapUrl = venue ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${venue.name}, ${venue.address}, ${venue.city}, ${venue.province}`)}` : null;
  if (entries.length === 0 && !mapUrl) return null;
  return (
    <div className="mt-8 flex flex-wrap gap-2">
      {mapUrl ? (
        <a href={mapUrl} target="_blank" rel="noreferrer" className="btn btn-ghost h-10 text-sm">
          Cómo llegar ↗
        </a>
      ) : null}
      {entries.map(([k, v]) => (
        <a key={k} href={v} target="_blank" rel="noreferrer nofollow" className="btn btn-ghost h-10 text-sm">
          {LINK_LABELS[k] ?? k} ↗
        </a>
      ))}
    </div>
  );
}
