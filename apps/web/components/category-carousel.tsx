import Link from 'next/link';
import { CATEGORY_LABELS } from '@/lib/format';

function Star() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="cat-star">
      <path d="M12 1.5 14.6 9.4 22.5 12 14.6 14.6 12 22.5 9.4 14.6 1.5 12 9.4 9.4Z" fill="currentColor" />
    </svg>
  );
}

function Row({ hidden = false }: { hidden?: boolean }) {
  return (
    <ul className="cat-row" aria-hidden={hidden || undefined}>
      {Object.entries(CATEGORY_LABELS).map(([value, label], i) => (
        <li key={value} className="cat-item">
          <Link href={`/eventos?category=${value}`} tabIndex={hidden ? -1 : undefined} className={`cat-word ${i % 2 ? 'cat-word-outline' : ''}`}>
            {label}
          </Link>
          <Star />
        </li>
      ))}
    </ul>
  );
}

/**
 * Cinta de categorías: banda oscura apenas inclinada (como una entrada), con bordes perforados
 * y los nombres en tipografía display grande, alternando lleno y contorno. Se desplaza en bucle
 * (la fila se repite y se mueve exactamente una fila); se pausa al pasar el mouse o con el teclado.
 */
export function CategoryCarousel() {
  return (
    <nav aria-label="Categorías" className="cat-ribbon">
      <div className="cat-track">
        <Row />
        <Row hidden />
      </div>
    </nav>
  );
}
