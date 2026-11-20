import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { safeNext } from '../src/modules/auth/routes.ts';
import { profileFromIdToken, type GoogleClient, type GoogleProfile } from '../src/lib/google.ts';
import { call, randomIp, registerUser, setupApp, type TestContext } from './helpers.ts';

/** Google de prueba (sólo tests): el "código" que vuelve de Google indica qué perfil devolver. */
class TestGoogle implements GoogleClient {
  profiles = new Map<string, Omit<GoogleProfile, 'nonce'>>();
  lastAuthorize: URLSearchParams | null = null;
  authorizeUrl(p: { redirectUri: string; state: string; nonce: string; codeChallenge: string }) {
    this.lastAuthorize = new URLSearchParams({ redirect_uri: p.redirectUri, state: p.state, nonce: p.nonce, code_challenge: p.codeChallenge });
    return `https://accounts.google.test/auth?${this.lastAuthorize}`;
  }
  async exchangeCode(p: { code: string }) {
    const profile = this.profiles.get(p.code);
    if (!profile) throw new Error('código desconocido');
    return { ...profile, nonce: this.lastAuthorize!.get('nonce') };
  }
}

let ctx: TestContext;
const google = new TestGoogle();
beforeAll(async () => {
  ctx = await setupApp({ google, env: { GOOGLE_CLIENT_ID: 'test', GOOGLE_CLIENT_SECRET: 'test' } });
});
afterAll(async () => {
  await ctx.owner.close();
  await ctx.venti.close();
});

const cookieOf = (setCookie: string | string[] | undefined, name: string) =>
  ([] as string[]).concat(setCookie ?? []).find((c) => c.startsWith(`${name}=`) && !c.startsWith(`${name}=;`))?.split(';')[0]?.slice(name.length + 1);

/** Hace el viaje completo: /start → (Google) → /callback con el perfil indicado. */
async function signIn(profile: Omit<GoogleProfile, 'nonce'>, opts: { next?: string; tamperState?: boolean } = {}) {
  const ip = randomIp();
  const start = await ctx.venti.app.inject({ method: 'GET', url: `/v1/auth/google/start${opts.next ? `?next=${encodeURIComponent(opts.next)}` : ''}`, remoteAddress: ip });
  expect(start.statusCode).toBe(302);
  const flow = cookieOf(start.headers['set-cookie'], 'lintick_google')!;
  const state = google.lastAuthorize!.get('state')!;
  const code = randomUUID();
  google.profiles.set(code, profile);
  const back = await ctx.venti.app.inject({
    method: 'GET',
    url: `/v1/auth/google/callback?code=${code}&state=${opts.tamperState ? 'x' + state.slice(1) : state}`,
    remoteAddress: ip,
    cookies: { lintick_google: flow },
  });
  return { status: back.statusCode, location: String(back.headers.location), session: cookieOf(back.headers['set-cookie'], 'venti_session') };
}

const me = async (token: string) => (await call(ctx, 'GET', '/v1/me', { token })).body.user;
const gmail = () => `g-${randomUUID().slice(0, 10)}@gmail.com`;

