import type { EventStatus } from '@/lib/types';

const STATUS: Record<EventStatus, { label: string; tone: string }> = {
  draft: { label: 'Borrador', tone: 'bg-ink/[0.07] text-ink-soft' },
  published: { label: 'A la venta', tone: 'bg-success/10 text-success' },
  cancelled: { label: 'Cancelado', tone: 'bg-danger/10 text-danger' },
  finished: { label: 'Finalizado', tone: 'bg-ink/[0.07] text-muted' },
};

export function StatusBadge({ status }: { status: EventStatus }) {
  const s = STATUS[status];
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${s.tone}`}>{s.label}</span>;
}

/** Barra de ocupación: vendido (tinta) + reservado (tinta suave) sobre capacidad. */
export function StockBar({ sold, held, capacity, label }: { sold: number; held: number; capacity: number; label?: string }) {
  const pct = (n: number) => (capacity > 0 ? Math.min(100, (n / capacity) * 100) : 0);
  return (
    <div>
      <div
        className="flex h-2 overflow-hidden rounded-full bg-ink/[0.07]"
        role="img"
        aria-label={`${label ? `${label}: ` : ''}${sold} vendidas, ${held} reservadas de ${capacity}`}
      >
        <span className="bg-ink" style={{ width: `${pct(sold)}%` }} />
        <span className="bg-ink/35" style={{ width: `${pct(held)}%` }} />
      </div>
      <p className="mt-1.5 text-xs tabular-nums text-muted">
        <span className="font-semibold text-ink">{sold.toLocaleString('es-AR')}</span> de {capacity.toLocaleString('es-AR')}
        {held > 0 ? <span> · {held} en reserva</span> : null}
      </p>
    </div>
  );
}

export function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-[14px] bg-surface p-5">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 font-display text-3xl font-extrabold tabular-nums tracking-[-0.03em]">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

export function PageTitle({ eyebrow, title, actions }: { eyebrow?: string; title: string; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1 className="mt-1 text-[clamp(1.9rem,4vw,2.8rem)] font-extrabold leading-none">{title}</h1>
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function Panel({ title, description, children, actions }: { title: string; description?: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <section className="rounded-[var(--radius-ticket)] bg-surface">
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5 sm:px-6">
        <div>
          <h2 className="text-lg font-bold">{title}</h2>
          {description ? <p className="mt-0.5 text-sm text-muted">{description}</p> : null}
        </div>
        {actions}
      </div>
      <div className="p-5 pt-4 sm:p-6 sm:pt-4">{children}</div>
    </section>
  );
}
