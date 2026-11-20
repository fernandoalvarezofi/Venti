import Link from 'next/link';
import { CategoryCarousel } from '@/components/category-carousel';
import { EventCard } from '@/components/event-card';
import { HomeBanner } from '@/components/home-banner';
import { Mascot } from '@/components/mascot';
import { ArrowRightIcon } from '@/components/icons';
import { SearchBar } from '@/components/search-bar';
import { EmptyState, ErrorState } from '@/components/states';
import { searchEvents } from '@/lib/api';

export default async function Home() {
  const result = await searchEvents({ limit: 12 });

  return (
    <>
      <HomeBanner />

      <section className="relative mx-auto max-w-6xl px-4 pb-14 pt-10 sm:px-6 sm:pt-14">
        <Mascot pose="jump" size={210} className="pointer-events-none absolute right-6 top-28 hidden lg:block xl:right-2" priority />
        <div className="flex items-start justify-between gap-4">
          <p className="eyebrow">Recitales · fiestas · festivales · teatro</p>
          <Mascot pose="jump" size={80} className="-mt-2 shrink-0 lg:hidden" priority />
        </div>
        <h1 className="mt-4 max-w-4xl text-[clamp(2.8rem,8vw,6.2rem)] font-extrabold leading-[0.92] tracking-[-0.045em]">
          Lo que pasa,
          <br />
          <span className="text-ink-soft/70">con tu entrada</span> en el bolsillo.
        </h1>
        <div className="relative isolate mt-10 max-w-4xl">
          <div aria-hidden className="search-aura" />
          <SearchBar />
        </div>
      </section>

      <div className="cat-ribbon-wrap">
        <CategoryCarousel />
      </div>

      <section className="mx-auto max-w-6xl px-4 sm:px-6" aria-labelledby="proximos">
        <div className="mb-6 flex items-end justify-between gap-4 border-t border-line pt-8">
          <h2 id="proximos" className="text-3xl font-bold">
            Próximos eventos
          </h2>
          <Link href="/eventos" className="inline-flex items-center gap-1.5 text-sm font-semibold hover:underline">
            Ver todos <ArrowRightIcon className="size-4" />
          </Link>
        </div>
        {!result.ok ? (
          <ErrorState message={result.error?.message ?? 'El servicio no respondió.'} />
        ) : result.data.items.length === 0 ? (
          <EmptyState
            title="Todavía no hay eventos a la venta"
            body="Cuando una productora publique su próximo evento en Lintick, lo vas a ver acá primero."
          />
        ) : (
          <ul className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {result.data.items.map((e) => (
              <li key={e.id}>
                <EventCard event={e} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
