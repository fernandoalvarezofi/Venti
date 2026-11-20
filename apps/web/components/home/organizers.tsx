import Link from 'next/link';
import { PAYMENTS_LIVE } from '@/lib/config';
import { BrandedQr } from './branded-qr';
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

/** "Infaltables para tu evento" (referencia: infaltables): entrada con QR real de la marca + panel de reportes. */
export function Essentials() {
  return (
    <section className="hz hz-light" aria-labelledby="infaltables">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <p className="hz-eyebrow">Para el día del evento</p>
        <h2 id="infaltables" className="hz-title mt-4 text-[clamp(2.6rem,7vw,4.6rem)]">
          Infaltables para
          <br />
          <span className="hz-ghost">tu evento.</span>
        </h2>
        <div className="mt-12 grid gap-6 lg:grid-cols-2">
          {/* 1. Entrada con QR de Lintick + escáner sin internet */}
          <article className="ess-card flex flex-col">
            <div className="ess-stage">
              <span className="ess-num">1</span>
              <div className="ess-pass">
                <div className="flex items-center justify-between px-5 pt-4">
                  <span className="font-display text-lg font-extrabold tracking-[-0.04em]">
                    Lintick<span className="text-accent">.</span>
                  </span>
                  <span className="rounded-full bg-ink px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-[0.12em] text-paper">Campo</span>
                </div>
                <div className="px-5 pb-1 pt-2">
                  <p className="font-display text-[1.05rem] font-bold leading-tight">Noche de Otoño</p>
                  <p className="text-[0.7rem] text-muted">Sáb 14/03 · 22:00 · Sala Norte</p>
                </div>
                <div className="cut my-2" aria-hidden>
                  <span className="opacity-60" />
                </div>
                <div className="relative mx-auto mb-3 mt-1 w-[68%]">
                  <BrandedQr value="https://venti-web-eta.vercel.app" className="block h-auto w-full" />
                  {/* Visor del escáner sobre el QR */}
                  <span className="ess-viewfinder" aria-hidden>
                    <span className="ess-scanline" />
                  </span>
                </div>
                <div className="flex items-center justify-between px-5 pb-4 text-[0.68rem]">
                  <span>
                    <span className="block text-[0.55rem] font-bold uppercase tracking-[0.14em] text-muted">Entrada Nº</span>
                    <span className="font-mono text-sm font-bold">9F3A-2C1E</span>
                  </span>
                  <span className="text-right">
                    <span className="block text-[0.55rem] font-bold uppercase tracking-[0.14em] text-muted">Titular</span>
                    <span className="font-semibold">Ana P. · DNI •••123</span>
                  </span>
                </div>
              </div>
              <div className="ess-toast">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[#16a34a] text-xs font-bold text-white">✓</span>
                <span>
                  <span className="block text-sm font-semibold">Entrada validada</span>
                  <span className="font-mono text-[0.62rem] text-paper/60">SIN SEÑAL · PUERTA NORTE · 22:41</span>
                </span>
              </div>
            </div>
            <div className="px-6 pb-6 pt-5">
              <h3 className="font-display text-2xl font-bold tracking-[-0.02em]">Escáner QR sin internet</h3>
              <p className="mt-1.5 max-w-md text-sm text-paper/65">
                Cada entrada lleva un QR firmado e imposible de falsificar. En la puerta se valida desde cualquier celular, incluso sin señal, y cada QR entra una sola vez.
              </p>
            </div>
          </article>

          {/* 2. Reportes en vivo */}
          <article className="ess-card flex flex-col">
            <div className="ess-stage">
              <span className="ess-num">2</span>
              <div className="ess-dash">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-paper/70">Noche de Otoño · en vivo</p>
                  <span className="flex items-center gap-1.5 text-[0.62rem] font-semibold text-[#7fd49b]">
                    <span className="size-1.5 rounded-full bg-[#4ade80]" /> Actualizado
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {[
                    ['Emitidas', '1.240', '+38 hoy'],
                    ['Ingresaron', '1.198', '97%'],
                    ['Neto', '$ 8,86 M', 'a cobrar'],
                  ].map(([k, v, h]) => (
                    <div key={k} className="rounded-xl bg-paper/[0.06] p-2.5">
                      <p className="text-[0.58rem] font-semibold uppercase tracking-[0.1em] text-paper/50">{k}</p>
                      <p className="mt-0.5 font-display text-lg font-extrabold tabular-nums leading-none">{v}</p>
                      <p className="mt-1 text-[0.58rem] text-paper/50">{h}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-3 rounded-xl bg-paper/[0.04] p-3">
                  <p className="text-[0.6rem] font-semibold uppercase tracking-[0.1em] text-paper/50">Ventas por día</p>
                  <svg viewBox="0 0 300 90" className="mt-2 h-auto w-full" aria-hidden>
                    <defs>
                      <linearGradient id="ess-area" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0" stopColor="#f8942a" stopOpacity="0.45" />
                        <stop offset="1" stopColor="#f8942a" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    {[22, 45, 68].map((y) => (
                      <line key={y} x1="0" x2="300" y1={y} y2={y} stroke="rgb(244 239 230 / 0.08)" />
                    ))}
                    <path d="M0 80 C 30 76, 45 70, 60 66 S 100 58, 120 50 S 160 54, 180 40 S 220 30, 240 22 S 280 12, 300 8 L 300 90 L 0 90 Z" fill="url(#ess-area)" />
                    <path className="ess-line" d="M0 80 C 30 76, 45 70, 60 66 S 100 58, 120 50 S 160 54, 180 40 S 220 30, 240 22 S 280 12, 300 8" fill="none" stroke="#f8942a" strokeWidth="2.5" strokeLinecap="round" />
                    <circle cx="300" cy="8" r="4" fill="#f8942a" className="ess-dot" />
                  </svg>
                </div>
                <div className="mt-3 space-y-2">
                  {[
                    ['Campo', 312, 400],
                    ['Platea', 470, 600],
                    ['VIP', 88, 120],
                  ].map(([t, a, b]) => (
                    <div key={t as string} className="flex items-center gap-3 text-[0.7rem]">
                      <span className="w-12 text-paper/65">{t}</span>
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-paper/10">
                        <span className="ess-bar block h-full rounded-full bg-accent" style={{ width: `${Math.round(((a as number) / (b as number)) * 100)}%` }} />
                      </span>
                      <span className="w-14 text-right tabular-nums text-paper/55">
                        {a}/{b}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="ess-toast ess-toast-right">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-accent text-xs font-bold text-white">↗</span>
                <span>
                  <span className="block font-mono text-[0.58rem] uppercase tracking-[0.12em] text-paper/55">Neto a cobrar · en vivo</span>
                  <span className="font-display text-base font-bold tabular-nums">$ 8.861.000</span>
                </span>
              </div>
            </div>
            <div className="px-6 pb-6 pt-5">
              <h3 className="font-display text-2xl font-bold tracking-[-0.02em]">Reportes bien discriminados</h3>
              <p className="mt-1.5 max-w-md text-sm text-paper/65">Ventas por día y por tipo de entrada, ingreso en la puerta y neto a cobrar con la comisión descontada. En tiempo real y con planilla para Excel.</p>
            </div>
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
