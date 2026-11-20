import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Cifrado de secretos en reposo (tokens de Mercado Pago de cada productora).
 * AES-256-GCM: confidencialidad + integridad. Formato: "v1.<iv>.<tag>.<cifrado>" en base64url.
 * Se ata a un contexto (la productora) para que un token copiado a otra fila no descifre.
 */
export class SecretBox {
  readonly #key: Buffer;

  constructor(keyBase64: string) {
    const key = Buffer.from(keyBase64, 'base64');
    if (key.length !== 32) throw new Error('La clave de cifrado debe tener 32 bytes.');
    this.#key = key;
  }

  seal(plain: string, context: string): string {
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', this.#key, iv);
    c.setAAD(Buffer.from(context));
    const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
    return ['v1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), enc.toString('base64url')].join('.');
  }

  open(sealed: string, context: string): string {
    const [v, iv, tag, enc] = sealed.split('.');
    if (v !== 'v1' || !iv || !tag || !enc) throw new Error('Secreto con formato desconocido.');
    const d = createDecipheriv('aes-256-gcm', this.#key, Buffer.from(iv, 'base64url'));
    d.setAAD(Buffer.from(context));
    d.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([d.update(Buffer.from(enc, 'base64url')), d.final()]).toString('utf8');
  }
}
