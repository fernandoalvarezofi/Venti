import Link from 'next/link';
import { getCurrentUser } from '@/lib/api';
import { SearchIcon, TicketIcon } from './icons';
import { LogoutButton } from './logout-button';

export function Logo() {
  return (
    <span className="font-display text-[1.45rem] font-extrabold tracking-[-0.04em]">
      LinTICK<span className="text-accent">.</span>
    </span>
  );
}

export async function Header() {
  const user = await getCurrentUser();
  const firstName = user?.fullName.split(' ')[0];
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link href="/" aria-label="LinTICK, inicio" className="shrink-0">
          <Logo />
        </Link>
        <nav aria-label="Principal" className="ml-auto flex items-center gap-1 sm:gap-2">
          <Link href="/eventos" className="flex h-10 items-center gap-2 rounded-full px-3 text-sm font-medium text-ink-soft hover:bg-ink/5">
            <SearchIcon className="size-[18px]" />
            <span className="hidden sm:inline">Explorar</span>
          </Link>
          {user ? (
            <>
              <Link href="/mis-entradas" className="flex h-10 items-center gap-2 rounded-full px-3 text-sm font-medium text-ink-soft hover:bg-ink/5">
                <TicketIcon className="size-[18px]" />
                <span className="hidden sm:inline">Mis entradas</span>
              </Link>
              <span className="hidden h-10 items-center rounded-full bg-ink/5 px-3 text-sm md:flex" title={user.email}>
                Hola, {firstName}
              </span>
              <LogoutButton />
            </>
          ) : (
            <Link href="/ingresar" className="btn btn-ink h-10 px-4 text-sm">
              Ingresar
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
