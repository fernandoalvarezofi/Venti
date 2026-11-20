import Link from 'next/link';
import { Logo } from './header';

export function Footer() {
  return (
    <footer className="mt-24 border-t border-line">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-[1.4fr_1fr_1fr] sm:px-6">
        <div>
          <Logo />
          <p className="mt-3 max-w-xs text-sm text-muted">Entradas para recitales, fiestas, festivales y obras. Hecho en Argentina.</p>
        </div>
        <div className="text-sm">
          <p className="eyebrow mb-3">Público</p>
          <ul className="space-y-2 text-ink-soft">
            <li><Link href="/eventos" className="hover:underline">Explorar eventos</Link></li>
            <li><Link href="/mis-entradas" className="hover:underline">Mis entradas</Link></li>
          </ul>
        </div>
        <div className="text-sm">
          <p className="eyebrow mb-3">Productoras</p>
          <p className="text-muted">VENTI Business llega en la próxima etapa.</p>
        </div>
      </div>
    </footer>
  );
}
