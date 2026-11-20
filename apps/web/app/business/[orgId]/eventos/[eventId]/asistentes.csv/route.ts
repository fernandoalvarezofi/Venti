import { cookies } from 'next/headers';
import { API_URL } from '@/lib/config';
import type { Attendee } from '@/lib/types';

const STATUS: Record<string, string> = { valid: 'Vigente', locked: 'En reventa', used: 'Ingresó', void: 'Transferida', cancelled: 'Cancelada', refunded: 'Devuelta' };
const UUID = /^[0-9a-f-]{36}$/;

/** Celda CSV segura: comillas escapadas y sin fórmulas (evita inyección al abrir en Excel). */
function cell(v: string | number | null): string {
  let s = v === null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

const ar = (iso: string | null) => (iso ? new Date(iso).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' }) : '');

/** Planilla de asistentes del evento. Usa los mismos permisos de la API (la sesión se reenvía). */
export async function GET(_req: Request, { params }: { params: Promise<{ orgId: string; eventId: string }> }) {
  const { orgId, eventId } = await params;
  if (!UUID.test(orgId) || !UUID.test(eventId)) return new Response('No encontrado', { status: 404 });
  const session = (await cookies()).get('venti_session')?.value;
  if (!session) return new Response('Iniciá sesión', { status: 401 });

  const rows: Attendee[] = [];
  for (let offset = 0; offset < 100_000; offset += 200) {
    const res = await fetch(`${API_URL}/v1/organizations/${orgId}/events/${eventId}/attendees?limit=200&offset=${offset}`, {
      headers: { authorization: `Bearer ${session}`, accept: 'application/json' },
      cache: 'no-store',
    }).catch(() => null);
    if (!res) return new Response('No pudimos conectarnos con Lintick.', { status: 503 });
    if (!res.ok) return new Response(res.status === 403 ? 'No tenés permiso para ver los asistentes.' : 'No se pudo generar la planilla.', { status: res.status });
    const page = (await res.json()) as { total: number; items: Attendee[] };
    rows.push(...page.items);
    if (rows.length >= page.total || page.items.length === 0) break;
  }

  const header = ['Número', 'Titular', 'Email', 'DNI (últimos 3)', 'Tipo de entrada', 'Estado', 'Valor', 'Emitida', 'Ingresó'];
  const lines = rows.map((a) => {
    const code = a.id.replace(/-/g, '').slice(0, 8).toUpperCase();
    return [
      `${code.slice(0, 4)}-${code.slice(4)}`,
      a.holderName,
      a.holderEmail,
      a.holderDocLast3 ? `***${a.holderDocLast3}` : '',
      a.ticketTypeName,
      STATUS[a.status] ?? a.status,
      a.courtesy ? 'Cortesía' : (a.priceCents / 100).toFixed(2).replace('.', ','),
      ar(a.issuedAt),
      ar(a.usedAt),
    ]
      .map(cell)
      .join(';');
  });
  // BOM + punto y coma: Excel en español lo abre bien con tildes y columnas separadas.
  const body = '﻿' + [header.map(cell).join(';'), ...lines].join('\r\n');
  return new Response(body, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="asistentes-${eventId.slice(0, 8)}.csv"`,
      'cache-control': 'no-store',
    },
  });
}
