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
          Lintick no retiene ni intermedia tus fondos: <strong className="text-paper">cada venta se acredita directo en tu cuenta de Mercado Pago</strong>, por el precio completo de la entrada. Nuestro cargo lo paga el comprador.
        </p>

        <div className="payout-box relative mx-auto mt-14 max-w-4xl p-6 text-left sm:p-10">
          <PayoutFlow />
          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 border-t border-ink/10 pt-6 text-sm text-muted">
            <span>Cobrás con</span>
            <span className="rounded-full bg-[#009ee3] px-3 py-1 font-semibold text-white">Mercado Pago</span>
            <span className="text-xs">Ejemplo: entrada de $ 120.000 → el comprador paga $ 142.872,61 (incluye la comisión de Lintick y la de Mercado Pago) y a vos te llegan $ 120.000 limpios. Montos ilustrativos.</span>
          </div>
        </div>
      </div>
    </section>
  );
}

function StatusBar({ dark = false }: { dark?: boolean }) {
  return (
    <div className={`device-status ${dark ? "text-white" : "text-ink"}`} aria-hidden>
      <span>22:41</span>
      <span className="flex items-center gap-1">
        <svg viewBox="0 0 18 12" width="15" height="10" fill="currentColor">
          <rect x="0" y="8" width="3" height="4" rx="0.8" />
          <rect x="5" y="5.5" width="3" height="6.5" rx="0.8" />
          <rect x="10" y="3" width="3" height="9" rx="0.8" opacity="0.35" />
          <rect x="15" y="0" width="3" height="12" rx="0.8" opacity="0.35" />
        </svg>
        <svg viewBox="0 0 26 12" width="22" height="10" fill="none" stroke="currentColor">
          <rect x="0.5" y="0.5" width="22" height="11" rx="3" opacity="0.5" />
          <rect x="2" y="2" width="15" height="8" rx="1.6" fill="currentColor" stroke="none" />
          <path d="M24.5 4v4" strokeWidth="1.6" strokeLinecap="round" opacity="0.5" />
        </svg>
      </span>
    </div>
  );
}

