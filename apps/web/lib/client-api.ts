'use client';

import type { ApiErrorBody } from './types';

/** Mutaciones desde el navegador: van a /api/* del mismo dominio (cookie de sesión de primera parte). */
export async function send<T>(method: 'POST' | 'PATCH' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<{ ok: true; data: T } | { ok: false; status: number; message: string; code?: string; details?: Record<string, unknown> }> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).catch(() => null);
  if (!res) return { ok: false, status: 0, message: 'No pudimos conectarnos. Revisá tu conexión.' };
  if (res.status === 204) return { ok: true, data: undefined as T };
  const json = (await res.json().catch(() => null)) as T | ApiErrorBody | null;
  if (!res.ok || (json && typeof json === 'object' && 'error' in json)) {
    const err = (json as ApiErrorBody | null)?.error;
    return { ok: false, status: res.status, message: err?.message ?? 'No se pudo completar la acción.', code: err?.code, details: err?.details };
  }
  return { ok: true, data: json as T };
}

/** Convierte "$ 12.500,50" o "12500.5" en centavos. Devuelve null si no es un monto válido. */
export function parseMoneyToCents(input: string): number | null {
  const clean = input.replace(/[$\s]/g, '');
  if (!clean) return null;
  // Formato argentino: punto de miles y coma decimal.
  const normalized = clean.includes(',') ? clean.replace(/\./g, '').replace(',', '.') : clean.replace(/\.(?=\d{3}(\D|$))/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  return Math.round(Number(normalized) * 100);
}

/** Valor para <input type="datetime-local"> en hora de Argentina (UTC-3, sin horario de verano). */
export function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(new Date(iso).getTime() - 3 * 3600_000);
  return d.toISOString().slice(0, 16);
}

/** Interpreta un datetime-local como hora de Argentina y devuelve ISO UTC. */
export function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const d = new Date(`${value}:00-03:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
