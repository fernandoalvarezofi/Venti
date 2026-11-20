import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/api';
import { safeNext } from '@/lib/safe-next';
import { AuthForm } from './auth-form';
import { Mascot } from './mascot';

export async function AuthPage({ mode, nextRaw }: { mode: 'login' | 'register'; nextRaw: string | undefined }) {
  const next = safeNext(nextRaw);
  if (await getCurrentUser()) redirect(next);
  return (
    <div className="mx-auto grid max-w-5xl gap-10 px-4 pt-12 sm:px-6 md:grid-cols-[1fr_440px] md:pt-20">
      <div className="hidden md:block">
        <p className="eyebrow">{mode === 'register' ? 'Cuenta nueva' : 'Bienvenido de nuevo'}</p>
        <h1 className="mt-4 text-6xl font-extrabold leading-[0.92]">
          {mode === 'register' ? (
            <>
              Tus entradas,
              <br />
              en un solo lugar.
            </>
          ) : (
            <>
              Volvé a
              <br />
              tus planes.
            </>
          )}
        </h1>
        <p className="mt-6 max-w-sm text-muted">Con tu cuenta reservás entradas, recibís las cortesías que te envían y llevás el QR en el celular.</p>
        <Mascot pose="wave" say={mode === 'register' ? '¡Sumate!' : '¡Hola de nuevo!'} size={230} className="mt-8" priority />
      </div>
      <div className="rounded-[var(--radius-ticket)] bg-surface py-7 sm:py-9">
        <div className="px-7 sm:px-9">
        <div className="flex items-end justify-between gap-4 md:hidden">
          <h1 className="text-3xl font-bold">{mode === 'register' ? 'Creá tu cuenta' : 'Ingresá'}</h1>
          <Mascot pose="wave" size={84} className="-mb-2 -mt-6 shrink-0" priority />
        </div>
        <h2 className="hidden text-3xl font-bold md:block">{mode === 'register' ? 'Creá tu cuenta' : 'Ingresá'}</h2>
        </div>
        <div className="cut my-5" aria-hidden><span /></div>
        <div className="px-7 sm:px-9">
          <AuthForm mode={mode} next={next} />
        </div>
      </div>
    </div>
  );
}