describe('ingreso con Google', () => {
  it('la ida a Google usa PKCE, state y la vuelta por la web', async () => {
    const res = await ctx.venti.app.inject({ method: 'GET', url: '/v1/auth/google/start', remoteAddress: randomIp() });
    expect(res.statusCode).toBe(302);
    expect(google.lastAuthorize!.get('redirect_uri')).toBe('https://venti.test/api/v1/auth/google/callback');
    expect(google.lastAuthorize!.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const cookie = ([] as string[]).concat(res.headers['set-cookie'] ?? []).join(';');
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
  });

  it('primera vez: crea la cuenta ya confirmada, inicia sesión y vuelve a donde estaba', async () => {
    const email = gmail();
    const r = await signIn({ sub: randomUUID(), email, emailVerified: true, name: 'Ana Pérez' }, { next: '/eventos/fiesta?x=1' });
    expect(r.status).toBe(302);
    expect(r.location).toBe('https://venti.test/eventos/fiesta?x=1');
    const u = await me(r.session!);
    expect(u).toMatchObject({ email, fullName: 'Ana Pérez', emailVerified: true });
  });

  it('la segunda vez entra a la misma cuenta aunque cambie el email en Google', async () => {
    const sub = randomUUID();
    const first = await signIn({ sub, email: gmail(), emailVerified: true, name: 'Leo' });
    const second = await signIn({ sub, email: gmail(), emailVerified: true, name: 'Leo' });
    expect((await me(second.session!)).id).toBe((await me(first.session!)).id);
  });

  it('vincula una cuenta confirmada que ya existía con ese email (sin tocar su contraseña)', async () => {
    const u = await registerUser(ctx, 'Con Contraseña');
    const r = await signIn({ sub: randomUUID(), email: u.email.toUpperCase(), emailVerified: true, name: 'Otro Nombre' });
    expect((await me(r.session!)).id).toBe(u.id);
    const login = await call(ctx, 'POST', '/v1/auth/login', { body: { email: u.email, password: u.password } });
    expect(login.status).toBe(200);
  });

  it('si alguien registró antes el email ajeno (sin confirmar), el dueño real con Google se queda con la cuenta y el intruso pierde acceso', async () => {
    const email = gmail();
    const attackerPassword = 'clave-del-intruso-123';
    await call(ctx, 'POST', '/v1/auth/register', { body: { email, password: attackerPassword, fullName: 'Intruso' } });
    const pendingLink = ctx.outbox.last(email, 'verify_email')!.meta!.token;

    const r = await signIn({ sub: randomUUID(), email, emailVerified: true, name: 'Dueña Real' });
    expect((await me(r.session!)).fullName).toBe('Dueña Real');

    // El enlace de confirmación del intruso ya no sirve, y su contraseña tampoco.
    const confirm = await call(ctx, 'POST', '/v1/auth/verify-email', { body: { token: pendingLink, password: attackerPassword } });
    expect(confirm.status).toBe(400);
    const login = await call(ctx, 'POST', '/v1/auth/login', { body: { email, password: attackerPassword } });
    expect(login.status).toBe(401);
  });

  it('rechaza un email que Google no confirmó', async () => {
    const r = await signIn({ sub: randomUUID(), email: gmail(), emailVerified: false, name: null });
    expect(r.location).toBe('https://venti.test/ingresar?google=sin_verificar');
    expect(r.session).toBeUndefined();
  });

  it('rechaza una vuelta con state distinto (otro navegador o enlace forjado)', async () => {
    const r = await signIn({ sub: randomUUID(), email: gmail(), emailVerified: true, name: null }, { tamperState: true });
    expect(r.location).toBe('https://venti.test/ingresar?google=vencido');
    expect(r.session).toBeUndefined();
  });

  it('rechaza la vuelta sin la cookie del viaje', async () => {
    const res = await ctx.venti.app.inject({ method: 'GET', url: '/v1/auth/google/callback?code=abc&state=def', remoteAddress: randomIp() });
    expect(res.headers.location).toBe('https://venti.test/ingresar?google=vencido');
  });

  it('no permite usar otra cuenta de Google para entrar a una cuenta ya vinculada por email', async () => {
    const email = gmail();
    await signIn({ sub: randomUUID(), email, emailVerified: true, name: null });
    const other = await signIn({ sub: randomUUID(), email, emailVerified: true, name: null });
    expect(other.location).toBe('https://venti.test/ingresar?google=otra_cuenta');
    expect(other.session).toBeUndefined();
  });

  it('cancelar en Google vuelve a "ingresar" con aviso', async () => {
    const res = await ctx.venti.app.inject({ method: 'GET', url: '/v1/auth/google/callback?error=access_denied', remoteAddress: randomIp() });
    expect(res.headers.location).toBe('https://venti.test/ingresar?google=cancelado');
  });

  it('el destino después de entrar sólo puede ser una página de Lintick', () => {
    expect(safeNext('/mis-entradas')).toBe('/mis-entradas');
    expect(safeNext('//evil.com')).toBe('/');
    expect(safeNext('/\\evil.com')).toBe('/');
    expect(safeNext('https://evil.com')).toBe('/');
    expect(safeNext(undefined)).toBe('/');
  });

  it('informa qué formas de ingreso hay', async () => {
    const res = await call(ctx, 'GET', '/v1/auth/providers');
    expect(res.body.google).toBe(true);
  });
});

describe('validación del id_token de Google', () => {
  const jwt = (claims: object) => `x.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.y`;
  const base = { iss: 'https://accounts.google.com', aud: 'cid', sub: '1', email: 'A@Gmail.com', email_verified: true, exp: 2_000_000_000 };

  it('acepta un token válido y normaliza el email', () => {
    expect(profileFromIdToken(jwt(base), 'cid', 1_900_000_000_000)).toMatchObject({ sub: '1', email: 'a@gmail.com', emailVerified: true });
  });
  it('rechaza otro emisor, otro destinatario o vencido', () => {
    expect(() => profileFromIdToken(jwt({ ...base, iss: 'https://evil.com' }), 'cid', 0)).toThrow();
    expect(() => profileFromIdToken(jwt({ ...base, aud: 'otra-app' }), 'cid', 0)).toThrow();
    expect(() => profileFromIdToken(jwt({ ...base, exp: 100 }), 'cid', 1_900_000_000_000)).toThrow();
  });
});
