/**
 * "Todo lo que necesitás para vender más": cada paso muestra una pantalla REAL del panel de Lintick
 * (mismos componentes visuales, con datos de ejemplo), en una ventana de navegador con su dirección.
 */

function Arrow({ flip = false }: { flip?: boolean }) {
  // Trazo a mano alzada, levemente irregular, con punta abierta.
  return (
    <svg viewBox="0 0 42 34" aria-hidden style={flip ? { transform: 'scaleX(-1)' } : undefined}>
      <path d="M3 4 C 14 3, 27 9, 33 24" />
      <path d="M26.5 20.5 L 33.4 25.2 L 36.2 17.4" />
    </svg>
  );
}

function Window({ url, children, note, noteSide = 'left' }: { url: React.ReactNode; children: React.ReactNode; note: string; noteSide?: 'left' | 'right' }) {
  return (
    <div className="relative mx-auto w-full max-w-[27rem] pt-12">
      <span className={`hand-note top-0 ${noteSide === 'left' ? 'left-2' : 'right-2 flex-row-reverse'}`}>
        <span className="hand">{note}</span>
        <Arrow flip={noteSide === 'right'} />
      </span>
      <div className="app-window rv" style={{ ['--d' as string]: '120ms' }}>
        <div className="app-chrome" aria-hidden>
          <span className="app-dots">
            <i />
            <i />
            <i />
          </span>
          <span className="app-url">
            <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
              <path d="M7 11V8a5 5 0 0 1 10 0v3M6 11h12v9H6z" />
            </svg>
            {url}
          </span>
        </div>
        <div className="app-body">{children}</div>
      </div>
    </div>
  );
}

function Step({ n, title, body, bullets, soon, flip, children }: { n: string; title: React.ReactNode; body: string; bullets: string[]; soon?: string[]; flip?: boolean; children: React.ReactNode }) {
  return (
    <article data-reveal className="hz-rule grid items-center gap-12 border-t py-16 sm:py-20 lg:grid-cols-2 lg:gap-16">
      <div className={flip ? 'lg:order-2' : ''}>
        <p className="hz-num rv" aria-hidden>
          {n}
        </p>
        <h3 className="hz-title rv mt-2 text-[clamp(1.9rem,4vw,2.7rem)]" style={{ ['--d' as string]: '60ms' }}>
          {title}
        </h3>
        <p className="hz-muted rv mt-4 max-w-md leading-relaxed" style={{ ['--d' as string]: '100ms' }}>
          {body}
        </p>
        <ul className="rv mt-6 space-y-2.5" style={{ ['--d' as string]: '140ms' }}>
          {bullets.map((b) => (
            <li key={b} className="hz-check">
              {b}
            </li>
          ))}
          {soon?.map((b) => (
            <li key={b} className="hz-faint flex items-center gap-2.5 text-sm">
              <span className="hz-soon">Próximamente</span>
              {b}
            </li>
          ))}
        </ul>
      </div>
      <div className={flip ? 'lg:order-1' : ''}>{children}</div>
    </article>
  );
}

const Url = ({ path }: { path: string }) => (
  <>
    <b>lintick.com.ar</b>
    {path}
  </>
);

