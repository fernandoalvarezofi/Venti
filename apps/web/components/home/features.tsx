function Window({ children, note }: { children: React.ReactNode; note: string }) {
  return (
    <div className="relative mx-auto w-full max-w-[25rem] pt-10">
      <span className="hand absolute left-1/2 top-0 w-max -translate-x-1/3">
        {note} <span aria-hidden>↓</span>
      </span>
      <div className="hz-window">
        <div className="hz-window-bar" aria-hidden />
        <div className="p-5 text-left">{children}</div>
      </div>
    </div>
  );
}

function Step({ n, title, body, bullets, soon, flip, children }: { n: string; title: React.ReactNode; body: string; bullets: string[]; soon?: string[]; flip?: boolean; children: React.ReactNode }) {
  return (
    <article className="grid items-center gap-12 border-t border-paper/10 py-16 sm:py-20 lg:grid-cols-2 lg:gap-16">
      <div className={flip ? 'lg:order-2' : ''}>
        <p className="hz-num" aria-hidden>
          {n}
        </p>
        <h3 className="hz-title mt-2 text-[clamp(1.9rem,4vw,2.7rem)]">{title}</h3>
        <p className="hz-muted mt-4 max-w-md leading-relaxed">{body}</p>
        <ul className="mt-6 space-y-2.5">
          {bullets.map((b) => (
            <li key={b} className="hz-check">
              {b}
            </li>
          ))}
          {soon?.map((b) => (
            <li key={b} className="flex items-center gap-2.5 text-sm text-paper/55">
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

const bar = (pct: number) => (
  <div className="mt-2 h-2 overflow-hidden rounded-full bg-paper/10">
    <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
  </div>
);

/** "Todo lo que necesitás para vender online." — pasos 01 a 06 (referencias: paso 1 a paso 6). */
export function FeatureSteps() {
  return (
    <section className="hz" aria-labelledby="vender-online">
      <div className="mx-auto max-w-6xl px-4 pb-16 pt-20 sm:px-6 sm:pt-28">
        <h2 id="vender-online" className="hz-title pb-14 text-[clamp(2.6rem,7vw,4.6rem)]">
          Todo lo que necesitás
          <br />
          <span className="hz-mark">para vender online.</span>
        </h2>

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
          <Window note="en minutos, sin programar">
            <div className="grid grid-cols-[7.5rem_1fr] gap-4">
              <div className="flex aspect-[3/4] flex-col justify-between overflow-hidden rounded-lg bg-[linear-gradient(160deg,#d23a1f,#5a1a10)] p-2.5 text-white">
                <span className="text-[0.55rem] font-bold uppercase tracking-[0.14em]">Fiestas · Sáb</span>
                <span className="font-display leading-none">
                  <span className="block text-4xl font-extrabold tracking-[-0.05em]">24</span>
                  <span className="text-sm font-bold">OCT</span>
                </span>
              </div>
              <div className="space-y-3">
                <div>
                  <p className="hz-label">Nombre del evento</p>
                  <p className="hz-field mt-1">Aniversario 35 años</p>
                </div>
                <div>
                  <p className="hz-label">Fecha</p>
                  <p className="hz-field mt-1">Sáb 24 oct · 23:59</p>
                </div>
              </div>
            </div>
            <div className="mt-4 divide-y divide-paper/10 border-t border-paper/10 text-sm">
              <p className="flex justify-between py-2.5">
                <span>General</span>
                <span className="font-semibold tabular-nums">$ 30.000</span>
              </p>
              <p className="flex justify-between py-2.5">
                <span>VIP</span>
                <span className="font-semibold tabular-nums">$ 45.000</span>
              </p>
            </div>
            <p className="hz-btn mt-3">Publicar</p>
          </Window>
        </Step>

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
          <Window note="tu precio, tu ritmo">
            <p className="hz-label">Etapas de precio · Campo</p>
            <div className="mt-3 divide-y divide-paper/10 text-sm">
              <p className="flex items-center justify-between gap-3 py-2.5">
                <span className="text-paper/50">Preventa 1</span>
                <span className="flex items-center gap-2">
                  <span className="tabular-nums text-paper/40 line-through decoration-accent decoration-2">$ 18.000</span>
                  <span className="rounded-full bg-paper/10 px-2 py-0.5 text-[0.65rem] font-bold">AGOTADA</span>
                </span>
              </p>
              <p className="flex items-center justify-between gap-3 py-2.5">
                <span className="font-semibold">Preventa 2</span>
                <span className="flex items-center gap-2">
                  <span className="font-semibold tabular-nums text-[#7fd49b]">$ 24.000</span>
                  <span className="rounded-full bg-[#1d6b3a]/40 px-2 py-0.5 text-[0.65rem] font-bold text-[#9be3b4]">quedan 42</span>
                </span>
              </p>
              <p className="flex items-center justify-between gap-3 py-2.5">
                <span className="flex items-center gap-2">
                  <span className="rounded-md bg-accent px-1.5 py-0.5 text-[0.6rem] font-bold text-white">DESPUÉS</span>
                  General
                </span>
                <span className="font-semibold tabular-nums">$ 30.000</span>
              </p>
            </div>
          </Window>
        </Step>

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
          <Window note="los datos que importan">
            <p className="font-semibold">Asistentes</p>
            <div className="mt-3 space-y-3">
              <div>
                <p className="hz-label">Nombre y apellido</p>
                <p className="hz-field mt-1">Lucía Pérez</p>
              </div>
              <div>
                <p className="hz-label">DNI (protegido)</p>
                <p className="hz-field mt-1 font-mono tracking-[0.2em]">•••••222</p>
              </div>
              <div>
                <p className="hz-label">Entrada</p>
                <div className="mt-1 flex gap-2">
                  {['Campo', 'Platea', 'VIP'].map((t, i) => (
                    <span key={t} className={`grid h-9 place-items-center rounded-lg px-3 text-xs font-bold ${i === 0 ? 'bg-paper text-ink' : 'shadow-[inset_0_0_0_1px_rgb(244_239_230/0.18)]'}`}>
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <p className="hz-btn mt-5">Descargar planilla (CSV)</p>
          </Window>
        </Step>

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
          <Window note="el ingreso, en vivo">
            <div className="flex items-center justify-between">
              <p className="font-semibold">Ingreso por puerta</p>
              <span className="size-2 rounded-full bg-[#4ade80] shadow-[0_0_0_4px_rgb(74_222_128/0.15)]" aria-hidden />
            </div>
            <ol className="mt-3 divide-y divide-paper/10">
              {[
                ['Puerta Norte', 412, 92, '+6'],
                ['Puerta Sur', 388, 86, '+4'],
                ['Acceso VIP', 96, 64, ''],
                ['Puerta Este', 51, 34, '+1'],
              ].map(([name, n, pct, plus], i) => (
                <li key={name as string} className="flex items-center gap-3 py-2.5">
                  <span className="w-4 font-display text-lg font-bold text-paper/40">{i + 1}</span>
                  <span className={`grid size-7 place-items-center rounded-full text-[0.65rem] font-bold ${i === 0 ? 'bg-accent text-white' : 'bg-paper/10'}`}>{(name as string).split(' ')[1]?.[0] ?? 'P'}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{name}</span>
                    {bar(pct as number)}
                  </span>
                  <span className="text-right text-xs">
                    {plus ? <span className="mr-1 font-bold text-[#7fd49b]">{plus}</span> : null}
                    <span className="font-bold tabular-nums">{n}</span> <span className="text-paper/45">ingresos</span>
                  </span>
                </li>
              ))}
            </ol>
          </Window>
        </Step>

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
          <Window note="cada sector con su precio">
            <svg viewBox="0 0 200 18" className="mx-auto w-3/4 text-paper/40" aria-hidden>
              <path d="M5 15 Q100 -3 195 15" fill="none" stroke="currentColor" strokeWidth="2" />
            </svg>
            <p className="-mt-1 text-center text-[0.6rem] font-bold tracking-[0.2em] text-paper/45">ESCENARIO</p>
            <div className="relative mt-3 grid grid-cols-[repeat(15,minmax(0,1fr))] gap-1">
              {Array.from({ length: 105 }, (_, i) => {
                const row = Math.floor(i / 15);
                const col = i % 15;
                if (col === 7) return <span key={i} aria-hidden />;
                const vip = row < 2;
                const sold = (i * 37) % 10 < (vip ? 7 : 4);
                const hl = i === 65;
                return (
                  <span
                    key={i}
                    className={`aspect-square rounded-[3px] ${hl ? 'bg-accent ring-2 ring-white' : sold ? (vip ? 'bg-[#f08a4b]/80' : 'bg-paper/30') : vip ? 'shadow-[inset_0_0_0_1px_rgb(240_138_75/0.8)]' : 'shadow-[inset_0_0_0_1px_rgb(244_239_230/0.3)]'}`}
                  />
                );
              })}
              <span className="absolute left-[38%] top-[44%] rounded-lg bg-paper px-2.5 py-1.5 text-[0.65rem] font-bold text-ink shadow-lg">
                Platea · $ 45.000
                <span className="block font-normal text-ink/60">quedan 18</span>
              </span>
            </div>
            <div className="mt-3 flex justify-center gap-4 text-[0.65rem] text-paper/60">
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm bg-[#f08a4b]/80" /> VIP
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm bg-paper/30" /> Vendidas
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm shadow-[inset_0_0_0_1px_rgb(244_239_230/0.4)]" /> Libres
              </span>
            </div>
          </Window>
        </Step>

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
          body="Cada tipo de entrada con su stock, sus ventas por día y lo que vas a cobrar ya calculado (con la comisión descontada). Sin planillas paralelas."
          bullets={['Stock independiente por tipo de entrada', 'Ventas por día, últimos 30 días', 'Neto a cobrar siempre a la vista']}
          soon={['Varias fechas o funciones en una sola página']}
        >
          <Window note="cada entrada, contada">
            {[
              ['Campo', 312, 400],
              ['Platea', 470, 600],
              ['VIP', 88, 120],
            ].map(([name, sold, cap]) => (
              <div key={name as string} className="border-b border-paper/10 py-3 last:border-0">
                <p className="flex justify-between text-sm">
                  <span className="font-semibold">{name}</span>
                  <span className="text-xs tabular-nums text-paper/55">
                    {sold} de {cap}
                  </span>
                </p>
                {bar(Math.round(((sold as number) / (cap as number)) * 100))}
              </div>
            ))}
          </Window>
        </Step>
      </div>
    </section>
  );
}
