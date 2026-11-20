import { CATEGORY_LABELS } from '@/lib/format';
import { PinIcon, SearchIcon } from './icons';
import { TicketButton } from './ticket-button';

/** Formulario GET: funciona sin JavaScript y deja la búsqueda en la URL (se puede compartir). */
export function SearchBar({ q = '', city = '', category = '' }: { q?: string; city?: string; category?: string }) {
  return (
    <form action="/eventos" method="get" role="search" className="search-glass grid gap-2 rounded-[22px] p-2 sm:grid-cols-[1.6fr_1fr_1fr_auto]">
      <label className="relative block">
        <span className="sr-only">Artista, evento o productora</span>
        <SearchIcon className="pointer-events-none absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-muted" />
        <input name="q" defaultValue={q} placeholder="Artista, evento o productora" className="field border-0 bg-transparent pl-11 shadow-none focus:shadow-[inset_0_0_0_2px_var(--color-ink)]" minLength={2} maxLength={80} />
      </label>
      <label className="relative block">
        <span className="sr-only">Ciudad</span>
        <PinIcon className="pointer-events-none absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-muted" />
        <input name="city" defaultValue={city} placeholder="Ciudad" className="field border-0 bg-transparent pl-11 shadow-none sm:shadow-[inset_1px_0_0_var(--color-line)] focus:shadow-[inset_0_0_0_2px_var(--color-ink)]" maxLength={120} />
      </label>
      <label className="block">
        <span className="sr-only">Categoría</span>
        <select name="category" defaultValue={category} className="field appearance-none border-0 bg-transparent shadow-none sm:shadow-[inset_1px_0_0_var(--color-line)] focus:shadow-[inset_0_0_0_2px_var(--color-ink)]">
          <option value="">Todas las categorías</option>
          {Object.entries(CATEGORY_LABELS).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </label>
      <TicketButton type="submit" tone="ink" className="h-12 min-w-[9.5rem]" stub={<SearchIcon className="size-[18px]" />}>
        Buscar
      </TicketButton>
    </form>
  );
}
