import Link from 'next/link';
import { TicketIcon } from './icons';

type Common = {
  children: React.ReactNode;
  /** Contenido del talón (a la derecha de la línea punteada). Por defecto, el ícono de entrada. */
  stub?: React.ReactNode;
  tone?: 'accent' | 'ink';
  className?: string;
};

/** Botón con forma de entrada: muescas a los lados y talón separado por una línea de corte. */
export function TicketButton({
  children,
  stub,
  tone = 'accent',
  className = '',
  ...props
}: Common & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'className'>) {
  return (
    <button {...props} className={`btn-ticket ${tone === 'ink' ? 'btn-ticket-ink' : ''} ${className}`}>
      <span className="tk-main">{children}</span>
      <span className="tk-stub" aria-hidden>
        {stub ?? <TicketIcon className="size-[18px]" />}
      </span>
    </button>
  );
}

export function TicketLink({ href, children, stub, tone = 'accent', className = '' }: Common & { href: string }) {
  return (
    <Link href={href} className={`btn-ticket ${tone === 'ink' ? 'btn-ticket-ink' : ''} ${className}`}>
      <span className="tk-main">{children}</span>
      <span className="tk-stub" aria-hidden>
        {stub ?? <TicketIcon className="size-[18px]" />}
      </span>
    </Link>
  );
}

/** Botón dentado "admit one" para acciones de productora (crear, publicar). */
export function AdmitButton({ children, tone = 'accent', className = '', ...props }: Omit<Common, 'stub'> & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'className'>) {
  return (
    <button {...props} className={`btn-admit ${tone === 'ink' ? 'btn-admit-ink' : ''} ${className}`}>
      {children}
    </button>
  );
}

export function AdmitLink({ href, children, tone = 'accent', className = '' }: Omit<Common, 'stub'> & { href: string }) {
  return (
    <Link href={href} className={`btn-admit ${tone === 'ink' ? 'btn-admit-ink' : ''} ${className}`}>
      {children}
    </Link>
  );
}
