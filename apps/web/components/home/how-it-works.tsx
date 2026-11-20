import Link from 'next/link';
import { PAYMENTS_LIVE } from '@/lib/config';

const STEPS = [
  { n: '01', title: 'Registrate y publicá tu evento', body: 'Creá tu cuenta de productora gratis y armá tu evento: fecha, lugar, portada, line-up y tipos de entrada.', note: 'en minutos', notePos: 'bottom', tilt: '-rotate-3', pin: '' },
  { n: '02', title: 'Conectá tu Mercado Pago', body: 'Un botón y listo. Cada venta se acredita directo en tu cuenta; Lintick sólo descuenta su comisión.', note: 'tu plata, directo a vos', notePos: 'top', tilt: 'rotate-2 lg:translate-y-8', pin: 'hz-pin-ink' },
  { n: '03', title: 'Vendé entradas con tu link', body: 'Compartí el link de tu evento: tu público compra en segundos, sin cargos extra, y recibe su QR al instante.', note: 'súper fácil', notePos: 'bottom', tilt: '-rotate-2', pin: '' },
  { n: '04', title: 'Validá entradas con tu celular', body: 'El día del evento escaneás los QR con cualquier celular, incluso sin internet. Cada entrada entra una sola vez.', note: 'a prueba de fallas', notePos: 'top', tilt: 'rotate-3 lg:translate-y-8', pin: 'hz-pin-ink' },
] as const;

/** "¿Cómo funciona? Empezá en minutos" — notas con chinche sobre cuadrícula (referencia: Como funciona 1). */
export function HowItWorks() {
  return (
    <section id="como-funciona" className="hz hz-grid relative scroll-mt-20 overflow-hidden" aria-labelledby="como-funciona-t">
      <div className="mx-auto max-w-6xl px-4 py-20 text-center sm:px-6 sm:py-28">
        <p className="hz-eyebrow">Para vendedores</p>
        <h2 id="como-funciona-t" className="hz-title mt-4 text-[clamp(2.6rem,7vw,4.6rem)]">
          ¿Cómo funciona?
          <br />
          Empezá en minutos
        </h2>
        <p className="hz-muted mx-auto mt-5 max-w-lg">Pagás sólo cuando vendés: sin abono mensual, sin contratos y sin anticipos. En pocos minutos publicás tu primer evento.</p>

        <ol className="relative mt-16 grid justify-items-center gap-x-6 gap-y-28 sm:grid-cols-2 sm:gap-y-24 lg:grid-cols-4">
          {/* Hilo punteado que une las notas (escritorio) */}
          <svg className="pointer-events-none absolute inset-x-0 top-24 hidden h-16 w-full lg:block" viewBox="0 0 1000 60" preserveAspectRatio="none" aria-hidden>
            <path d="M120 20 C 200 50, 300 50, 370 40 S 560 10, 630 25 S 820 55, 880 40" fill="none" stroke="rgb(244 239 230 / 0.3)" strokeWidth="1.5" strokeDasharray="3 6" />
          </svg>
          {STEPS.map((s) => (
            <li key={s.n} className={`relative w-full max-w-[15rem] ${s.tilt}`}>
              {s.notePos === 'top' ? <span className="hand absolute -top-11 left-1/2 w-max -translate-x-1/2">{s.note}</span> : null}
              <div className="hz-note text-left">
                <span className={`hz-pin ${s.pin}`} aria-hidden />
                <p className="font-[family-name:var(--font-caveat)] text-2xl font-semibold text-accent">{s.n}</p>
                <h3 className="mt-1 font-display text-lg font-bold leading-tight">{s.title}</h3>
                {s.n === '02' && !PAYMENTS_LIVE ? <span className="hz-soon mt-2">Muy pronto</span> : null}
                <p className="mt-2 text-[0.82rem] leading-relaxed text-ink-soft">{s.body}</p>
              </div>
              {s.notePos === 'bottom' ? <span className="hand absolute -bottom-9 left-6 w-max">{s.note}</span> : null}
            </li>
          ))}
        </ol>

        <Link
          href="/registrarse?next=/business"
          className="mt-20 inline-flex items-center gap-4 rounded-2xl bg-paper py-3 pl-6 pr-3 text-sm font-semibold text-ink shadow-[6px_6px_0_var(--color-accent)] transition-transform hover:-translate-y-0.5"
        >
          <span>
            Creá tu cuenta de productora <strong>gratis</strong> — sin tarjeta de crédito
          </span>
          <span className="grid size-9 place-items-center rounded-xl bg-ink text-paper" aria-hidden>
            →
          </span>
        </Link>
      </div>
    </section>
  );
}
