import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from 'node:crypto';

function scrypt(password: string, salt: Buffer, keylen: number, opts: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, keylen, opts, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

/** Parámetros scrypt (OWASP: N=2^17 r=8 p=1 o equivalente). 2^15 r=8 p=3 ≈ mismo costo con menos memoria por hilo. */
const PARAMS = { N: 2 ** 15, r: 8, p: 3, keylen: 64 } as const;
const MAXMEM = 128 * PARAMS.N * PARAMS.r * 2;

/** Formato almacenado: scrypt$N$r$p$saltB64$hashB64 (permite subir parámetros sin romper hashes viejos). */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password.normalize('NFKC'), salt, PARAMS.keylen, { N: PARAMS.N, r: PARAMS.r, p: PARAMS.p, maxmem: MAXMEM });
  return ['scrypt', PARAMS.N, PARAMS.r, PARAMS.p, salt.toString('base64'), hash.toString('base64')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, n, r, p, saltB64, hashB64] = stored.split('$');
  if (alg !== 'scrypt' || !n || !r || !p || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const N = Number(n);
  const R = Number(r);
  const actual = await scrypt(password.normalize('NFKC'), Buffer.from(saltB64, 'base64'), expected.length, {
    N,
    r: R,
    p: Number(p),
    maxmem: 128 * N * R * 2,
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Hash de referencia para igualar el tiempo de respuesta cuando el usuario no existe (evita enumerar emails). */
let dummyHash: Promise<string> | undefined;
export function dummyPasswordHash(): Promise<string> {
  dummyHash ??= hashPassword(randomBytes(16).toString('hex'));
  return dummyHash;
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
