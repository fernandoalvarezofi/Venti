import { createHmac } from 'node:crypto';

/**
 * DNI del titular: se guarda como HMAC-SHA256(clave del servidor, organización + DNI normalizado).
 * - Permite comparar ("¿es el mismo DNI?") sin poder recuperar el número.
 * - La organización actúa de pimienta: el mismo DNI produce valores distintos en productoras distintas,
 *   así una filtración de una productora no sirve para cruzar datos con otra.
 * Se conservan sólo los últimos 3 dígitos para la verificación visual en la puerta.
 */
export function normalizeDocument(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  return /^\d{7,9}$/.test(digits) ? digits.replace(/^0+/, '') : null;
}

export function documentHmac(key: Buffer, orgId: string, doc: string): string {
  return createHmac('sha256', key).update(`${orgId}:${doc}`).digest('hex');
}

export function protectDocument(key: Buffer, orgId: string, raw: string): { hmac: string; last3: string } | null {
  const doc = normalizeDocument(raw);
  if (!doc) return null;
  return { hmac: documentHmac(key, orgId, doc), last3: doc.slice(-3) };
}

/** Enmascara un email para roles que no necesitan verlo completo: "lu***@ejemplo.com". */
export function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@');
  return `${local.slice(0, 2)}${'*'.repeat(Math.max(1, Math.min(6, local.length - 2)))}@${domain}`;
}
