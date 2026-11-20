import 'server-only';
import { cookies } from 'next/headers';
import { API_URL } from './config';
import type { ApiErrorBody, PublicEvent, PublicEventDetail, Ticket, User, Hold } from './types';

/** Llamada a la API desde el servidor, reenviando la cookie de sesión del visitante. */
async function apiGet<T>(path: string, opts: { auth?: boolean; revalidate?: number } = {}): Promise<{ ok: true; data: T } | { ok: false; status: number; error: ApiErrorBody['error'] | null }> {
  const headers: Record<string, string> = { accept: 'application/json' };
  if (opts.auth) {
    const session = (await cookies()).get('venti_session')?.value;
    if (!session) return { ok: false, status: 401, error: null };
    headers.authorization = `Bearer ${session}`;
  }
  try {
    const res = await fetch(`${API_URL}${path}`, {
      headers,
      ...(opts.auth ? { cache: 'no-store' as const } : { next: { revalidate: opts.revalidate ?? 30 } }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
      return { ok: false, status: res.status, error: body?.error ?? null };
    }
    return { ok: true, data: (await res.json()) as T };
  } catch {
    return { ok: false, status: 503, error: { code: 'api_unreachable', message: 'No pudimos conectarnos con VENTI.' } };
  }
}

export interface EventFilters {
  q?: string;
  city?: string;
  category?: string;
  from?: string;
  limit?: number;
}

export function searchEvents(f: EventFilters = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v !== undefined && v !== '') qs.set(k, String(v));
  return apiGet<{ items: PublicEvent[]; nextCursor: string | null }>(`/v1/public/events?${qs}`);
}

export function getEvent(id: string) {
  return apiGet<PublicEventDetail>(`/v1/public/events/${encodeURIComponent(id)}`, { revalidate: 10 });
}

export async function getCurrentUser(): Promise<User | null> {
  const r = await apiGet<{ user: User }>('/v1/me', { auth: true });
  return r.ok ? r.data.user : null;
}

export function getMyTickets() {
  return apiGet<{ items: Ticket[] }>('/v1/me/tickets', { auth: true });
}

export function getHold(id: string) {
  return apiGet<Hold>(`/v1/holds/${encodeURIComponent(id)}`, { auth: true });
}
