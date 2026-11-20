'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { send } from '@/lib/client-api';

function Field({ id, label, error, ...props }: { id: string; label: string; error?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold">
        {label}
      </label>
      <input id={id} name={id} className="field" aria-invalid={error ? 'true' : undefined} aria-describedby={error ? `${id}-error` : undefined} {...props} />
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function Alert({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
      {children}
    </p>
  );
}

/** Confirmar el email: exige la contraseña elegida al registrarse (ver ID-TICKET-SECURITY, H1/H5). */
export function VerifyEmailForm({ token }: { token: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [claimed, setClaimed] = useState<number | null>(null);

  if (!token) return <Alert>El enlace está incompleto. Abrilo directamente desde el email.</Alert>;
  if (claimed !== null)
    return (
      <div className="space-y-4" role="status">
        <p className="text-lg font-semibold">¡Listo! Tu cuenta está activa.</p>
        {claimed > 0 ? <p className="text-muted">Te esperaban {claimed === 1 ? '1 entrada' : `${claimed} entradas`}: ya están en tu cuenta.</p> : null}
        <Link href="/mis-entradas" className="btn btn-ink w-full">
          Ver mis entradas
        </Link>
      </div>
    );

  return (
    <form
      noValidate
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!password) return setError('Escribí la contraseña que elegiste al registrarte.');
        start(async () => {
          setError(null);
          const r = await send<{ claimedTickets: number }>('POST', '/v1/auth/verify-email', { token, password });
          if (!r.ok) return setError(r.message);
          setClaimed(r.data.claimedTickets);
          router.refresh();
        });
      }}
    >
      <p className="text-muted">Para activar la cuenta, escribí la contraseña que elegiste al registrarte. Así nadie más puede activarla con tu email.</p>
      <Field id="password" label="Contraseña" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} maxLength={128} />
      {error ? <Alert>{error}</Alert> : null}
      <button type="submit" disabled={pending} className="btn btn-ink w-full">
        {pending ? 'Activando…' : 'Activar mi cuenta'}
      </button>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [pending, start] = useTransition();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (done)
    return (
      <div className="space-y-3" role="status">
        <p className="text-lg font-semibold">Revisá tu email</p>
        <p className="text-muted">Si hay una cuenta con ese email, te llega un enlace para elegir una contraseña nueva. Vence en 30 minutos.</p>
      </div>
    );

  return (
    <form
      noValidate
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setError('Revisá el email: falta algo.');
        start(async () => {
          setError(null);
          const r = await send('POST', '/v1/auth/password/forgot', { email: email.trim() });
          if (!r.ok) return setError(r.message);
          setDone(true);
        });
      }}
    >
      <Field id="email" label="Email" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} />
      {error ? <Alert>{error}</Alert> : null}
      <button type="submit" disabled={pending} className="btn btn-ink w-full">
        {pending ? 'Enviando…' : 'Enviarme el enlace'}
      </button>
      <p className="text-center text-sm text-muted">
        <Link href="/ingresar" className="underline underline-offset-2 hover:text-ink">
          Volver a ingresar
        </Link>
      </p>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [pending, start] = useTransition();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (!token) return <Alert>El enlace está incompleto. Abrilo directamente desde el email.</Alert>;
  if (done)
    return (
      <div className="space-y-4" role="status">
        <p className="text-lg font-semibold">Contraseña actualizada</p>
        <p className="text-muted">Por seguridad cerramos todas tus sesiones abiertas. Ingresá con la contraseña nueva.</p>
        <Link href="/ingresar" className="btn btn-ink w-full">
          Ingresar
        </Link>
      </div>
    );

  return (
    <form
      noValidate
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (password.length < 10) return setError('Usá al menos 10 caracteres.');
        start(async () => {
          setError(null);
          const r = await send('POST', '/v1/auth/password/reset', { token, password });
          if (!r.ok) return setError(r.message);
          setDone(true);
        });
      }}
    >
      <Field id="password" label="Contraseña nueva" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} maxLength={128} />
      <p className="-mt-3 text-sm text-muted">Al menos 10 caracteres. Al cambiarla se cierran todas tus sesiones.</p>
      {error ? <Alert>{error}</Alert> : null}
      <button type="submit" disabled={pending} className="btn btn-ink w-full">
        {pending ? 'Guardando…' : 'Guardar contraseña'}
      </button>
    </form>
  );
}
