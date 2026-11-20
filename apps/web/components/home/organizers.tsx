import Link from 'next/link';
import { PAYMENTS_LIVE } from '@/lib/config';
import { PayoutFlow } from './payout-flow';

const Soon = () => (PAYMENTS_LIVE ? null : <span className="hz-soon ml-2 align-middle">Muy pronto</span>);

/** "Cobrá la recaudación de tus ventas, al instante" (referencia: cobra la recaudacion). */
export function Payouts() {
  return (
    <section className="hz overflow-hidden" aria-labelledby="cobros">
      <div className="mx-auto max-w-6xl px-4 py-20 text-center sm:px-6 sm:py-28">
        {!PAYMENTS_LIVE ? <p className="mb-5"><span className="hz-soon">Muy pronto</span></p> : null}
        <h2 id="cobros" className="hz-title text-[clamp(2.4rem,6.5vw,4.2rem)]">
          Cobrá la recaudación
          <br />
          <span className="hz-mark">de tus ventas, al instante</span>
        </h2>
        <p className="hz-muted mx-auto mt-5 max-w-xl">
          Lintick no retiene ni intermedia tus fondos: <strong className="text-paper">cada venta se acredita directo en tu cuenta de Mercado Pago</strong>, con nuestra comisión ya descontada.
        </p>

        <div className="payout-box relative mx-auto mt-14 max-w-4xl p-6 text-left sm:p-10">
          <PayoutFlow />
          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 border-t border-ink/10 pt-6 text-sm text-muted">
            <span>Cobrás con</span>
            <span className="rounded-full bg-[#009ee3] px-3 py-1 font-semibold text-white">Mercado Pago</span>
            <span className="text-xs">Ejemplo: de $ 120.000 te llegan $ 108.000 (comisión Lintick 10%). Montos ilustrativos.</span>
          </div>
        </div>
      </div>
    </section>
  );
}

