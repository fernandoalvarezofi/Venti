'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { send } from '@/lib/client-api';
import type { Org } from '@/lib/types';

/** Mismo algoritmo que la API (módulo 11) para avisar antes de enviar. */
function cuitOk(raw: string) {
  const d = raw.replace(/\D/g, '');
  if (d.length !== 11) return false;
  const w = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  let check = 11 - (w.reduce((a, x, i) => a + x * Number(d[i]), 0) % 11);
  if (check === 11) check = 0;
  return check !== 10 && check === Number(d[10]);
}

export function CreateOrgForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  function onSubmit(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const f = new FormData(ev.currentTarget);
    const name = String(f.get('name') ?? '').trim();
    const legalName = String(f.get('legalName') ?? '').trim();
    const taxId = String(f.get('taxId') ?? '').trim();
    const errs: Record<string, string> = {};
    if (name.length < 2) errs.name = 'Escribí el nombre con el que te conoce el público.';
    if (taxId && !cuitOk(taxId)) errs.taxId = 'El CUIT no es válido. Revisá los 11 números.';
    setErrors(errs);
    setError(null);
    if (Object.keys(errs).length) return;
    start(async () => {
      const r = await send<Org>('POST', '/v1/organizations', { name, ...(legalName ? { legalName } : {}), ...(taxId ? { taxId } : {}) });
      if (!r.ok) {
        if (r.code === 'slug_taken') setErrors({ name: 'Ya existe una productora con ese nombre. Probá con una variante.' });
        else setError(r.message);
        return;
      }
      router.push(`/business/${r.data.id}`);
      router.refresh();
    });
  }

  const field = (name: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement>, hint?: string) => (
    <div>
      <label htmlFor={name} className="mb-1.5 block text-sm font-semibold">
        {label}
      </label>
      <input id={name} name={name} className="field" aria-invalid={errors[name] ? 'true' : undefined} {...props} />
      {errors[name] ? <p className="mt-1.5 text-sm text-danger">{errors[name]}</p> : hint ? <p className="mt-1.5 text-sm text-muted">{hint}</p> : null}
    </div>
  );

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {field('name', 'Nombre de la productora', { maxLength: 120, required: true, autoComplete: 'organization' }, 'Es el que ve el público en cada evento.')}
      {field('legalName', 'Razón social (opcional)', { maxLength: 200 })}
      {field('taxId', 'CUIT (opcional)', { inputMode: 'numeric', maxLength: 13, placeholder: '30-12345678-9' }, 'Lo vas a necesitar para cobrar y facturar.')}
      {error ? (
        <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="btn btn-ink w-full">
        {pending ? 'Creando…' : 'Crear productora'}
      </button>
    </form>
  );
}
