import Link from 'next/link';
import { Logo } from './header';
import { SUPPORT_WHATSAPP, SUPPORT_WHATSAPP_URL } from '@/lib/contact';

export function Footer() {
  return (
    <footer className="mt-24 border-t border-line">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr] sm:px-6">
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
          <ul className="space-y-2 text-ink-soft">
            <li><Link href="/business" className="hover:underline">Vendé con Lintick</Link></li>
            <li><Link href="/business" className="hover:underline">Ingresar al panel</Link></li>
          </ul>
        </div>
        <div className="text-sm">
          <p className="eyebrow mb-3">Legales</p>
          <ul className="space-y-2 text-ink-soft">
            <li><Link href="/terminos" className="hover:underline">Términos y condiciones</Link></li>
            <li><Link href="/privacidad" className="hover:underline">Políticas de privacidad</Link></li>
            <li><a href="https://www.argentina.gob.ar/produccion/defensadelconsumidor" target="_blank" rel="noreferrer" className="hover:underline">Defensa de las y los consumidores</a></li>
          </ul>
        </div>
      </div>
      <div className="mx-auto flex max-w-6xl flex-wrap gap-x-5 gap-y-2 border-t border-line px-4 py-5 text-xs text-muted sm:px-6">
        <span>© {new Date().getFullYear()} Lintick. Todos los derechos reservados.</span>
        <Link href="/ayuda" className="hover:underline">Ayuda</Link>
        <a href={SUPPORT_WHATSAPP_URL} target="_blank" rel="noreferrer" className="hover:underline">WhatsApp {SUPPORT_WHATSAPP}</a>
      </div>
    </footer>
  );
}
