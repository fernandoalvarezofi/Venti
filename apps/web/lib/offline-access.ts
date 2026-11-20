'use client';

import { verifyAsync } from '@noble/ed25519';
import type { ScanResponse } from './types';

/**
 * Lintick Access sin señal.
 *
 * Antes del evento (con conexión) el celular guarda la lista de entradas y la clave pública.
 * Sin conexión: verifica la firma del QR, busca la entrada en la lista, la marca como ingresada
 * en ESTE celular y guarda el ingreso en una cola. Cuando vuelve la señal, la cola se sube y el
 * servidor decide: si otro celular ya la había dejado pasar, lo informa como duplicado.
 *
 * Límite honesto: dos celulares sin señal no se ven entre sí. Por eso la pantalla avisa cuando
 * se está validando sin conexión y la lista se actualiza cada pocos segundos mientras hay señal.
 */

export interface PackTicket {
  v: number;
  s: string;
  n: string;
  t: string;
  d: string | null;
  u: string | null;
}

export interface AccessPack {
  eventId: string;
  endsAt: string;
  publicKey: string;
  /** Hora del servidor de la última descarga (para pedir sólo los cambios). */
  syncedAt: string;
  tickets: Record<string, PackTicket>;
}

export interface QueuedEntry {
  ticketId: string;
  version: number;
  scannedAt: string;
  gate: string | null;
}

// ─── Almacenamiento (IndexedDB, una tabla clave → valor) ───
const DB = 'lintick-access';
const STORE = 'kv';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idb<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

const get = <T>(key: string) => idb<T | undefined>('readonly', (s) => s.get(key)).catch(() => undefined);
const put = (key: string, value: unknown) => idb('readwrite', (s) => s.put(value, key)).catch(() => undefined);
const del = (key: string) => idb('readwrite', (s) => s.delete(key)).catch(() => undefined);

export const loadPack = (eventId: string) => get<AccessPack>(`pack:${eventId}`);
export const savePack = (p: AccessPack) => put(`pack:${p.eventId}`, p);
export const loadQueue = async (eventId: string) => (await get<QueuedEntry[]>(`queue:${eventId}`)) ?? [];
export const saveQueue = (eventId: string, q: QueuedEntry[]) => put(`queue:${eventId}`, q);

/** Borra los datos de este evento del celular (lista y cola ya subida). */
export async function wipeEvent(eventId: string) {
  await del(`pack:${eventId}`);
  await del(`queue:${eventId}`);
}

/** Privacidad: las listas de eventos que terminaron hace más de 12 h se borran solas (si no quedan ingresos sin subir). */
export async function purgeExpired() {
  try {
    const keys = await idb<IDBValidKey[]>('readonly', (s) => s.getAllKeys());
    for (const k of keys) {
      if (typeof k !== 'string' || !k.startsWith('pack:')) continue;
      const p = await get<AccessPack>(k);
      const eventId = k.slice(5);
      const pending = await loadQueue(eventId);
      if (p && new Date(p.endsAt).getTime() + 12 * 3_600_000 < Date.now() && pending.length === 0) await wipeEvent(eventId);
    }
  } catch {
    /* sin IndexedDB: no hay nada guardado */
  }
}

// ─── Descarga y actualización de la lista ───
export async function downloadPack(apiBase: string, current: AccessPack | undefined): Promise<AccessPack | null> {
  const qs = current ? `?since=${encodeURIComponent(current.syncedAt)}` : '';
  const res = await fetchWithTimeout(`${apiBase}/access-pack${qs}`, { cache: 'no-store' }, 15_000);
  if (!res?.ok) return null;
  const body = (await res.json()) as { eventId: string; endsAt: string; publicKey: string; serverTime: string; full: boolean; tickets: (PackTicket & { id: string })[] };
  const tickets: Record<string, PackTicket> = body.full || !current ? {} : { ...current.tickets };
  for (const { id, ...t } of body.tickets) {
    const local = tickets[id];
    // Un ingreso hecho sin señal en este celular y todavía no subido no se pisa con un estado viejo.
    if (local && local.s === 'used' && t.s === 'valid' && local.v === t.v) continue;
    tickets[id] = t;
  }
  return { eventId: body.eventId, endsAt: body.endsAt, publicKey: body.publicKey, syncedAt: body.serverTime, tickets };
}

export async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response | null> {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(id);
  }
}

// ─── Validación local ───
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function b64urlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

const MESSAGES: Record<ScanResponse['result'], string> = {
  admitted: 'Ingreso habilitado (validado sin señal).',
  already_used: 'Esta entrada ya ingresó.',
  invalid_signature: 'QR falsificado o alterado.',
  malformed: 'El código no es una entrada Lintick.',
  wrong_event: 'La entrada es de otro evento.',
  not_found: 'No está en la lista descargada. Puede ser una entrada emitida hace minutos: validala con señal.',
  outdated_qr: 'QR desactualizado: el titular regeneró su entrada. Pedí el QR vigente.',
  not_valid: 'La entrada fue anulada, devuelta o transferida.',
};

/**
 * Valida un QR sin conexión. Si corresponde el ingreso, devuelve también la entrada a encolar
 * (quien llama la marca como usada en la lista y la guarda en la cola).
 */
export async function validateOffline(qr: string, pack: AccessPack, gate: string | null): Promise<{ response: ScanResponse; enqueue: QueuedEntry | null }> {
  const fail = (result: ScanResponse['result'], ticket: ScanResponse['ticket'] = null) => ({ response: { result, message: MESSAGES[result], ticket }, enqueue: null });
  const parts = qr.trim().split('.');
  if (parts.length !== 5 || parts[0] !== 'V1') return fail('malformed');
  const [prefix, ticketId, versionRaw, eventId, sig] = parts as [string, string, string, string, string];
  if (!UUID.test(ticketId) || !UUID.test(eventId) || !/^[1-9]\d{0,8}$/.test(versionRaw) || !/^[A-Za-z0-9_-]+$/.test(sig)) return fail('malformed');

  let valid = false;
  try {
    valid = await verifyAsync(b64urlToBytes(sig), new TextEncoder().encode(`${prefix}.${ticketId}.${versionRaw}.${eventId}`), b64urlToBytes(pack.publicKey));
  } catch {
    valid = false;
  }
  if (!valid) return fail('invalid_signature');
  if (eventId !== pack.eventId) return fail('wrong_event');

  const t = pack.tickets[ticketId];
  if (!t) return fail('not_found');
  const view = { id: ticketId, holderName: t.n, holderDocLast3: t.d, ticketTypeName: t.t, status: t.s, usedAt: t.u };
  if (t.s === 'used') return fail('already_used', view);
  if (t.s !== 'valid') return fail('not_valid', view);
  if (t.v !== Number(versionRaw)) return fail('outdated_qr', view);

  const now = new Date().toISOString();
  return {
    response: { result: 'admitted', message: MESSAGES.admitted, ticket: { ...view, status: 'used', usedAt: now } },
    enqueue: { ticketId, version: t.v, scannedAt: now, gate },
  };
}
