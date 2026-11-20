import Link from 'next/link';

export interface LegalSection {
  id: string;
  title: string;
  body: React.ReactNode;
}

/** Página legal sobria: índice a la izquierda (en escritorio) y secciones numeradas. */
export function LegalPage({ eyebrow, title, updated, intro, sections }: { eyebrow: string; title: string; updated: string; intro: React.ReactNode; sections: LegalSection[] }) {
  return (
    <div className="mx-auto max-w-6xl px-4 pb-24 pt-12 sm:px-6 sm:pt-16">
      <p className="eyebrow">{eyebrow}</p>
      <h1 className="mt-3 text-[clamp(2.4rem,6vw,4rem)] font-extrabold leading-[0.95] tracking-[-0.04em]">{title}</h1>
      <p className="mt-3 text-sm text-muted">Última actualización: {updated}</p>
      <div className="mt-6 max-w-2xl text-ink-soft">{intro}</div>

      <div className="mt-12 grid gap-10 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <nav aria-label="Secciones" className="hidden lg:sticky lg:top-24 lg:block lg:self-start">
          <ol className="space-y-1 text-sm">
            {sections.map((s, i) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="flex gap-2 rounded-lg px-3 py-1.5 text-ink-soft hover:bg-ink/5 hover:text-ink">
                  <span className="tabular-nums text-muted">{String(i + 1).padStart(2, '0')}</span>
                  {s.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>
        <div className="max-w-2xl space-y-10">
          {sections.map((s, i) => (
            <section key={s.id} id={s.id} className="scroll-mt-24" aria-labelledby={`${s.id}-t`}>
              <h2 id={`${s.id}-t`} className="flex items-baseline gap-3 text-xl font-bold">
                <span className="font-mono text-sm text-muted">{String(i + 1).padStart(2, '0')}</span>
                {s.title}
              </h2>
              <div className="mt-3 space-y-3 leading-relaxed text-ink-soft [&_a]:font-semibold [&_a]:text-ink [&_a]:underline [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1.5">{s.body}</div>
            </section>
          ))}
          <p className="border-t border-line pt-6 text-sm text-muted">
            Ver también: <Link href="/privacidad" className="underline">Política de privacidad</Link> · <Link href="/terminos" className="underline">Términos y condiciones</Link> · <Link href="/ayuda" className="underline">Ayuda</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
