import Link from 'next/link';
import { CATEGORY_LABELS } from '@/lib/format';

/** Íconos de trazo simple, mismo grosor que el resto de la interfaz. */
const ICONS: Record<string, React.ReactNode> = {
  music: <path d="M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm11-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />,
  festival: <path d="M3 20 12 4l9 16M12 4v16M7.5 12h9M5 20h14" />,
  party: <path d="M12 3v3M5.6 5.6l2.1 2.1M3 12h3m12 0h3m-2.6-6.4-2.1 2.1M8 21l2.5-9.5L20 9l-9.5 2.5L8 21Z" />,
  theater: <path d="M4 5c3 1.5 9 1.5 12 0v6a6 6 0 0 1-12 0V5Zm4 4h.01M12 9h.01M8.5 13.5c1 .8 2 .8 3 0M16 8.5c1.4.3 2.8.2 4-.5v5a6 6 0 0 1-6.6 6" />,
  standup: <path d="M12 3a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Zm-6 8a6 6 0 0 0 12 0M12 17v4m-3 0h6" />,
  sports: <path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4 4 3-1.5 4.5h-5L8 10l4-3Zm0-4v4m4 3 4.5-1.5M14.5 14.5 17 19m-7.5-4.5L7 19m1-9L3.5 8.5" />,
  family: <path d="M8 7a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Zm8 2a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM4 21v-6a4 4 0 0 1 8 0v6m1 0v-4a3 3 0 0 1 6 0v4" />,
  conference: <path d="M4 5h16v10H9l-5 4V5Zm4 4h8m-8 3h5" />,
};

function Chip({ value, label, hidden = false }: { value: string; label: string; hidden?: boolean }) {
  return (
    <li className="cat-chip-wrap" aria-hidden={hidden || undefined}>
      <Link href={`/eventos?category=${value}`} tabIndex={hidden ? -1 : undefined} className="cat-chip">
        <span className="cat-chip-icon" aria-hidden>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="size-[18px]">
            {ICONS[value]}
          </svg>
        </span>
        {label}
      </Link>
    </li>
  );
}

/**
 * Carrusel infinito de categorías: la lista se duplica y la cinta se desplaza exactamente la mitad
 * de su ancho, así el corte nunca se ve. La copia es invisible para lectores de pantalla y teclado.
 * Se pausa al pasar el mouse o enfocar; con "reducir movimiento" pasa a ser una fila deslizable.
 */
export function CategoryCarousel() {
  const items = Object.entries(CATEGORY_LABELS);
  return (
    <nav aria-label="Categorías" className="cat-marquee mt-6">
      <ul className="cat-track">
        {items.map(([v, l]) => (
          <Chip key={v} value={v} label={l} />
        ))}
        {items.map(([v, l]) => (
          <Chip key={`copia-${v}`} value={v} label={l} hidden />
        ))}
      </ul>
    </nav>
  );
}
