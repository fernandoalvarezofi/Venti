'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { ApiErrorBody } from '@/lib/types';

type Mode = 'login' | 'register';

export function AuthForm({ mode, next }: { mode: Mode; next: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function validate(data: FormData) {
    const errs: Record<string, string> = {};
    const email = String(data.get('email') ?? '').trim();
    const password = String(data.get('password') ?? '');
    if (mode === 'register' && String(data.get('fullName') ?? '').trim().length < 2) errs.fullName = 'Escribí tu nombre y apellido.';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errs.email = 'Revisá el email: falta algo.';
    if (mode === 'register' && password.length < 10) errs.password = 'Usá al menos 10 caracteres.';
    if (mode === 'login' && password.length === 0) errs.password = 'Escribí tu contraseña.';
    return errs;
  }

  function onSubmit(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const data = new FormData(ev.currentTarget);
    const errs = validate(data);
    setFieldErrors(errs);
    setError(null);
    if (Object.keys(errs).length > 0) return;
    start(async () => {
      const payload =
        mode === 'register'
          ? { fullName: String(data.get('fullName')).trim(), email: String(data.get('email')).trim(), password: String(data.get('password')) }
          : { email: String(data.get('email')).trim(), password: String(data.get('password')) };
      const res = await fetch(`/api/v1/auth/${mode === 'register' ? 'register' : 'login'}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => null);
      if (!res) return setError('No pudimos conectarnos. Revisá tu conexión.');
      if (res.ok) {
        router.push(next);
        router.refresh();
        return;
      }
      const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
      const code = body?.error.code;
      if (code === 'email_taken') setFieldErrors({ email: 'Ya hay una cuenta con este email. Ingresá con tu contraseña.' });
      else if (code === 'rate_limited') setError('Hiciste muchos intentos seguidos. Esperá un minuto y probá de nuevo.');
      else setError(body?.error.message ?? 'No se pudo completar. Intentá de nuevo.');
    });
  }

  const field = (name: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement>, hint?: string) => (
    <div>
      <label htmlFor={name} className="mb-1.5 block text-sm font-semibold">
        {label}
      </label>
      <input
        id={name}
        name={name}
        className="field"
        aria-invalid={fieldErrors[name] ? 'true' : undefined}
        aria-describedby={fieldErrors[name] ? `${name}-error` : hint ? `${name}-hint` : undefined}
        {...props}
      />
      {fieldErrors[name] ? (
        <p id={`${name}-error`} className="mt-1.5 text-sm text-danger">
          {fieldErrors[name]}
        </p>
      ) : hint ? (
        <p id={`${name}-hint`} className="mt-1.5 text-sm text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {mode === 'register' ? field('fullName', 'Nombre y apellido', { autoComplete: 'name', maxLength: 120, required: true }) : null}
      {field('email', 'Email', { type: 'email', autoComplete: 'email', inputMode: 'email', maxLength: 254, required: true })}
      {field(
        'password',
        'Contraseña',
        { type: 'password', autoComplete: mode === 'register' ? 'new-password' : 'current-password', maxLength: 128, required: true },
        mode === 'register' ? 'Al menos 10 caracteres. Una frase corta es fácil de recordar y difícil de adivinar.' : undefined,
      )}
      {error ? (
        <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="btn btn-ink w-full">
        {pending ? (mode === 'register' ? 'Creando tu cuenta…' : 'Ingresando…') : mode === 'register' ? 'Crear cuenta' : 'Ingresar'}
      </button>
      <p className="text-center text-sm text-muted">
        {mode === 'register' ? '¿Ya tenés cuenta? ' : '¿Primera vez en VENTI? '}
        <Link href={`${mode === 'register' ? '/ingresar' : '/registrarse'}?next=${encodeURIComponent(next)}`} className="font-semibold text-ink underline underline-offset-2">
          {mode === 'register' ? 'Ingresá' : 'Creá tu cuenta'}
        </Link>
      </p>
    </form>
  );
}
