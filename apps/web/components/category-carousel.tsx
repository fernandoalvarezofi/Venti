import Link from 'next/link';
import { getCategoryCounts } from '@/lib/api';
import { CATEGORY_LABELS } from '@/lib/format';

function Row({ counts, hidden = false }: { counts: Record<string, number>; hidden?: boolean }) {
  return (
    <ul className="cx-row" aria-hidden={hidden || undefined}>
      {Object.entries(CATEGORY_LABELS).map(([value, label], i) => {
        const n = counts[value] ?? 0;
        return (
          <li key={value} className="cx-item">
            <Link href={`/eventos?category=${value}`} tabIndex={hidden ? -1 : undefined} className="cx-link">
              <span className="cx-index" aria-hidden>
                {String(i + 1).padStart(2, '0')}
              </span>
              <span className="cx-name">{label}</span>
              <span className="cx-count">
                <span aria-hidden={n === 0 || undefined}>{n > 0 ? n : '—'}</span>
                <span className="sr-only">{n === 0 ? ' (sin eventos a la venta)' : n === 1 ? ' evento a la venta' : ' eventos a la venta'}</span>
              </span>
              <svg viewBox="0 0 24 24" className="cx-arrow" aria-hidden fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
                <path d="M7 17 17 7M8 7h9v9" />
              </svg>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Índice de categorías: franja tinta a todo el ancho, filetes finos arriba y abajo, número de orden,
 * nombre en display y cantidad real de eventos a la venta. Se desplaza lento en bucle (fila + copia,
 * -50%); se detiene al pasar el mouse o al navegar con teclado.
 */
export async function CategoryCarousel() {
  const res = await getCategoryCounts();
  const counts = Object.fromEntries((res.ok ? res.data.items : []).map((c) => [c.category, c.count]));
  return (
    <nav aria-label="Categorías" className="cx">
      <div className="cx-head">
        <span>Categorías</span>
        <Link href="/eventos" className="cx-all">
          Ver todo
        </Link>
      </div>
      <div className="cx-viewport">
        <div className="cx-track">
          <Row counts={counts} />
          <Row counts={counts} hidden />
        </div>
      </div>
    </nav>
  );
}