export function FeatureSteps() {
  return (
    <section className="hz hz-light" aria-labelledby="vender-online">
      <div className="mx-auto max-w-6xl px-4 pb-16 pt-20 sm:px-6 sm:pt-28">
        <p className="hz-eyebrow">El panel de Lintick</p>
        <h2 id="vender-online" className="hz-title mt-4 text-[clamp(2.6rem,7vw,4.6rem)]">
          Todo lo que necesitás
          <br />
          <span className="hz-mark">para vender más.</span>
        </h2>
        <p className="hz-muted mt-5 max-w-xl">Una vez publicado tu evento, estas son las herramientas para hacerlo crecer y tenerlo bajo control: desde la preventa hasta la última persona que entra.</p>
        <p className="mt-2 pb-14 text-xs text-muted">Pantallas reales del panel, con datos de ejemplo.</p>

        {/* 01 — Crear evento (asistente real: pasos, campos, entradas, Publicar) */}
        <Step
          n="01"
          title={
            <>
              Creá tu página de
              <br />
              evento en minutos
            </>
          }
          body="Armá tu página de venta con toda la info: descripción, horarios, lugar con mapa, portada, galería, line-up y tipos de entrada. Sin saber programar."
          bullets={['Portada, galería y line-up sin código', 'Varios tipos de entrada y precios', 'Cobro directo con Mercado Pago']}
        >
          <Window url={<Url path="/business/eventos/nuevo" />} note="en minutos, sin programar">
            <ol className="mb-4 flex items-center gap-2 text-[0.68rem] font-semibold">
              {['Datos', 'Lugar', 'Entradas'].map((s, i) => (
                <li key={s} className={`flex items-center gap-1.5 ${i < 2 ? 'text-ink' : 'text-muted'}`}>
                  <span className={`grid size-5 place-items-center rounded-full text-[0.6rem] ${i < 2 ? 'bg-ink text-paper' : 'shadow-[inset_0_0_0_1px_rgb(23_20_17/0.25)]'}`}>{i < 2 ? '✓' : 3}</span>
                  {s}
                  {i < 2 ? <span className="mx-1 h-px w-5 bg-ink/20" aria-hidden /> : null}
                </li>
              ))}
            </ol>
            <div className="grid grid-cols-[6.5rem_1fr] gap-3">
              <div className="flex aspect-[3/4] flex-col justify-between rounded-[10px] bg-[#c4553a] p-2 text-[#fff7ef]">
                <span className="flex justify-between text-[0.5rem] font-bold uppercase tracking-[0.12em]">
                  <span>Fiestas</span>
                  <span>Sáb</span>
                </span>
                <span className="font-display leading-none">
                  <span className="block text-[2.1rem] font-extrabold tracking-[-0.05em]">24</span>
                  <span className="text-xs font-bold">OCT</span>
                </span>
              </div>
              <div className="space-y-2.5">
                <div>
                  <p className="app-label">Nombre del evento</p>
                  <p className="app-field">Aniversario 35 años</p>
                </div>
                <div>
                  <p className="app-label">Empieza</p>
                  <p className="app-field tabular-nums">24/10/2026 · 23:59</p>
                </div>
              </div>
            </div>
            <div className="mt-3 rounded-[10px] bg-surface p-2.5 shadow-[inset_0_0_0_1px_rgb(23_20_17/0.08)]">
              {[
                ['General', '400 lugares', '$ 30.000'],
                ['VIP', '80 lugares', '$ 45.000'],
              ].map(([t, c, p], i) => (
                <p key={t} className={`flex items-baseline justify-between py-1.5 ${i ? 'border-t border-ink/[0.07]' : ''}`}>
                  <span>
                    <span className="font-semibold">{t}</span> <span className="text-[0.68rem] text-muted">· {c}</span>
                  </span>
                  <span className="font-semibold tabular-nums">{p}</span>
                </p>
              ))}
            </div>
            <div className="mt-3 flex justify-end">
              <span className="btn-admit !min-h-[2.4rem] !text-[0.7rem]">Publicar ahora</span>
            </div>
          </Window>
        </Step>

        {/* 02 — Etapas de precio (tarjeta real de tipo de entrada) */}
        <Step
          flip
          n="02"
          title={
            <>
              Impulsá las ventas
              <br />
              con etapas de precio
            </>
          }
          body="Preventas que pasan solas a la etapa siguiente por fecha o por cantidad vendida, y cortesías que descuentan stock real. Todo desde el panel, sin depender de nadie."
          bullets={['Etapas automáticas por fecha o cantidad', 'Cortesías con stock real', 'Sin sobreventa: el stock se cuida solo']}
          soon={['Códigos de descuento y combos']}
        >
          <Window url={<Url path="/business/eventos/aniversario?tab=entradas" />} note="tu precio, tu ritmo" noteSide="right">
            <div className="flex items-baseline justify-between">
              <p className="text-sm font-bold">Campo</p>
              <p className="text-[0.68rem] text-muted tabular-nums">318 vendidas de 400</p>
            </div>
            <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-ink/[0.07]">
              <span className="bg-ink" style={{ width: '79.5%' }} />
              <span className="bg-ink/30" style={{ width: '3%' }} />
            </div>
            <table className="mt-3 w-full text-left text-[0.75rem]">
              <thead className="text-[0.6rem] uppercase tracking-[0.08em] text-muted">
                <tr className="border-b border-ink/10">
                  <th className="py-1.5 font-semibold">Etapa</th>
                  <th className="py-1.5 font-semibold">Precio</th>
                  <th className="py-1.5 text-right font-semibold">Vendidas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/[0.07]">
                <tr>
                  <td className="py-2">
                    Preventa 1 <span className="app-chip ml-1 bg-ink/[0.07] text-muted">Agotada</span>
                  </td>
                  <td className="py-2 tabular-nums text-muted line-through decoration-ink/30">$ 18.000</td>
                  <td className="py-2 text-right tabular-nums text-muted">150/150</td>
                </tr>
                <tr>
                  <td className="py-2 font-semibold">
                    Preventa 2 <span className="app-chip ml-1 bg-success/10 text-success">Vigente</span>
                  </td>
                  <td className="py-2 font-semibold tabular-nums">$ 24.000</td>
                  <td className="py-2 text-right tabular-nums">168/210</td>
                </tr>
                <tr>
                  <td className="py-2">
                    General <span className="app-chip ml-1 bg-ink/[0.05] text-ink-soft">Desde el 01/10</span>
                  </td>
                  <td className="py-2 tabular-nums">$ 30.000</td>
                  <td className="py-2 text-right tabular-nums text-muted">—</td>
                </tr>
              </tbody>
            </table>
          </Window>
        </Step>

        {/* 03 — Asistentes (tabla real + planilla) */}
        <Step
          n="03"
          title={
            <>
              Los datos de tus
              <br />
              asistentes, en orden
            </>
          }
          body="Cada entrada tiene titular con nombre y email. El DNI se guarda protegido: en la puerta sólo se ven los últimos 3 números. Y bajás la planilla completa en un clic."
          bullets={['Titular por entrada', 'DNI protegido (sólo los últimos 3)', 'Planilla para Excel en un clic']}
          soon={['Preguntas personalizadas en la compra']}
        >
          <Window url={<Url path="/business/eventos/aniversario?tab=asistentes" />} note="los datos que importan">
            <div className="flex items-center gap-2">
              <span className="app-field flex-1 text-muted">Nombre, email o DNI completo</span>
              <span className="btn btn-ink h-[34px] px-3 text-[0.68rem]">Descargar planilla</span>
            </div>
            <table className="mt-3 w-full text-left text-[0.72rem]">
              <thead className="text-[0.58rem] uppercase tracking-[0.08em] text-muted">
                <tr className="border-b border-ink/10">
                  <th className="py-1.5 font-semibold">Titular</th>
                  <th className="py-1.5 font-semibold">Entrada</th>
                  <th className="py-1.5 font-semibold">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/[0.07]">
                {[
                  ['Lucía Pérez', '222', 'l•••@gmail.com', 'Campo', 'Ingresó', '22:41'],
                  ['Tomás Ruiz', '518', 't•••@hotmail.com', 'VIP', 'Vigente', ''],
                  ['Camila Sosa', '073', 'c•••@gmail.com', 'Campo', 'Vigente', ''],
                ].map(([n, d, e, t, s, h]) => (
                  <tr key={n}>
                    <td className="py-2">
                      <span className="font-medium">{n}</span> <span className="font-mono text-[0.6rem] text-muted">DNI •••{d}</span>
                      <span className="block text-[0.62rem] text-muted">{e}</span>
                    </td>
                    <td className="py-2">{t}</td>
                    <td className="py-2">
                      {s}
                      {h ? <span className="block text-[0.6rem] text-muted">{h} h</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Window>
        </Step>

        {/* 04 — Control de ingreso (pantalla real de Lintick Access: oscura, para la noche) */}
        <Step
          flip
          n="04"
          title={
            <>
              Controlá el ingreso
              <br />
              en vivo
            </>
          }
          body="Mirá cuánta gente entró, por qué puerta y a qué hora, mientras pasa. Tu equipo de acceso escanea sólo dentro de su turno y en tu evento."
          bullets={['Contador de ingresos en vivo', 'Puerta y hora de cada ingreso', 'Personal con turnos por evento']}
        >
          <Window url={<Url path="/acceso/aniversario" />} note="el ingreso, en vivo" noteSide="right">
            <div className="-m-4 bg-ink p-4 text-paper">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold leading-tight">Aniversario 35 años</p>
                  <p className="text-[0.62rem] text-paper/55">Club Paraguay · Puerta Norte</p>
                </div>
                <div className="text-right leading-none">
                  <p className="font-display text-2xl font-extrabold tabular-nums">412</p>
                  <p className="mt-1 text-[0.58rem] text-paper/55">de 478 ingresaron</p>
                </div>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-paper/10">
                <div className="h-full rounded-full bg-success" style={{ width: '86%' }} />
              </div>
              <ul className="mt-3 space-y-1 text-[0.7rem]">
                {[
                  ['Lucía Pérez', 'Campo', '22:41', 'Norte'],
                  ['Martín Gómez', 'VIP', '22:40', 'VIP'],
                  ['Sofía Díaz', 'Campo', '22:40', 'Norte'],
                  ['Joaquín Ríos', 'Campo', '22:39', 'Sur'],
                ].map(([n, t, h, g]) => (
                  <li key={n} className="flex justify-between gap-3 rounded-lg bg-paper/5 px-2.5 py-1.5">
                    <span className="truncate">
                      <span className="font-semibold">{n}</span> <span className="text-paper/50">· {t}</span>
                    </span>
                    <span className="shrink-0 tabular-nums text-paper/60">
                      {h} · {g}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </Window>
        </Step>

        {/* 05 — Sectores (desglose real "Por tipo de entrada") */}
        <Step
          n="05"
          title={
            <>
              Sectores, capacidad
              <br />y precio por zona
            </>
          }
          body="Armá campo, platea, VIP o los sectores que tenga tu lugar, cada uno con su capacidad y su precio. El stock se descuenta en tiempo real y nunca se vende de más."
          bullets={['Sectores con capacidad y precio propios', 'Ocupación por sector en tiempo real', 'Cero sobreventa, aunque compren miles a la vez']}
          soon={['Butacas numeradas: cada uno elige su lugar']}
        >
          <Window url={<Url path="/business/eventos/aniversario" />} note="cada sector con su precio">
            <p className="text-sm font-bold">Por tipo de entrada</p>
            <table className="mt-2 w-full text-left text-[0.72rem]">
              <thead className="text-[0.58rem] uppercase tracking-[0.08em] text-muted">
                <tr className="border-b border-ink/10">
                  <th className="py-1.5 font-semibold">Tipo</th>
                  <th className="py-1.5 font-semibold">Ocupación</th>
                  <th className="py-1.5 text-right font-semibold">Recaudado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/[0.07]">
                {[
                  ['Campo', 318, 400, '$ 7.236.000'],
                  ['Platea alta', 211, 260, '$ 6.330.000'],
                  ['VIP', 61, 80, '$ 2.745.000'],
                ].map(([t, s, c, g]) => (
                  <tr key={t as string}>
                    <td className="py-2.5 font-medium">{t}</td>
                    <td className="py-2.5 pr-3">
                      <span className="block h-1.5 overflow-hidden rounded-full bg-ink/[0.07]">
                        <span className="block h-full rounded-full bg-ink" style={{ width: `${Math.round(((s as number) / (c as number)) * 100)}%` }} />
                      </span>
                      <span className="mt-1 block text-[0.6rem] tabular-nums text-muted">
                        {s}/{c} · {Math.round(((s as number) / (c as number)) * 100)}%
                      </span>
                    </td>
                    <td className="py-2.5 text-right tabular-nums">{g}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Window>
        </Step>

        {/* 06 — Resumen (tarjetas y gráfico real de ventas por día) */}
        <Step
          flip
          n="06"
          title={
            <>
              Stock y ventas,
              <br />
              en tiempo real
            </>
          }
          body="Cada tipo de entrada con su stock, sus ventas por día y lo que vas a cobrar ya calculado (el precio completo de cada entrada). Sin planillas paralelas."
          bullets={['Stock independiente por tipo de entrada', 'Ventas por día, últimos 30 días', 'Neto a cobrar siempre a la vista']}
          soon={['Varias fechas o funciones en una sola página']}
        >
          <Window url={<Url path="/business/eventos/aniversario" />} note="cada entrada, contada" noteSide="right">
            <div className="grid grid-cols-3 gap-2">
              {[
                ['Emitidas', '590', 'de 740'],
                ['Disponibles', '150', '7 en reserva'],
                ['Neto a cobrar', '$ 14,7 M', 'bruto $ 16,3 M'],
              ].map(([k, v, h]) => (
                <div key={k} className="rounded-[10px] bg-surface p-2.5 shadow-[inset_0_0_0_1px_rgb(23_20_17/0.06)]">
                  <p className="text-[0.6rem] text-muted">{k}</p>
                  <p className="font-display text-lg font-extrabold tabular-nums leading-tight tracking-[-0.03em]">{v}</p>
                  <p className="text-[0.56rem] text-muted">{h}</p>
                </div>
              ))}
            </div>
            <p className="mt-3 flex items-center gap-3 text-[0.62rem] text-muted">
              <span className="flex items-center gap-1">
                <span className="size-2 rounded-sm bg-[#d23a1f]" /> Vendidas
              </span>
              <span className="flex items-center gap-1">
                <span className="size-2 rounded-sm bg-[#2f6db5]" /> Cortesías
              </span>
            </p>
            <div className="demo-bars mt-1.5 flex h-20 items-end gap-[3px]" aria-hidden>
              {[6, 9, 4, 12, 15, 8, 11, 17, 14, 22, 19, 9, 25, 28, 21, 30, 24, 33, 38, 29].map((v, i) => (
                <span key={i} className="flex flex-1 flex-col-reverse gap-[2px]">
                  <span className="demo-bar rounded-t-[3px] bg-[#d23a1f]" style={{ height: `${v * 2}px`, ['--i' as string]: i }} />
                  {i % 6 === 3 ? <span className="demo-bar rounded-t-[3px] bg-[#2f6db5]" style={{ height: '6px', ['--i' as string]: i }} /> : null}
                </span>
              ))}
            </div>
          </Window>
        </Step>
      </div>
    </section>
  );
}
