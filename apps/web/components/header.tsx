import Link from 'next/link';
import { MainNav } from './main-nav';
import { getCurrentUser } from '@/lib/api';

/** Carita de la mascota para acompañar el logo (decorativa). */
export function MascotFace({ size = 34 }: { size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/mascota/lintick-cara-128.webp" alt="" aria-hidden width={Math.round(size * 1.1)} height={size} className="logo-face shrink-0" draggable={false} />
  );
}

export function Logo() {
  return (
    <span className="logo inline-flex items-center gap-1.5">
      <MascotFace />
      <span className="font-display text-[1.45rem] font-extrabold tracking-[-0.04em]">
        Lintick<span className="text-accent">.</span>
      </span>
    </span>
  );
}

export async function Header() {
  const user = await getCurrentUser();
  const firstName = user?.fullName.split(' ')[0];
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link href="/" aria-label="Lintick, inicio" className="shrink-0">
          <Logo />
        </Link>
        <MainNav user={user ? { firstName: firstName ?? '', fullName: user.fullName, email: user.email } : null} />
      </div>
    </header>
  );
}
