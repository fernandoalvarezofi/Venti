'use client';

import { useState } from 'react';

type Day = { date: string; sold: number; courtesies: number };

/* Paleta validada (scripts/validate_palette.js, superficie #faf7f2): pasa banda, croma, CVD y contraste. */
const SOLD = '#d23a1f';
const COURTESY = '#2f6db5';

const fmtDay = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!, 12)).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', timeZone: 'UTC' });
};

/** Entradas emitidas por día (30 días): barras apiladas Vendidas + Cortesías, con tooltip por barra. */
export function SalesChart({ days }: { days: Day[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...days.map((d) => d.sold + d.courtesies));
  // Escala "linda": 1, 2, 5, 10, 20, 50…
  const step = (() => {
    const raw = max / 3;
    const p = 10 ** Math.floor(Math.log10(raw || 1));
    return [1, 2, 5, 10].map((m) => m * p).find((v) => v >= raw) ?? p * 10;
  })();
  const top = Math.max(step, Math.ceil(max / step) * step);
  const W = 600;
  const H = 180;
  const padL = 30;
  const padB = 22;
  const plotW = W - padL;
  const plotH = H - padB - 6;
  const slot = plotW / days.length;
  const barW = Math.max(4, slot - 4);
  const y = (v: number) => 6 + plotH - (v / top) * plotH;
  const total = days.reduce((a, d) => a + d.sold + d.courtesies, 0);
  const h = hover !== null ? days[hover] : null;

  return (
    <figure>
      <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
        <span className="inline-flex items-center gap-2">
          <span className="size-2.5 rounded-sm" style={{ background: SOLD }} aria-hidden />
          Vendidas
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="size-2.5 rounded-sm" style={{ background: COURTESY }} aria-hidden />
          Cortesías
        </span>
        <span className="ml-auto text-muted">{total.toLocaleString('es-AR')} en 30 días</span>
      </div>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={`Entradas emitidas por día en los últimos 30 días: ${total} en total.`} onMouseLeave={() => setHover(null)}>
          {[0, step, 2 * step, 3 * step].filter((v) => v <= top).map((v) => (
            <g key={v}>
              <line x1={padL} x2={W} y1={y(v)} y2={y(v)} stroke="currentColor" className="text-ink/10" strokeWidth={1} />
              <text x={padL - 6} y={y(v)} dy="0.32em" textAnchor="end" className="fill-muted text-[10px] tabular-nums">
                {v.toLocaleString('es-AR')}
              </text>
            </g>
          ))}
          {days.map((d, i) => {
            const x = padL + i * slot + (slot - barW) / 2;
            const hs = d.sold > 0 ? Math.max(2, (d.sold / top) * plotH) : 0;
            const hc = d.courtesies > 0 ? Math.max(2, (d.courtesies / top) * plotH) : 0;
            const base = 6 + plotH;
            const gap = hs > 0 && hc > 0 ? 2 : 0;
            const r = Math.min(4, barW / 2);
            const topSeg = hc > 0 ? 'c' : 's';
            const dim = hover !== null && hover !== i;
            return (
              <g key={d.date} opacity={dim ? 0.45 : 1}>
                {hs > 0 ? <path d={roundTop(x, base - hs, barW, hs, topSeg === 's' ? r : 0)} fill={SOLD} /> : null}
                {hc > 0 ? <path d={roundTop(x, base - hs - gap - hc, barW, hc, r)} fill={COURTESY} /> : null}
                {/* Zona de toque más grande que la barra. */}
                <rect x={padL + i * slot} y={0} width={slot} height={H - padB} fill="transparent" onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={-1} />
                {(i % 7 === 0 && i <= days.length - 5) || i === days.length - 1 ? (
                  <text x={x + barW / 2} y={H - 6} textAnchor="middle" className="fill-muted text-[10px]">
                    {fmtDay(d.date)}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
        {h ? (
          <div
            className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-lg bg-ink px-3 py-2 text-xs text-paper shadow-lg"
            style={{ left: `${((padL + hover! * slot + slot / 2) / W) * 100}%` }}
          >
            <p className="font-semibold">{fmtDay(h.date)}</p>
            <p className="tabular-nums">Vendidas: {h.sold}</p>
            <p className="tabular-nums">Cortesías: {h.courtesies}</p>
          </div>
        ) : null}
      </div>
      <table className="sr-only">
        <caption>Entradas emitidas por día</caption>
        <thead>
          <tr>
            <th scope="col">Día</th>
            <th scope="col">Vendidas</th>
            <th scope="col">Cortesías</th>
          </tr>
        </thead>
        <tbody>
          {days.map((d) => (
            <tr key={d.date}>
              <td>{fmtDay(d.date)}</td>
              <td>{d.sold}</td>
              <td>{d.courtesies}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/** Rectángulo con las dos esquinas de arriba redondeadas (el extremo del dato), base recta. */
function roundTop(x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, h, w / 2);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}