/** "Infaltables para tu evento" (referencia: infaltables). */
export function Essentials() {
  return (
    <section className="hz hz-light" aria-labelledby="infaltables">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <h2 id="infaltables" className="hz-title text-[clamp(2.6rem,7vw,4.6rem)]">
          Infaltables para
          <br />
          tu evento.
        </h2>
        <div className="mt-12 grid gap-8 md:grid-cols-2">
          {/* 1. Escáner sin internet */}
          <article>
            <div className="relative aspect-[4/3.4] overflow-hidden rounded-2xl">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/home/escena-1.webp" alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover grayscale" />
              <div className="absolute inset-0 bg-[#3a140b] mix-blend-color" />
              <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/30 to-transparent" />
              <span className="absolute left-4 top-4 grid size-8 place-items-center rounded-full bg-paper/15 text-sm font-bold backdrop-blur">1</span>
              {/* Pantalla del escáner */}
              <div className="absolute left-1/2 top-1/2 w-40 -translate-x-1/2 -translate-y-1/2 -rotate-6 rounded-[1.6rem] bg-[#0e0c0b] p-1.5 shadow-[0_30px_50px_-20px_rgb(0_0_0/0.9)]">
                <div className="flex aspect-[9/16] flex-col items-center justify-center rounded-[1.25rem] bg-[#1d6b3a] text-center text-white">
                  <span className="grid size-12 place-items-center rounded-full bg-white/20 text-2xl font-bold">✓</span>
                  <span className="mt-3 font-display text-xl font-extrabold uppercase">Adelante</span>
                  <span className="mt-2 rounded-full bg-black/25 px-2 py-0.5 text-[0.55rem] font-bold uppercase tracking-[0.1em]">sin señal</span>
                </div>
              </div>
              <div className="absolute bottom-4 right-4 flex items-center gap-2.5 rounded-xl bg-ink/85 px-3 py-2 text-xs backdrop-blur">
                <span className="grid size-6 place-items-center rounded-full bg-[#1d6b3a] text-[0.7rem] font-bold">✓</span>
                <span>
                  <span className="block font-semibold">Entrada validada</span>
                  <span className="font-mono text-[0.65rem] text-paper/55">SIN SEÑAL · 9F3A-2C1E</span>
                </span>
              </div>
            </div>
            <h3 className="mt-5 font-display text-2xl font-bold tracking-[-0.02em]">Escáner QR sin internet</h3>
            <p className="hz-muted mt-1.5 max-w-sm text-sm">Validá las entradas desde cualquier celular, incluso sin conexión. Cuando vuelve la señal, todo se sincroniza solo.</p>
          </article>

          {/* 2. Reportes */}
          <article>
            <div className="relative aspect-[4/3.4] overflow-hidden rounded-2xl">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/home/escena-2.webp" alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover grayscale" />
              <div className="absolute inset-0 bg-[#3a140b] mix-blend-color" />
              <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/40 to-ink/10" />
              <span className="absolute left-4 top-4 grid size-8 place-items-center rounded-full bg-paper/15 text-sm font-bold backdrop-blur">2</span>
              <div className="absolute left-1/2 top-1/2 w-44 -translate-x-1/2 -translate-y-1/2 rotate-3 rounded-[1.6rem] bg-[#0e0c0b] p-1.5 shadow-[0_30px_50px_-20px_rgb(0_0_0/0.9)]">
                <div className="aspect-[9/16] rounded-[1.25rem] bg-[#1f1b18] p-3">
                  <div className="grid grid-cols-2 gap-1.5 text-center">
                    <span className="rounded-lg bg-paper/10 py-1.5">
                      <span className="block text-[0.5rem] text-paper/50">emitidas</span>
                      <span className="text-sm font-bold">1.240</span>
                    </span>
                    <span className="rounded-lg bg-paper/10 py-1.5">
                      <span className="block text-[0.5rem] text-paper/50">ingresaron</span>
                      <span className="text-sm font-bold">1.198</span>
                    </span>
                  </div>
                  <svg viewBox="0 0 100 50" className="mt-3 w-full" aria-hidden>
                    <path d="M0 45 L12 40 L24 42 L36 30 L48 33 L60 20 L72 24 L84 10 L100 6" fill="none" stroke="#f08a4b" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M0 45 L12 40 L24 42 L36 30 L48 33 L60 20 L72 24 L84 10 L100 6 L100 50 L0 50 Z" fill="rgb(240 138 75 / 0.18)" />
                  </svg>
                  {['Campo', 'Platea', 'VIP'].map((t, i) => (
                    <div key={t} className="mt-2 flex items-center gap-2 text-[0.55rem]">
                      <span className="w-9 text-paper/60">{t}</span>
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-paper/10">
                        <span className="block h-full rounded-full bg-accent" style={{ width: `${[78, 62, 90][i]}%` }} />
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="absolute bottom-4 left-4 rounded-xl bg-ink/85 px-3 py-2 backdrop-blur">
                <span className="block font-mono text-[0.6rem] uppercase tracking-[0.1em] text-paper/55">Neto a cobrar · en vivo</span>
                <span className="font-display text-lg font-bold tabular-nums">$ 8.861.000 ↗</span>
              </div>
            </div>
            <h3 className="mt-5 font-display text-2xl font-bold tracking-[-0.02em]">Reportes bien discriminados</h3>
            <p className="hz-muted mt-1.5 max-w-sm text-sm">Ventas por día y por tipo de entrada, ingreso en la puerta y neto a cobrar, en tiempo real.</p>
          </article>
        </div>
      </div>
    </section>
  );
}

/** "Te acompañamos, siempre." (referencia: te acompañamos siempre). */
export function Support() {
  return (
    <section className="hz relative overflow-hidden" aria-labelledby="acompanamos">
      <div className="mx-auto max-w-6xl px-4 py-20 text-center sm:px-6 sm:py-28">
        <h2 id="acompanamos" className="hz-title text-[clamp(2.4rem,6.5vw,4.2rem)]">
          Te acompañamos,
          <br />
          <span className="underline decoration-accent decoration-[3px] underline-offset-[10px]">siempre</span>.
        </h2>
        <Link href="/ayuda" className="mt-7 inline-flex h-10 items-center rounded-full bg-accent px-5 text-sm font-semibold text-white shadow-[4px_4px_0_rgb(244_239_230/0.9)] transition-transform hover:-translate-y-0.5">
          Ver la guía
        </Link>

        <div className="mt-14 grid gap-5 text-left md:grid-cols-3">
          {/* Capacitación */}
          <article className="hz-dashed flex flex-col p-6">
            <h3 className="hz-title text-[1.6rem]">
              Capacitación
              <br />
              personalizada
            </h3>
            <div className="relative mt-6 -rotate-2 rounded-xl bg-white p-4 text-ink shadow-[0_10px_24px_-14px_rgb(23_20_17/0.45)]">
              <span className="absolute -right-2 -top-3 rotate-6 rounded-md bg-accent px-2 py-0.5 text-[0.6rem] font-extrabold uppercase tracking-[0.1em] text-white">Próximamente</span>
              <p className="flex items-center gap-2 text-sm font-semibold">
                <span className="grid size-7 place-items-center rounded-md bg-ink text-paper">◷</span> Reunión de arranque
              </p>
              <p className="mt-2 text-xs text-muted">Vos + alguien de Lintick · 45 min</p>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              {['Primeros pasos', 'Crear evento', 'Cobros', 'Equipo de acceso'].map((t) => (
                <span key={t} className="rounded-full px-2.5 py-1 text-[0.7rem] font-semibold shadow-[inset_0_0_0_1px_rgb(23_20_17/0.2)]">
                  {t}
                </span>
              ))}
            </div>
            <p className="mt-auto border-t border-dashed border-ink/15 pt-4 text-sm text-muted">Muy pronto vas a poder coordinarla desde tu panel.</p>
          </article>

          {/* Soporte */}
          <article className="hz-dashed flex flex-col p-6">
            <h3 className="hz-title text-[1.6rem]">
              Respuestas
              <br />
              cuando las necesitás
            </h3>
            <div className="mt-6 space-y-2.5 text-[0.8rem]">
              <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-accent px-3 py-2 text-white">¿Puedo cobrar con Mercado Pago?</p>
              <p className="w-fit max-w-[85%] rounded-2xl rounded-bl-sm bg-ink/[0.06] px-3 py-2 text-ink">Sí: conectás tu cuenta y cada venta se acredita directo ✓</p>
              <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-accent px-3 py-2 text-white">¿Y si no hay señal en la puerta?</p>
              <p className="w-fit max-w-[85%] rounded-2xl rounded-bl-sm bg-ink/[0.06] px-3 py-2 text-ink">El escáner valida igual y sincroniza después ✓</p>
            </div>
            <a href="#preguntas" className="mt-auto flex items-center justify-between border-t border-dashed border-ink/15 pt-4 text-sm font-semibold">
              Ver preguntas frecuentes <span className="grid size-8 place-items-center rounded-lg bg-ink text-paper">→</span>
            </a>
          </article>

          {/* Guía */}
          <article className="hz-dashed flex flex-col p-6">
            <h3 className="hz-title text-[1.6rem]">
              El paso a paso
              <br />
              en nuestra guía
            </h3>
            <div className="mt-6 overflow-hidden rounded-xl bg-[#14110f] text-[0.72rem] text-paper shadow-[0_0_0_1px_rgb(244_239_230/0.12)]">
              <p className="border-b border-paper/10 px-3 py-1.5 font-mono text-[0.62rem] text-paper/45">lintick / ayuda</p>
              <div className="grid grid-cols-[5.5rem_1fr]">
                <ul className="space-y-1 border-r border-paper/10 p-2 text-paper/55">
                  <li className="rounded bg-paper px-1.5 py-0.5 font-semibold text-ink">Introducción</li>
                  <li className="px-1.5">Tu productora</li>
                  <li className="px-1.5">Tu evento</li>
                  <li className="px-1.5">Cobros</li>
                  <li className="px-1.5">La puerta</li>
                </ul>
                <div className="space-y-1.5 p-2.5">
                  <p className="font-semibold">Introducción</p>
                  {['Crear tu cuenta', 'Crear tu productora', 'Publicar tu evento', 'Conectar Mercado Pago'].map((t, i) => (
                    <p key={t} className={`flex items-center gap-1.5 ${i > 1 ? 'text-paper/45' : ''}`}>
                      <span className={`grid size-3 place-items-center rounded-sm text-[0.5rem] ${i < 2 ? 'bg-accent text-white' : 'shadow-[inset_0_0_0_1px_rgb(244_239_230/0.4)]'}`}>{i < 2 ? '✓' : ''}</span>
                      {t}
                    </p>
                  ))}
                </div>
              </div>
            </div>
            <Link href="/ayuda" className="mt-auto flex items-center justify-between border-t border-dashed border-ink/15 pt-4 text-sm font-semibold">
              Ir a la guía <span className="grid size-8 place-items-center rounded-lg bg-ink text-paper">→</span>
            </Link>
          </article>
        </div>
      </div>
    </section>
  );
}

const FAQ = [
  ['¿Cuándo cobro las ventas?', 'Al instante. Cada venta se acredita directo en tu cuenta de Mercado Pago, con la comisión de Lintick (10%) ya descontada. Lintick no retiene tu plata.'],
  ['¿Cuánto cuesta usar Lintick?', 'Crear tu cuenta y publicar eventos es gratis: no hay abono mensual. Sólo se descuenta un 10% de cada venta cobrada. Las cortesías y las entradas gratuitas no pagan comisión, y el comprador no paga cargos extra.'],
  ['¿Qué pasa con los reembolsos?', 'Cada productora define su política de devoluciones y la publica en las condiciones del evento. Los reembolsos se hacen sobre el pago original en Mercado Pago, y la entrada devuelta queda anulada: su QR deja de servir.'],
  ['¿Qué necesito para escanear entradas?', 'Sólo un celular con cámara y el navegador (Chrome o Safari). No hace falta instalar nada, y si se corta la señal el escáner sigue validando y sincroniza al volver la conexión.'],
  ['¿Puedo personalizar la página con mi marca?', 'Sí: cada evento lleva tu portada, galería, line-up, enlaces y condiciones. La página propia con tu marca y tu dominio (marca blanca) está en camino.'],
  ['¿Y si vendo afuera de Argentina?', 'Por ahora Lintick cobra en pesos argentinos con Mercado Pago Argentina. Otros países y monedas llegan más adelante.'],
] as const;

/** Preguntas frecuentes (referencia: preguntas frecuentes). */
export function Faq() {
  return (
    <section id="preguntas" className="hz hz-light scroll-mt-20" aria-labelledby="preguntas-t">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-6 sm:py-28 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <div>
          <p className="hz-eyebrow">Preguntas frecuentes</p>
          <h2 id="preguntas-t" className="hz-title mt-4 text-[clamp(2.6rem,6vw,4rem)]">
            Lo que
            <br />
            <span className="hz-ghost">siempre</span>
            <br />
            nos preguntan.
          </h2>
          <p className="hz-muted mt-5 text-sm">
            ¿No encontrás tu respuesta?{' '}
            <Link href="/ayuda" className="font-semibold text-ink underline underline-offset-4 hover:text-accent">
              Centro de ayuda →
            </Link>
          </p>
        </div>
        <div className="hz-faq hz-panel overflow-hidden rounded-2xl">
          {FAQ.map(([q, a], i) => (
            <details key={q} className={i > 0 ? 'hz-rule border-t' : ''}>
              <summary className="flex items-center justify-between gap-4 px-5 py-5 font-semibold sm:px-6">
                <span>
                  {q}
                  {i === 0 ? <Soon /> : null}
                </span>
                <span className="hz-plus hz-faint text-xl font-light" aria-hidden>
                  +
                </span>
              </summary>
              <p className="hz-muted px-5 pb-5 text-sm leading-relaxed sm:px-6">{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Banda final "Empezá a vender en 10 minutos." (referencia: final pie de página). */
export function FinalCta() {
  return (
    <section className="relative overflow-hidden bg-accent text-white" aria-labelledby="empezar">
      <p aria-hidden className="pointer-events-none absolute -bottom-[0.18em] left-[-0.04em] select-none whitespace-nowrap font-display text-[clamp(7rem,24vw,22rem)] font-extrabold leading-none tracking-[-0.06em] text-white/[0.09]">
        LINTICK.
      </p>
      <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 py-20 sm:px-6 sm:py-28 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <div>
          <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-white/80">Listos para empezar</p>
          <h2 id="empezar" className="hz-title mt-4 text-[clamp(3rem,9vw,6.4rem)]">
            Empezá a<br />
            vender
            <br />
            <span className="text-ink">en 10 minutos.</span>
          </h2>
          <p className="mt-6 max-w-md text-white/90">Creá tu cuenta. Conectá Mercado Pago. Publicá. Sin tarjeta, sin compromiso, sin sorpresas.</p>
        </div>
        <div className="w-full max-w-sm justify-self-center lg:justify-self-end">
          <Link href="/registrarse?next=/business" className="flex h-13 items-center justify-center gap-2 rounded-xl bg-paper py-3.5 font-semibold text-ink transition-transform hover:-translate-y-0.5">
            Crear cuenta gratis <span aria-hidden>→</span>
          </Link>
          <a href="#como-funciona" className="mt-3 flex items-center justify-center rounded-xl bg-white/10 py-3.5 font-semibold shadow-[inset_0_0_0_1px_rgb(255_255_255/0.3)] transition-colors hover:bg-white/15">
            Ver cómo funciona
          </a>
          <p className="mt-3 text-center text-xs text-white/80">Sin abono mensual · sólo 10% sobre cada venta cobrada</p>
        </div>
      </div>
    </section>
  );
}
