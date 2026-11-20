import { createHash } from 'node:crypto';

/** Lo que Lintick necesita saber de la persona que entró con Google. */
export interface GoogleProfile {
  /** Identificador de la cuenta de Google: nunca cambia (el email sí puede cambiar). */
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  nonce: string | null;
}

export interface GoogleClient {
  authorizeUrl(p: { redirectUri: string; state: string; nonce: string; codeChallenge: string }): string;
  /** Canjea el código de la vuelta y devuelve el perfil ya validado (emisor, destinatario y vencimiento). */
  exchangeCode(p: { code: string; redirectUri: string; codeVerifier: string }): Promise<GoogleProfile>;
}

export class GoogleAuthError extends Error {}

const ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com']);

export function pkceChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

function decodeJwtPayload(jwt: string): Record<string, unknown> {
  const parts = jwt.split('.');
  if (parts.length !== 3 || !parts[1]) throw new GoogleAuthError('id_token mal formado');
  return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as Record<string, unknown>;
}

/**
 * Valida los datos del id_token. Alcanza con validar los datos (sin verificar la firma) porque el token llega
 * directo del endpoint de Google por HTTPS, autenticado con nuestro secreto (OpenID Connect Core §3.1.3.7).
 */
export function profileFromIdToken(idToken: string, clientId: string, nowMs: number): GoogleProfile {
  const c = decodeJwtPayload(idToken);
  if (typeof c.iss !== 'string' || !ISSUERS.has(c.iss)) throw new GoogleAuthError('emisor inválido');
  const aud = Array.isArray(c.aud) ? c.aud : [c.aud];
  if (!aud.includes(clientId)) throw new GoogleAuthError('destinatario inválido');
  if (typeof c.exp !== 'number' || c.exp * 1000 < nowMs - 60_000) throw new GoogleAuthError('token vencido');
  if (typeof c.sub !== 'string' || !c.sub) throw new GoogleAuthError('sin sub');
  if (typeof c.email !== 'string' || !c.email) throw new GoogleAuthError('sin email');
  return {
    sub: c.sub,
    email: c.email.trim().toLowerCase(),
    emailVerified: c.email_verified === true || c.email_verified === 'true',
    name: typeof c.name === 'string' && c.name.trim() ? c.name.trim().slice(0, 120) : null,
    nonce: typeof c.nonce === 'string' ? c.nonce : null,
  };
}

export class HttpGoogle implements GoogleClient {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly now: () => number;

  constructor(clientId: string, clientSecret: string, now: () => number = Date.now) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.now = now;
  }

  authorizeUrl(p: { redirectUri: string; state: string; nonce: string; codeChallenge: string }): string {
    const q = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: p.redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      state: p.state,
      nonce: p.nonce,
      code_challenge: p.codeChallenge,
      code_challenge_method: 'S256',
      prompt: 'select_account',
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
  }

  async exchangeCode(p: { code: string; redirectUri: string; codeVerifier: string }): Promise<GoogleProfile> {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: p.code,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: p.redirectUri,
        grant_type: 'authorization_code',
        code_verifier: p.codeVerifier,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new GoogleAuthError(`Google respondió ${res.status}`);
    const body = (await res.json()) as { id_token?: unknown };
    if (typeof body.id_token !== 'string') throw new GoogleAuthError('sin id_token');
    return profileFromIdToken(body.id_token, this.clientId, this.now());
  }
}
