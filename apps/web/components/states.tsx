import Link from 'next/link';
import { TicketIcon } from './icons';

/** Estado vacío: dice qué pasa y qué hacer, con una acción concreta. */
export function EmptyState({ title, body, action }: { title: string; body: string; action?: { href: string; label: string } }) {
  return (
    <div className="ticket mx-auto max-w-xl bg-surface px-8 py-12 text-center">
      <div className="mx-auto mb-5 grid size-12 place-items-center rounded-full bg-ink/5 text-ink-soft">
        <TicketIcon className="size-6" />
      </div>
      <h2 className="text-2xl font-bold">{title}</h2>
      <p className="mx-auto mt-2 max-w-sm text-muted">{body}</p>
      {action ? (
        <Link href={action.href} className="btn btn-ink mt-6">
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div role="alert" className="mx-auto max-w-xl rounded-2xl border border-danger/30 bg-danger/5 px-6 py-5 text-sm text-danger">
      <p className="font-semibold">No pudimos cargar esta sección.</p>
      <p className="mt-1 text-danger/90">{message} Probá recargar la página en unos segundos.</p>
    </div>
  );
}
