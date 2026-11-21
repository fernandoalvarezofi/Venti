import { AMENITY_LABELS, LINEUP_ROLE_LABELS, LINEUP_ROLE_PLURALS, dateParts, mediaSrc } from '@/lib/format';
import type { EventContent, LineupItem, PageSectionKey, Sponsor, SponsorTier } from '@/lib/types';

/**
 * Secciones de la página pública de un evento. Las usa la página pública y la vista previa del editor:
 * así lo que ve la productora al editar es exactamente lo que ve el público.
 */

export const SECTION_LABELS: Record<PageSectionKey, string> = {
  about: 'Sobre el evento',
  lineup: 'Line-up',
  videos: 'Videos',
  gallery: 'Galería',
  amenities: 'Qué hay en el evento',
  sponsors: 'Patrocinadores y marcas',
  faq: 'Preguntas frecuentes',
  policies: 'Condiciones',
  contact: 'Contacto',
};
export const DEFAULT_SECTIONS: PageSectionKey[] = ['about', 'lineup', 'videos', 'gallery', 'amenities', 'sponsors', 'faq', 'policies', 'contact'];

/** Orden guardado por la productora + las secciones nuevas que todavía no estaban en su lista (visibles). */
export function resolveSections(saved: EventContent['pageSections']): { key: PageSectionKey; visible: boolean }[] {
  const known = saved.filter((s) => DEFAULT_SECTIONS.includes(s.key));
  const missing = DEFAULT_SECTIONS.filter((k) => !known.some((s) => s.key === k)).map((key) => ({ key, visible: true }));
  return [...known, ...missing];
}

export const SPONSOR_TIER_LABELS: Record<SponsorTier, string> = {
  sponsor: 'Patrocinan',
  partner: 'Acompañan',
  brand: 'Marcas',
  producer: 'Producen',
  media: 'Medios',
};

const ROLE_ORDER = ['headliner', 'guest', 'support', 'resident', 'dj', 'host'] as const;
const assetSrc = (id: string) => mediaSrc(`/v1/media/${id}`);

/** Id de un video de YouTube o Vimeo para incrustarlo; null si el enlace no es reconocible. */
export function videoEmbed(url: string): { src: string; provider: 'YouTube' | 'Vimeo' } | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\.|^m\./, '');
    if (host === 'youtu.be') {
      const id = u.pathname.slice(1).split('/')[0];
      return id ? { src: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}`, provider: 'YouTube' } : null;
    }
    if (host.endsWith('youtube.com')) {
      const id = u.searchParams.get('v') ?? u.pathname.match(/\/(?:shorts|embed|live)\/([^/?#]+)/)?.[1];
      return id ? { src: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}`, provider: 'YouTube' } : null;
    }
    if (host.endsWith('vimeo.com')) {
      const id = u.pathname.match(/\/(\d+)/)?.[1];
      return id ? { src: `https://player.vimeo.com/video/${id}`, provider: 'Vimeo' } : null;
    }
  } catch {
    /* enlace inválido */
  }
  return null;
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section className="mt-12" aria-labelledby={`sec-${id}`}>
      <h2 id={`sec-${id}`} className="text-xl font-bold">
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  );
}

