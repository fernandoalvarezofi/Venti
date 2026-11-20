'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/** Compras de ejemplo que se repiten en la animación (montos en pesos). */
const SALES = [
  { initials: 'CS', name: 'Camila S.', paid: 120_000, tickets: 2 },
  { initials: 'TR', name: 'Tomás R.', paid: 45_000, tickets: 1 },
  { initials: 'LP', name: 'Lucía P.', paid: 90_000, tickets: 3 },
  { initials: 'MG', name: 'Martín G.', paid: 60_000, tickets: 2 },
] as const;

const COMMISSION = 0.1;
const START_BALANCE = 3_027_310;
const START_TICKETS = 105;
/** Pausa (ms) entre que llega la plata y arranca la próxima venta. El viaje dura 2,3 s (CSS). */
const PAUSE = 1900;

const ars = (n: number) => `$ ${Math.round(n).toLocaleString('es-AR')}`;

/**
 * Animación de la sección "Cobrá al instante": el pago sale del celular del comprador, en el camino
 * se descuenta la comisión de Lintick y el neto llega a la cuenta de la productora (el saldo cuenta
 * hacia arriba). Con "reducir movimiento" queda quieta mostrando el resultado final.
 */
export function PayoutFlow() {
  const [i, setI] = useState(0);
  const [balance, setBalance] = useState(START_BALANCE + SALES[0].paid * (1 - COMMISSION));
  const [tickets, setTickets] = useState(START_TICKETS + SALES[0].tickets);
  const [arrived, setArrived] = useState(true);
  const [reduced, setReduced] = useState(false);
  const raf = useRef(0);

  // Estado de la secuencia en refs: la llegada la dispara el FIN REAL del viaje del billete
  // (evento animationend), así la cuenta nunca se adelanta aunque el navegador frene la animación.
  const seq = useRef({ idx: 0, base: START_BALANCE, count: START_TICKETS, timer: 0 });

  const startSale = useCallback(() => {
    const st = seq.current;
    setI(st.idx % SALES.length);
    setArrived(false);
  }, []);

  const onTravelEnd = useCallback(
    (e: React.AnimationEvent) => {
      if (e.animationName !== 'payflow-move') return;
      const st = seq.current;
      const sale = SALES[st.idx % SALES.length]!;
      const from = st.base;
      const to = st.base + sale.paid * (1 - COMMISSION);
      setArrived(true);
      const t0 = performance.now();
      const tick = (now: number) => {
        const p = Math.min(1, (now - t0) / 700);
        setBalance(from + (to - from) * (1 - (1 - p) ** 3));
        if (p < 1) raf.current = requestAnimationFrame(tick);
      };
      cancelAnimationFrame(raf.current);
      raf.current = requestAnimationFrame(tick);
      st.count += sale.tickets;
      setTickets(st.count);
      st.base = to;
      // Para que el número no crezca para siempre, vuelve a empezar cada tanto.
      if (st.base > START_BALANCE + 900_000) {
        st.base = START_BALANCE;
        st.count = START_TICKETS;
      }
      st.idx++;
      // Pausa para leer el resultado y arranca la próxima venta.
      st.timer = window.setTimeout(startSale, PAUSE);
    },
    [startSale],
  );

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    if (mq.matches) return;
    setBalance(START_BALANCE);
    setTickets(START_TICKETS);
    startSale();
    const st = seq.current;
    return () => {
      clearTimeout(st.timer);
      cancelAnimationFrame(raf.current);
    };
  }, [startSale]);

  const sale = SALES[i]!;
  const net = sale.paid * (1 - COMMISSION);
  const fee = sale.paid * COMMISSION;

  return (
    <div className={`payflow grid items-center gap-8 md:grid-cols-[auto_1fr_auto] ${reduced ? 'payflow-still' : ''}`} key={reduced ? 'still' : 'live'}>
      {/* Teléfono del comprador */}
      <div className="text-center md:text-left">
        <div className="mx-auto grid h-44 w-24 place-items-center rounded-[1.4rem] bg-[#0e0c0b] p-1.5 shadow-[0_0_0_1.5px_rgb(244_239_230/0.15),6px_6px_0_var(--color-accent)] md:mx-0">
          <div className="grid h-full w-full place-items-center rounded-[1.1rem] bg-ink text-center text-paper">
            <span key={`ok-${i}-${reduced}`} className="payflow-ok">
              <span className="mx-auto grid size-11 place-items-center rounded-full bg-[#16a34a] text-lg font-bold text-white shadow-[0_0_0_4px_rgb(22_163_74/0.2)]">✓</span>
              <span className="mt-2 block text-[0.68rem] font-bold leading-tight">
                Pago
                <br />
                aprobado
              </span>
            </span>
          </div>
        </div>
        <p className="mt-4 font-semibold">Tu público</p>
        <p className="text-sm text-muted" aria-live="off">
          paga {ars(sale.paid)}
        </p>
      </div>

      {/* El camino del dinero */}
      <div className="relative h-24 md:h-28" aria-hidden>
        <span className="hand absolute left-1/2 top-0 w-max -translate-x-1/2 !text-accent">directo, sin escalas</span>
        <span className="absolute inset-x-2 top-[58%] border-t-2 border-dotted border-ink/25" />
        {/* Punto donde se descuenta la comisión */}
        <span className="absolute left-1/2 top-[58%] -translate-x-1/2 -translate-y-1/2">
          <span className="block size-3 rounded-full bg-ink/35 ring-4 ring-ink/10" />
        </span>
        <span key={`fee-${i}-${reduced}`} className="payflow-fee absolute left-1/2 top-[58%] -translate-x-1/2 whitespace-nowrap rounded-full bg-ink px-2 py-0.5 text-[0.65rem] font-semibold text-paper">
          Lintick 10% · {ars(fee)}
        </span>
        {/* El billete que viaja */}
        {!arrived || reduced ? (
          <span key={`bill-${i}-${reduced}`} className="payflow-bill absolute top-[58%] -translate-y-1/2" onAnimationEnd={onTravelEnd}>
            <span className="payflow-amount whitespace-nowrap rounded-lg bg-accent px-2.5 py-1 text-xs font-bold text-white shadow-[0_8px_18px_-6px_rgb(210_58_31/0.8)]">
              <span className="payflow-gross">{ars(sale.paid)}</span>
              <span className="payflow-net">{ars(net)}</span>
            </span>
          </span>
          ) : null}
      </div>

      {/* Cuenta de la productora */}
      <div className={`mx-auto w-full max-w-[17rem] rotate-2 rounded-2xl bg-white p-5 text-ink shadow-[0_24px_40px_-18px_rgb(23_20_17/0.45)] transition-transform duration-300 ${arrived ? 'payflow-bump' : ''}`} key={`acc-${i}-${arrived}`}>
        <p className="flex items-center gap-2 text-xs font-semibold text-muted">
          <span className="grid size-5 place-items-center rounded bg-ink text-[0.6rem] text-paper">MP</span> Tu cuenta
          <span className={`ml-auto size-2 rounded-full ${arrived ? 'bg-success' : 'bg-ink/20'}`} />
        </p>
        <p className="mt-2 font-display text-[2.3rem] font-extrabold leading-none tracking-[-0.04em] tabular-nums">{ars(balance)}</p>
        <p className="mt-1 text-xs text-muted">{tickets} entradas vendidas</p>
        <div className="mt-4 flex min-h-[2.25rem] items-center justify-between border-t border-line pt-3 text-sm">
          {arrived ? (
            <>
              <span className="payflow-row flex items-center gap-2 text-muted">
                <span className="grid size-7 place-items-center rounded-full bg-ink/10 text-[0.65rem] font-bold">{sale.initials}</span>
                {sale.name}
              </span>
              <span className="payflow-row rounded-md bg-accent/15 px-1.5 font-semibold text-accent-ink">+ {ars(net)}</span>
            </>
          ) : (
            <span className="text-xs text-muted">Esperando la próxima venta…</span>
          )}
        </div>
      </div>
    </div>
  );
}
