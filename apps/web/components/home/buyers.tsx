/** QR ilustrativo (patrón fijo): es un dibujo para la maqueta, no una entrada. */
function DemoQr() {
  const cells: [number, number][] = [];
  let seed = 7;
  for (let y = 0; y < 21; y++)
    for (let x = 0; x < 21; x++) {
      const finder = (x < 7 && y < 7) || (x > 13 && y < 7) || (x < 7 && y > 13);
      if (finder) continue;
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      if (seed % 100 < 46) cells.push([x, y]);
    }
  const finder = (x: number, y: number) => (
    <g key={`${x}-${y}`}>
      <rect x={x} y={y} width="7" height="7" fill="#171411" />
      <rect x={x + 1} y={y + 1} width="5" height="5" fill="#fff" />
      <rect x={x + 2} y={y + 2} width="3" height="3" fill="#171411" />
    </g>
  );
  return (
    <svg viewBox="-1 -1 23 23" className="size-full" aria-hidden>
      <rect x="-1" y="-1" width="23" height="23" fill="#fff" />
      {finder(0, 0)}
      {finder(14, 0)}
      {finder(0, 14)}
      {cells.map(([x, y]) => (
        <rect key={`${x}.${y}`} x={x} y={y} width="1" height="1" fill="#171411" />
      ))}
    </svg>
  );
}

const FEATURES = [
  {
    icon: <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />,
    title: 'Entrada al instante',
    body: 'Apenas Mercado Pago confirma el pago, tu entrada con QR aparece en “Mis entradas”.',
  },
  {
    icon: <path d="M6 10V8a6 6 0 1 1 12 0v2M5 10h14v11H5V10Zm7 4v3" />,
    title: 'QR firmado y único',
    body: 'Firma digital imposible de falsificar. Si alguien copió tu QR, generás uno nuevo y el viejo deja de servir.',
  },
  {
    icon: <path d="M3 9a13 13 0 0 1 18 0M6.5 12.5a8 8 0 0 1 11 0M10 16a3 3 0 0 1 4 0M12 19.5h.01M3 3l18 18" />,
    title: 'Entra aunque no haya señal',
    body: 'En la puerta validan tu entrada incluso sin internet. Nada de quedarte afuera por el wifi.',
  },
  {
    icon: <path d="M12 3v18M8 7.5c0-1.7 1.8-3 4-3s4 1.3 4 3-1.8 2.6-4 3-4 1.3-4 3 1.8 3 4 3 4-1.3 4-3" />,
    title: 'Sin cargos extra',
    body: 'Pagás el precio de la entrada y listo. Sin “cargo por servicio” sorpresa al final.',
  },
];

/** "Comprá. Mostrá. Listo." — para compradores (referencia: explicación 1). */
export function BuyersSection() {
  return (
    <section className="hz hz-glow overflow-hidden" aria-labelledby="compradores">
      <div className="mx-auto grid max-w-6xl items-center gap-14 px-4 py-20 sm:px-6 sm:py-28 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        {/* Teléfono con la entrada */}
        <div className="mx-auto w-[min(78vw,300px)]">
          <div className="relative rounded-[2.6rem] bg-[#0e0c0b] p-2.5 shadow-[0_0_0_1.5px_rgb(244_239_230/0.12),0_40px_80px_-30px_rgb(0_0_0/0.9)]">
            <div className="absolute left-1/2 top-4 z-10 h-6 w-24 -translate-x-1/2 rounded-full bg-black" aria-hidden />
            <div className="relative overflow-hidden rounded-[2.1rem] bg-ink" style={{ aspectRatio: '9 / 18.5' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/banner/inicio-movil-600.webp" alt="" className="absolute inset-0 h-full w-full object-cover object-[78%_50%] opacity-80" loading="lazy" />
              <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/70" />
              <div className="absolute inset-x-0 top-0 flex justify-between px-6 pt-4 text-[0.68rem] font-semibold text-white">
                <span>22:42</span>
                <span>● 78</span>
              </div>
              <div className="absolute inset-x-3 bottom-3">
                <div className="rounded-2xl bg-[#171411]/95 p-4 text-paper backdrop-blur">
                  <p className="text-[0.6rem] font-bold uppercase tracking-[0.14em] text-paper/50">Tu entrada</p>
                  <p className="mt-1 font-display text-lg font-bold leading-tight">Noche de Otoño</p>
                  <p className="text-[0.72rem] text-paper/60">Sáb 14/03 · 22:00 · Sala Norte</p>
                  <div className="cut my-3 [--color-paper:#0e0c0b]" aria-hidden>
                    <span className="opacity-40" />
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="size-[4.5rem] shrink-0 overflow-hidden rounded-lg">
                      <DemoQr />
                    </div>
                    <div className="min-w-0 text-[0.7rem]">
                      <p className="text-[0.58rem] font-bold uppercase tracking-[0.12em] text-paper/45">Entrada Nº</p>
                      <p className="font-mono text-sm font-bold">9F3A-2C1E</p>
                      <p className="mt-1.5 text-[0.58rem] font-bold uppercase tracking-[0.12em] text-paper/45">DNI</p>
                      <p className="font-mono">•••• 123</p>
                    </div>
                  </div>
                </div>
                <div className="mt-2.5 flex h-10 items-center justify-center rounded-full bg-paper text-[0.8rem] font-bold text-ink">Mostrar en la puerta</div>
              </div>
            </div>
          </div>
        </div>

        <div>
          <p className="hz-eyebrow">Para compradores</p>
          <h2 id="compradores" className="hz-title mt-4 text-[clamp(3rem,8vw,5.6rem)]">
            Comprá.
            <br />
            Mostrá. <span className="hz-ghost">Listo.</span>
          </h2>
          <p className="hz-muted mt-6 max-w-md text-lg">Cuatro cosas que valen oro cuando estás haciendo la fila a las 23:50 con tu amigo apurándote.</p>
          <ul className="mt-10 grid overflow-hidden rounded-2xl bg-paper/[0.06] shadow-[inset_0_0_0_1px_rgb(244_239_230/0.1)] backdrop-blur sm:grid-cols-2">
            {FEATURES.map((f, i) => (
              <li key={f.title} className={`p-6 ${i % 2 === 0 ? 'sm:border-r' : ''} ${i < 2 ? 'border-b' : i === 2 ? 'border-b sm:border-b-0' : ''} border-paper/10`}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className="size-6 text-accent" aria-hidden>
                  {f.icon}
                </svg>
                <h3 className="mt-4 font-semibold">{f.title}</h3>
                <p className="hz-muted mt-1.5 text-sm leading-relaxed">{f.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
