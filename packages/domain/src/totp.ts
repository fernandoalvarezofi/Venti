import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** TOTP según RFC 6238 (HMAC-SHA1, 30 s, 6 dígitos), compatible con Google Authenticator y similares. */

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/=+$/, '').replace(/\s/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx === -1) throw new Error('Secreto base32 inválido.');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function hotp(secret: Buffer, counter: number, digits = 6): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const mac = createHmac('sha1', secret).update(msg).digest();
  const offset = mac[mac.length - 1]! & 0x0f;
  const code = (mac.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits;
  return code.toString().padStart(digits, '0');
}

export function totp(secretBase32: string, at: Date = new Date(), digits = 6, stepSeconds = 30): string {
  return hotp(base32Decode(secretBase32), Math.floor(at.getTime() / 1000 / stepSeconds), digits);
}

/**
 * Verifica un código aceptando ±`window` pasos de desfase de reloj.
 * Devuelve el contador usado (para impedir reutilizar el mismo código) o null.
 */
export function verifyTotp(secretBase32: string, code: string, at: Date = new Date(), window = 1): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const secret = base32Decode(secretBase32);
  const current = Math.floor(at.getTime() / 1000 / 30);
  const given = Buffer.from(code);
  for (let delta = -window; delta <= window; delta++) {
    const expected = Buffer.from(hotp(secret, current + delta));
    if (timingSafeEqual(expected, given)) return current + delta;
  }
  return null;
}

export function totpUri(secretBase32: string, account: string, issuer = 'VENTI'): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secretBase32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}
