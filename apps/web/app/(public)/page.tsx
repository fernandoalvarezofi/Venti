import Link from 'next/link';
import { CategoryCarousel } from '@/components/category-carousel';
import { EventCard } from '@/components/event-card';
import { HomeBanner } from '@/components/home-banner';
import { BuyersSection } from '@/components/home/buyers';
import { CategoryMosaic } from '@/components/home/category-mosaic';
import { FeatureSteps } from '@/components/home/features';
import { HowItWorks } from '@/components/home/how-it-works';
import { Essentials, Faq, FinalCta, Payouts, Support } from '@/components/home/organizers';
import { HeroRunner } from '@/components/hero-runner';
import { ArrowRightIcon } from '@/components/icons';
import { SearchBar } from '@/components/search-bar';
import { EmptyState, ErrorState } from '@/components/states';
import { searchEvents } from '@/lib/api';

export default async function Home() {
  const result = await searchEvents({ limit: 12 });

  return (
    <>
      <HomeBanner />

      <section className="relative mx-auto max-w-6xl px-4 pb-14 pt-40 sm:px-6 sm:pt-52">
        <h1 className="sr-only">Lintick: entradas para recitales, fiestas, festivales y teatro</h1>
        <div className="relative isolate max-w-4xl">
          <div aria-hidden className="search-aura" />
          <HeroRunner />
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

      {/* Complementos (referencias de "ejemplos lintick"), en el orden de un recorrido natural:
          categorías → compradores → productoras (cómo funciona, herramientas, cobros, infaltables, soporte) → preguntas → cierre. */}
      <div className="-mb-24 mt-20">
        <CategoryMosaic />
        <BuyersSection />
        <HowItWorks />
        <FeatureSteps />
        <Payouts />
        <Essentials />
        <Support />
        <Faq />
        <FinalCta />
      </div>
    </>
  );
}
