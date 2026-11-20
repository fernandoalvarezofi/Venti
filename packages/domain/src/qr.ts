import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify, type KeyObject } from 'node:crypto';

/**
 * Formato del QR: V1.<ticketId>.<version>.<eventId>.<firma base64url>
 * La firma Ed25519 cubre todo lo anterior al último punto. Ver ADR 0003.
 */
const PREFIX = 'V1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface TicketQrClaims {
  readonly ticketId: string;
  readonly version: number;
  readonly eventId: string;
}

export type QrVerification =
  | { readonly ok: true; readonly claims: TicketQrClaims }
  | { readonly ok: false; readonly reason: 'malformed' | 'bad_signature' };

export function generateQrKeyPair(): { privateKeyPem: string; publicKeyPem: string } {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  return {
    privateKeyPem: privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(),
    publicKeyPem: publicKey.export({ format: 'pem', type: 'spki' }).toString(),
  };
}

export function loadPrivateKey(pem: string): KeyObject {
  return createPrivateKey(pem);
}

export function loadPublicKey(pem: string): KeyObject {
  return createPublicKey(pem);
}

function body(c: TicketQrClaims): string {
  return `${PREFIX}.${c.ticketId}.${c.version}.${c.eventId}`;
}

export function signTicketQr(claims: TicketQrClaims, privateKey: KeyObject): string {
  if (!UUID.test(claims.ticketId) || !UUID.test(claims.eventId) || !Number.isSafeInteger(claims.version) || claims.version < 1) {
    throw new Error('Claims de QR inválidos.');
  }
  const payload = body(claims);
  const signature = sign(null, Buffer.from(payload), privateKey).toString('base64url');
  return `${payload}.${signature}`;
}

export function verifyTicketQr(qr: string, publicKey: KeyObject): QrVerification {
  const parts = qr.trim().split('.');
  if (parts.length !== 5 || parts[0] !== PREFIX) return { ok: false, reason: 'malformed' };
  const [, ticketId, versionRaw, eventId, signature] = parts as [string, string, string, string, string];
  if (!UUID.test(ticketId) || !UUID.test(eventId) || !/^[1-9]\d{0,8}$/.test(versionRaw) || !/^[A-Za-z0-9_-]+$/.test(signature)) {
    return { ok: false, reason: 'malformed' };
  }
  const claims: TicketQrClaims = { ticketId, version: Number(versionRaw), eventId };
  const valid = verify(null, Buffer.from(body(claims)), publicKey, Buffer.from(signature, 'base64url'));
  return valid ? { ok: true, claims } : { ok: false, reason: 'bad_signature' };
}
