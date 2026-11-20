import type { Metadata } from 'next';
import Link from 'next/link';
import { EventCard } from '@/components/event-card';
import { SearchBar } from '@/components/search-bar';
import { EmptyState, ErrorState } from '@/components/states';
import { searchEvents } from '@/lib/api';
import { categoryLabel } from '@/lib/format';

export const metadata: Metadata = { title: 'Explorar eventos' };

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() ?? '';

export default async function EventsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const q = one(sp.q);
  const city = one(sp.city);
  const category = one(sp.category);
  const result = await searchEvents({ q: q.length >= 2 ? q : undefined, city: city || undefined, category: category || undefined, limit: 48 });
  const hasFilters = Boolean(q || city || category);
  const summary = [q && `“${q}”`, category && categoryLabel(category), city && `en ${city}`].filter(Boolean).join(' · ');

  return (
    <div className="mx-auto max-w-6xl px-4 pt-10 sm:px-6">
      <h1 className="text-[clamp(2.2rem,5vw,3.6rem)] font-extrabold leading-none">{hasFilters ? 'Resultados' : 'Todos los eventos'}</h1>
      {hasFilters ? <p className="mt-2 text-muted">{summary}</p> : null}
      <div className="mt-8">
        <SearchBar q={q} city={city} category={category} />
      </div>
      <div className="mt-10">
        {!result.ok ? (
          <ErrorState message={result.error?.message ?? 'El servicio no respondió.'} />
        ) : result.data.items.length === 0 ? (
          <EmptyState
            title={hasFilters ? 'No encontramos eventos con esos filtros' : 'Todavía no hay eventos a la venta'}
            body={hasFilters ? 'Probá con otra ciudad, otra categoría o una búsqueda más corta.' : 'Cuando una productora publique su próximo evento, aparece acá.'}
            {...(hasFilters ? { action: { href: '/eventos', label: 'Ver todos los eventos' } } : {})}
          />
        ) : (
          <>
            <p className="mb-6 text-sm text-muted" aria-live="polite">
              {result.data.items.length === 1 ? '1 evento' : `${result.data.items.length} eventos`}
            </p>
            <ul className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
              {result.data.items.map((e) => (
                <li key={e.id}>
                  <EventCard event={e} />
                </li>
              ))}
            </ul>
            {result.data.nextCursor ? (
              <p className="mt-10 text-center text-sm text-muted">
                Hay más eventos: <Link href="/eventos" className="font-semibold text-ink underline">afiná la búsqueda</Link> para encontrarlos.
              </p>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
