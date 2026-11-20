import { randomInt, randomUUID } from 'node:crypto';
import { generateQrKeyPair } from '@venti/domain';
import { createDb, type DbHandle } from '@venti/db';
import '@venti/db/testing';
import { inject } from 'vitest';
import { randomBytes } from 'node:crypto';
import { buildApp, type VentiApp } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';
import { OutboxSender } from '../src/lib/email.ts';
import type { MercadoPagoClient } from '../src/lib/mercadopago.ts';

export interface TestContext {
  readonly venti: VentiApp;
  /** Conexión con el rol dueño: sólo para preparar escenarios (p. ej. vencer una reserva). */
  readonly owner: DbHandle;
  /** Buzón en memoria: los emails que "enviaría" la API. */
  readonly outbox: OutboxSender;
}

export async function setupApp(opts: { env?: Record<string, string>; mercadopago?: MercadoPagoClient } = {}): Promise<TestContext> {
  const config = loadConfig({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    DATABASE_URL: inject('appDatabaseUrl'),
    DATABASE_POOL_MAX: '30',
    QR_SIGNING_PRIVATE_KEY: generateQrKeyPair().privateKeyPem,
    COOKIE_SECURE: 'false',
    EMAIL_PROVIDER: 'outbox',
    DOC_HMAC_KEY: randomBytes(32).toString('base64'),
    PUBLIC_WEB_URL: 'https://venti.test',
    ...opts.env,
  });
  const outbox = new OutboxSender(false);
  const venti = await buildApp({ config, email: outbox, ...(opts.mercadopago ? { mercadopago: opts.mercadopago } : {}) });
  await venti.app.ready();
  return { venti, owner: createDb(inject('ownerDatabaseUrl'), { max: 2 }), outbox };
}

/** IP aleatoria por request: el rate limit es por IP y los tests no deben interferir entre sí. */
export const randomIp = () => `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`;

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export async function call<T = any>(ctx: TestContext, method: Method, url: string, opts: { token?: string; body?: unknown; ip?: string } = {}) {
  const res = await ctx.venti.app.inject({
    method,
    url,
    remoteAddress: opts.ip ?? randomIp(),
    headers: opts.token ? { authorization: `Bearer ${opts.token}` } : {},
    ...(opts.body !== undefined ? { payload: opts.body as object } : {}),
  });
  return { status: res.statusCode, body: (res.body ? res.json() : null) as T, headers: res.headers };
}

export async function registerUser(ctx: TestContext, name = 'Usuario Test') {
  const email = `u-${randomUUID().slice(0, 12)}@venti.test`;
  const password = 'clave-super-segura-123';
  const res = await call(ctx, 'POST', '/v1/auth/register', { body: { email, password, fullName: name } });
  if (res.status !== 202) throw new Error(`registro falló: ${res.status} ${JSON.stringify(res.body)}`);
  const verified = await confirmEmail(ctx, email, password);
  return { id: verified.user.id as string, email, password, token: verified.token as string };
}

/** Confirma el email usando el último enlace del buzón en memoria. */
export async function confirmEmail(ctx: TestContext, email: string, password: string) {
  const msg = ctx.outbox.last(email, 'verify_email');
  if (!msg?.meta?.token) throw new Error(`no llegó el email de confirmación a ${email}`);
  const res = await call(ctx, 'POST', '/v1/auth/verify-email', { body: { token: msg.meta.token, password } });
  if (res.status !== 200) throw new Error(`confirmación falló: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

/** Calcula un CUIT válido a partir de un prefijo de 10 dígitos. */
export function validCuit(prefix10 = '2012345678'): string {
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  for (let attempt = 0; attempt < 100; attempt++) {
    const base = (BigInt(prefix10) + BigInt(attempt)).toString().padStart(10, '0');
    const sum = weights.reduce((acc, w, i) => acc + w * Number(base[i]), 0);
    let check = 11 - (sum % 11);
    if (check === 11) check = 0;
    if (check !== 10) return base + check;
  }
  throw new Error('no se pudo generar CUIT');
}

export const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

/** Crea organización + lugar + evento publicado con un tipo de entrada. Devuelve ids. */
export async function publishedEvent(
  ctx: TestContext,
  ownerToken: string,
  ticketType: Record<string, unknown> = { name: 'General', kind: 'general', capacity: 100, stages: [{ name: 'General', priceCents: 1_500_000 }] },
) {
  const org = await call(ctx, 'POST', '/v1/organizations', { token: ownerToken, body: { name: `Productora ${randomUUID().slice(0, 8)}` } });
  const orgId = org.body.id as string;
  const venue = await call(ctx, 'POST', `/v1/organizations/${orgId}/venues`, {
    token: ownerToken,
    body: { name: 'Estadio Test', address: 'Av. Siempre Viva 123', city: 'Córdoba', province: 'Córdoba' },
  });
  const event = await call(ctx, 'POST', `/v1/organizations/${orgId}/events`, {
    token: ownerToken,
    body: { title: `Festival ${randomUUID().slice(0, 6)}`, category: 'music', venueId: venue.body.id, startsAt: inDays(30), endsAt: inDays(31) },
  });
  const eventId = event.body.id as string;
  const tt = await call(ctx, 'POST', `/v1/organizations/${orgId}/events/${eventId}/ticket-types`, { token: ownerToken, body: ticketType });
  if (tt.status !== 201) throw new Error(`ticket type falló: ${JSON.stringify(tt.body)}`);
  const pub = await call(ctx, 'POST', `/v1/organizations/${orgId}/events/${eventId}/publish`, { token: ownerToken });
  if (pub.status !== 200) throw new Error(`publish falló: ${JSON.stringify(pub.body)}`);
  return { orgId, eventId, ticketTypeId: tt.body.id as string };
}
