import Link from 'next/link';
import { getCategoryCounts, searchEvents } from '@/lib/api';
import { mediaSrc } from '@/lib/format';

const ICON: Record<string, React.ReactNode> = {
  music: <path d="M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm11-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />,
  party: <path d="M12 3v3M5.6 5.6l2.1 2.1M3 12h3m12 0h3m-2.6-6.4-2.1 2.1M8 21l2.5-9.5L20 9l-9.5 2.5L8 21Z" />,
  standup: <path d="M12 3a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Zm-6 8a6 6 0 0 0 12 0M12 17v4m-3 0h6" />,
  festival: <path d="M3 20 12 4l9 16M12 4v16M7.5 12h9M5 20h14" />,
  theater: <path d="M4 5c3 1.5 9 1.5 12 0v6a6 6 0 0 1-12 0V5Zm4 4h.01M12 9h.01M8.5 13.5c1 .8 2 .8 3 0" />,
  sports: <path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4 4 3-1.5 4.5h-5L8 10l4-3Z" />,
};

/** Distribución igual a la referencia: una grande, dos chicas, una ancha y dos abajo. */
const TILES = [
  { value: 'music', label: 'Música', tagline: 'desde recitales íntimos a estadios.', area: 'lg:col-span-2 lg:row-span-2', big: true },
  { value: 'party', label: 'Fiestas', area: '' },
  { value: 'standup', label: 'Stand-up', area: '' },
  { value: 'festival', label: 'Festivales', area: 'lg:col-span-2' },
  { value: 'theater', label: 'Teatro', area: '' },
  { value: 'sports', label: 'Deportes', area: '' },
] as const;

/**
 * "Todo se vende acá": mosaico de categorías con la portada real del próximo evento de cada una
 * y la cantidad real de eventos a la venta. Sin portada, fondo con la luz de la marca e ícono.
 */
export async function CategoryMosaic() {
  const [counts, ...covers] = await Promise.all([getCategoryCounts(), ...TILES.map((t) => searchEvents({ category: t.value, limit: 1 }))]);
  const n = Object.fromEntries((counts.ok ? counts.data.items : []).map((c) => [c.category, c.count]));
  const top = Object.entries(n).sort((a, b) => b[1] - a[1])[0]?.[0];

  return (
    <section className="hz" aria-labelledby="mosaico">
      <div className="mx-auto max-w-6xl px-4 pb-20 pt-20 sm:px-6 sm:pb-24 sm:pt-24">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <h2 id="mosaico" className="hz-title max-w-2xl text-[clamp(2.2rem,5.5vw,3.6rem)]">
            Música, fiesta, festivales, teatro. <span className="hz-ghost">Todo se vende acá.</span>
          </h2>
          <Link href="/eventos" className="inline-flex h-11 items-center gap-2 rounded-full px-5 text-sm font-semibold shadow-[inset_0_0_0_1px_rgb(244_239_230/0.25)] transition-colors hover:bg-paper hover:text-ink">
            Explorar eventos <span aria-hidden>→</span>
          </Link>
        </div>

        <ul className="mt-10 grid auto-rows-[11rem] grid-cols-2 gap-3 sm:auto-rows-[12.5rem] lg:grid-cols-4">
          {TILES.map((t, i) => {
            const ev = covers[i]?.ok ? covers[i].data.items[0] : undefined;
            const cover = ev?.coverImage?.url ? mediaSrc(ev.coverImage.url) : null;
            const count = n[t.value] ?? 0;
            const isBig = 'big' in t && t.big;
            return (
              <li key={t.value} className={`${t.area} ${isBig ? 'col-span-2 row-span-2' : ''} ${t.value === 'festival' ? 'col-span-2' : ''}`}>
                <Link href={`/eventos?category=${t.value}`} className="hz-tile group h-full">
                  {cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={cover} alt="" loading="lazy" decoding="async" />
                  ) : (
                    <span aria-hidden className="absolute inset-0 -z-10 grid place-items-center bg-[radial-gradient(70%_70%_at_50%_45%,rgb(210_58_31/0.35),transparent_70%)]">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round" className={`${isBig ? 'size-24' : 'size-12'} text-accent opacity-90`}>
                        {ICON[t.value]}
                      </svg>
                    </span>
                  )}
                  <span className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4 sm:p-5">
                    <span>
                      {isBig ? (
                        <span className="mb-2 inline-flex rounded-full bg-paper/15 px-2.5 py-1 text-[0.7rem] font-semibold backdrop-blur-sm">
                          {count} {count === 1 ? 'evento a la venta' : 'eventos a la venta'}
                        </span>
                      ) : null}
                      <span className={`block font-display font-extrabold leading-none tracking-[-0.04em] ${isBig ? 'text-[clamp(2.6rem,6vw,4rem)]' : 'text-[1.4rem]'}`}>{t.label}</span>
                      {isBig && 'tagline' in t ? <span className="mt-2 block text-sm text-paper/75">{t.tagline}</span> : <span className="mt-1 block text-xs text-paper/60">{count === 0 ? 'Próximamente' : `${count} ${count === 1 ? 'evento' : 'eventos'}`}</span>}
                      {isBig ? <span className="mt-3 inline-flex items-center gap-1.5 text-sm text-paper/80 transition-colors group-hover:text-white">explorar <span aria-hidden>→</span></span> : null}
                    </span>
                    {t.value === top && count > 0 && !isBig ? <span className="shrink-0 rounded-full bg-accent px-2.5 py-1 text-[0.7rem] font-bold text-white">más vendido</span> : null}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