/** "Infaltables para tu evento": demostración real (entrada del comprador → escáner de la puerta) + resumen del panel. */
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
        <p className="mt-3 text-xs text-muted">Pantallas reales de Lintick, con datos de ejemplo.</p>
        <div className="mt-10 grid gap-6 lg:grid-cols-[1.15fr_1fr]">
          {/* 1. La entrada del comprador y el escáner de la puerta */}
          <article className="ess-card flex flex-col" data-reveal>
            <div className="ess-stage">
              <div className="flex items-end justify-center gap-4 sm:gap-7">
                {/* Celular del comprador: su entrada en "Mis entradas" */}
                <div className="device rv w-[44%] max-w-[12.5rem]" style={{ ['--d' as string]: '0ms' }}>
                  <div className="device-screen bg-paper text-ink">
                    <StatusBar />
                    <p className="px-3 pt-1 font-display text-[0.95rem] font-extrabold tracking-[-0.03em]">Mis entradas</p>
                    <div className="mx-2.5 mt-2 rounded-xl bg-surface p-2.5 shadow-[0_0_0_1px_rgb(23_20_17/0.07)]">
                      <div className="flex items-center gap-1.5">
                        <span className="app-chip bg-success/10 !text-[0.52rem] text-success">Vigente</span>
                        <span className="text-[0.5rem] font-semibold uppercase tracking-[0.12em] text-muted">Campo</span>
                      </div>
                      <p className="mt-1.5 text-[0.8rem] font-bold leading-tight">Noche de Otoño</p>
                      <p className="text-[0.58rem] text-muted">Sáb 14/03 · 22:00 · Sala Norte</p>
                      <div className="relative mx-auto mt-2 w-[86%]">
                        <BrandedQr value="https://lintick.com" className="block h-auto w-full" />
                      </div>
                      <p className="mt-1.5 text-center">
                        <span className="block text-[0.45rem] font-semibold uppercase tracking-[0.16em] text-muted">Entrada Nº</span>
                        <span className="font-mono text-[0.72rem] font-bold tracking-[0.08em]">9F3A-2C1E</span>
                      </p>
                    </div>
                  </div>
                </div>

                {/* Celular de la puerta: Lintick Access */}
                <div className="device device-dark rv w-[44%] max-w-[12.5rem] translate-y-3" style={{ ['--d' as string]: '140ms' }}>
                  <div className="device-screen bg-[#0b0a09]">
                    <StatusBar dark />
                    <div className="access-view">
                      <div className="flex items-center justify-between px-3 pt-1 text-white">
                        <span className="text-[0.62rem] font-bold">Noche de Otoño</span>
                        <span className="text-right leading-none">
                          <span className="block font-display text-sm font-extrabold tabular-nums">412</span>
                          <span className="text-[0.42rem] text-white/55">de 478</span>
                        </span>
                      </div>
                      <div className="access-cam">
                        <span className="access-frame">
                          <span className="access-line" />
                        </span>
                      </div>
                      <p className="pb-3 text-center text-[0.55rem] text-white/55">Puerta Norte · sin señal</p>
                    </div>
                    {/* Resultado (igual al de la app): entra después del barrido */}
                    <div className="access-ok">
                      <span className="grid size-10 place-items-center rounded-full bg-white/20 text-xl font-bold">✓</span>
                      <span className="mt-2 font-display text-[1.35rem] font-extrabold uppercase tracking-[-0.02em]">Adelante</span>
                      <span className="mt-1 text-[0.55rem] opacity-90">Ingreso habilitado (validado sin señal).</span>
                      <span className="mt-3 w-[84%] rounded-lg bg-black/15 px-2.5 py-2 text-left">
                        <span className="block text-[0.72rem] font-bold leading-tight">Ana Pérez</span>
                        <span className="block text-[0.55rem] opacity-90">Campo</span>
                        <span className="mt-1 block whitespace-nowrap font-mono text-[0.48rem] opacity-90">Nº 9F3A-2C1E</span>
                        <span className="block whitespace-nowrap font-mono text-[0.48rem] opacity-90">DNI terminado en 123</span>
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="px-6 pb-6 pt-5">
              <h3 className="font-display text-2xl font-bold tracking-[-0.02em]">Escáner QR sin internet</h3>
              <p className="mt-1.5 max-w-md text-sm text-paper/65">
                Cada entrada lleva un QR firmado e imposible de falsificar. En la puerta se valida desde cualquier celular, incluso sin señal, y cada QR entra una sola vez.
              </p>
            </div>
          </article>

          {/* 2. Resumen del panel */}
          <article className="ess-card flex flex-col" data-reveal>
            <div className="ess-stage">
              <div className="app-window rv w-full max-w-[24rem]" style={{ ['--d' as string]: '80ms' }}>
                <div className="app-chrome" aria-hidden>
                  <span className="app-dots">
                    <i />
                    <i />
                    <i />
                  </span>
                  <span className="app-url">
                    <b>lintick.com.ar</b>/business/eventos/noche-de-otono
                  </span>
                </div>
                <div className="app-body">
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      ['Emitidas', '1.237', 'de 1.400 · 46 cortesías'],
                      ['Ingresaron', '1.186', '96% de las emitidas'],
                      ['Disponibles', '163', '9 en reserva ahora'],
                      ['Neto a cobrar', '$ 25,6 M', 'bruto $ 28,4 M'],
                    ].map(([k, v, h]) => (
                      <div key={k} className="rounded-[10px] bg-surface p-2.5 shadow-[inset_0_0_0_1px_rgb(23_20_17/0.06)]">
                        <p className="text-[0.6rem] text-muted">{k}</p>
                        <p className="font-display text-lg font-extrabold tabular-nums leading-tight tracking-[-0.03em]">{v}</p>
                        <p className="text-[0.55rem] text-muted">{h}</p>
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 text-[0.62rem] font-semibold text-ink">Ventas por día</p>
                  <div className="demo-bars mt-1.5 flex h-16 items-end gap-[3px]" aria-hidden>
                    {[4, 7, 5, 9, 12, 8, 14, 11, 16, 13, 19, 22, 17, 24, 27, 21, 26, 31, 29, 34].map((v, i) => (
                      <span key={i} className="demo-bar flex-1 rounded-t-[3px] bg-[#d23a1f]" style={{ height: `${v * 1.7}px`, ['--i' as string]: i }} />
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="px-6 pb-6 pt-5">
              <h3 className="font-display text-2xl font-bold tracking-[-0.02em]">Reportes bien discriminados</h3>
              <p className="mt-1.5 max-w-md text-sm text-paper/65">Ventas por día y por tipo de entrada, ingreso en la puerta y lo que vas a cobrar por tus ventas. En tiempo real y con planilla para Excel.</p>
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
  ['¿Cuándo cobro las ventas?', 'Al instante. Cada venta se acredita directo en tu cuenta de Mercado Pago, por el precio completo de la entrada. Lintick no retiene tu plata.'],
  ['¿Cuánto cuesta usar Lintick?', 'Para la productora, nada: crear tu cuenta y publicar eventos es gratis, sin abono mensual, y recibís el precio completo de cada entrada, limpio. El comprador paga un cargo por servicio (la comisión de Lintick del 10% más el costo de Mercado Pago), que ve antes de pagar. Las cortesías y las entradas gratuitas no tienen cargo.'],
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
          <p className="mt-3 text-center text-xs text-white/80">Sin abono mensual · recibís el precio completo de cada entrada</p>
        </div>
      </div>
    </section>
  );
}
