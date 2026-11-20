import { redirect } from 'next/navigation';
import { getAuthProviders, getCurrentUser } from '@/lib/api';
import { safeNext } from '@/lib/safe-next';
import { AuthForm } from './auth-form';
import { GOOGLE_MESSAGES, GoogleButton } from './google-button';
import { Mascot } from './mascot';

export async function AuthPage({ mode, nextRaw, googleStatus }: { mode: 'login' | 'register'; nextRaw: string | undefined; googleStatus?: string }) {
  const next = safeNext(nextRaw);
  if (await getCurrentUser()) redirect(next);
  const providers = await getAuthProviders();
  const google = providers.ok && providers.data.google;
  // Sin envío de emails no se pueden confirmar cuentas nuevas: en ese caso, crear la cuenta es sólo con Google.
  const emailSignup = !providers.ok || providers.data.email;
  const googleError = googleStatus ? (GOOGLE_MESSAGES[googleStatus] ?? GOOGLE_MESSAGES.error) : null;
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
          {googleError ? (
            <p role="alert" className="mb-5 rounded-xl bg-accent/10 px-4 py-3 text-sm text-accent-ink">
              {googleError}
            </p>
          ) : null}
          {google ? (
            <>
              <GoogleButton next={next} label={mode === 'register' ? 'Registrarme con Google' : 'Continuar con Google'} />
              {mode === 'register' && !emailSignup ? (
                <p className="mt-4 text-sm text-muted">Usamos tu cuenta de Google para crear la tuya: no tenés que elegir contraseña ni confirmar el email.</p>
              ) : (
                <div className="my-6 flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted" aria-hidden>
                  <span className="h-px flex-1 bg-line" />o con tu email
                  <span className="h-px flex-1 bg-line" />
                </div>
              )}
            </>
          ) : null}
          {mode === 'register' && !emailSignup ? (
            google ? null : <p className="text-muted">Por ahora no se pueden crear cuentas nuevas. Probá de nuevo en un rato.</p>
          ) : (
            <AuthForm mode={mode} next={next} />
          )}
        </div>
      </div>
    </div>
  );
}