function Lineup({ items }: { items: LineupItem[] }) {
  const groups = ROLE_ORDER.map((role) => ({ role, artists: items.filter((i) => i.role === role) })).filter((g) => g.artists.length > 0);
  const featured = items.filter((a) => a.imageId || a.bio);
  return (
    <div className="space-y-8">
      {featured.length > 0 ? (
        <ul className="grid gap-4 sm:grid-cols-2">
          {featured.map((a, i) => (
            <li key={`${a.name}-${i}`} className="flex gap-4 rounded-[16px] bg-surface p-3">
              {a.imageId ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={assetSrc(a.imageId)} alt={a.name} loading="lazy" className="size-24 shrink-0 rounded-[12px] object-cover" />
              ) : (
                <span className="grid size-24 shrink-0 place-items-center rounded-[12px] bg-ink font-display text-3xl font-extrabold text-paper">{a.name.charAt(0)}</span>
              )}
              <div className="min-w-0 py-1">
                <p className="text-xs text-muted">{LINEUP_ROLE_LABELS[a.role]}</p>
                <p className="font-display text-lg font-extrabold leading-tight tracking-[-0.02em]">{a.name}</p>
                {a.bio ? <p className="mt-1 line-clamp-3 text-sm text-ink-soft">{a.bio}</p> : null}
                {a.link ? (
                  <a href={a.link} target="_blank" rel="noreferrer nofollow" className="mt-1 inline-block text-sm font-semibold underline">
                    Escuchar / ver más
                  </a>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
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
  );
}

function Videos({ videos }: { videos: EventContent['videos'] }) {
  const list = videos.map((v) => ({ ...v, embed: videoEmbed(v.url) })).filter((v) => v.embed);
  return (
    <ul className={`grid gap-4 ${list.length > 1 ? 'sm:grid-cols-2' : ''}`}>
      {list.map((v, i) => (
        <li key={`${v.url}-${i}`}>
          <div className="aspect-video overflow-hidden rounded-[16px] bg-ink">
            <iframe
              src={v.embed!.src}
              title={v.title || `Video ${i + 1} (${v.embed!.provider})`}
              loading="lazy"
              allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
              className="h-full w-full"
            />
          </div>
          {v.title ? <p className="mt-2 text-sm font-semibold">{v.title}</p> : null}
        </li>
      ))}
    </ul>
  );
}

function Sponsors({ sponsors }: { sponsors: Sponsor[] }) {
  const tiers = (Object.keys(SPONSOR_TIER_LABELS) as SponsorTier[]).map((t) => ({ t, items: sponsors.filter((s) => s.tier === t) })).filter((g) => g.items.length);
  return (
    <div className="space-y-6">
      {tiers.map((g) => (
        <div key={g.t}>
          <p className="eyebrow mb-3">{SPONSOR_TIER_LABELS[g.t]}</p>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {g.items.map((s, i) => {
              const inner = (
                <span className="flex h-24 items-center justify-center rounded-[14px] bg-surface p-4 text-center">
                  {s.logoId ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={assetSrc(s.logoId)} alt={s.name} loading="lazy" className="max-h-14 max-w-full object-contain" />
                  ) : (
                    <span className="font-display text-base font-extrabold leading-tight">{s.name}</span>
                  )}
                </span>
              );
              return (
                <li key={`${s.name}-${i}`}>
                  {s.url ? (
                    <a href={s.url} target="_blank" rel="noreferrer nofollow sponsored" aria-label={s.name} className="block transition-opacity hover:opacity-80">
                      {inner}
                    </a>
                  ) : (
                    inner
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

function Faq({ items }: { items: EventContent['faq'] }) {
  return (
    <div className="divide-y divide-line rounded-[16px] bg-surface">
      {items.map((f, i) => (
        <details key={i} className="group px-5 py-4">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold">
            {f.q}
            <span className="text-xl leading-none text-muted transition-transform group-open:rotate-45" aria-hidden>
              +
            </span>
          </summary>
          <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink-soft">{f.a}</p>
        </details>
      ))}
    </div>
  );
}

function Contact({ c }: { c: EventContent['contact'] }) {
  const wa = c.whatsapp?.replace(/[^\d]/g, '');
  return (
    <div className="flex flex-wrap gap-2">
      {wa ? (
        <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" className="btn btn-ghost h-10 text-sm">
          WhatsApp ↗
        </a>
      ) : null}
      {c.email ? (
        <a href={`mailto:${c.email}`} className="btn btn-ghost h-10 text-sm">
          {c.email}
        </a>
      ) : null}
    </div>
  );
}

/** Todas las secciones, en el orden y con la visibilidad que eligió la productora. Las vacías no se muestran. */
export function EventSections({ content, description, title }: { content: EventContent; description: string; title: string }) {
  const c = content;
  const render: Record<PageSectionKey, () => React.ReactNode> = {
    about: () =>
      c.summary || description ? (
        <Section id="about" title={SECTION_LABELS.about}>
          {c.summary ? <p className="max-w-[60ch] text-lg font-medium leading-snug">{c.summary}</p> : null}
          {description ? <div className="mt-3 max-w-[65ch] whitespace-pre-line leading-relaxed text-ink-soft">{description}</div> : null}
        </Section>
      ) : null,
    lineup: () =>
      c.lineup.length ? (
        <Section id="lineup" title={SECTION_LABELS.lineup}>
          <Lineup items={c.lineup} />
        </Section>
      ) : null,
    videos: () =>
      c.videos.some((v) => videoEmbed(v.url)) ? (
        <Section id="videos" title={SECTION_LABELS.videos}>
          <Videos videos={c.videos} />
        </Section>
      ) : null,
    gallery: () =>
      c.gallery.length ? (
        <Section id="gallery" title={SECTION_LABELS.gallery}>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {c.gallery.map((img, i) => (
              <li key={img.id} className={i === 0 && c.gallery.length > 2 ? 'col-span-2 row-span-2' : ''}>
                <a href={mediaSrc(img.url)} target="_blank" rel="noreferrer" className="block h-full overflow-hidden rounded-xl bg-ink/5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={mediaSrc(img.url)} alt={`Foto ${i + 1} de ${title}`} width={img.width} height={img.height} loading="lazy" decoding="async" className="aspect-square h-full w-full object-cover transition-transform duration-500 hover:scale-[1.03]" />
                </a>
              </li>
            ))}
          </ul>
        </Section>
      ) : null,
    amenities: () => {
      const labels = [...c.amenities.map((x) => AMENITY_LABELS[x] ?? x), ...c.extraAmenities];
      return labels.length ? (
        <Section id="amenities" title={SECTION_LABELS.amenities}>
          <ul className="grid grid-cols-2 gap-x-6 gap-y-2.5 sm:grid-cols-3">
            {labels.map((l) => (
              <li key={l} className="flex items-center gap-2 text-ink-soft">
                <CheckIcon />
                {l}
              </li>
            ))}
          </ul>
        </Section>
      ) : null;
    },
    sponsors: () =>
      c.sponsors.length ? (
        <Section id="sponsors" title={SECTION_LABELS.sponsors}>
          <Sponsors sponsors={c.sponsors} />
        </Section>
      ) : null,
    faq: () =>
      c.faq.length ? (
        <Section id="faq" title={SECTION_LABELS.faq}>
          <Faq items={c.faq} />
        </Section>
      ) : null,
    policies: () =>
      c.policies.trim() ? (
        <Section id="policies" title={SECTION_LABELS.policies}>
          <div className="max-w-[65ch] whitespace-pre-line text-sm leading-relaxed text-ink-soft">{c.policies}</div>
        </Section>
      ) : null,
    contact: () =>
      c.contact.email || c.contact.whatsapp ? (
        <Section id="contact" title={SECTION_LABELS.contact}>
          <Contact c={c.contact} />
        </Section>
      ) : null,
  };
  return (
    <>
      {resolveSections(c.pageSections)
        .filter((s) => s.visible)
        .map((s) => (
          <div key={s.key}>{render[s.key]()}</div>
        ))}
    </>
  );
}
