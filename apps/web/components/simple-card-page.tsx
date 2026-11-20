/** Página centrada con la tarjeta de LinTICK (corte de entrada) para flujos de cuenta. */
export function SimpleCardPage({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-md px-4 pt-12 sm:pt-20">
      <div className="rounded-[var(--radius-ticket)] bg-surface py-7 sm:py-9">
        <div className="px-7 sm:px-9">
          <p className="eyebrow">{eyebrow}</p>
          <h1 className="mt-2 text-3xl font-bold">{title}</h1>
        </div>
        <div className="cut my-5" aria-hidden>
          <span />
        </div>
        <div className="px-7 sm:px-9">{children}</div>
      </div>
    </div>
  );
}
