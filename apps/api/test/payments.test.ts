import { createHmac, randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { MercadoPagoClient, MpPayment, MpPreferenceInput, MpTokens } from '../src/lib/mercadopago.ts';
import { isMpOrderId, orderToPayment } from '../src/lib/mercadopago.ts';
import { call, publishedEvent, randomIp, registerUser, setupApp, type TestContext } from './helpers.ts';

/**
 * Doble de Mercado Pago SÓLO para tests: registra lo que la API le pide y devuelve pagos que el test define.
 * En la aplicación real siempre se usa HttpMercadoPago (nunca se simulan cobros).
 */
class TestMercadoPago implements MercadoPagoClient {
  readonly preferences: { token: string; input: MpPreferenceInput; idem: string }[] = [];
  readonly payments = new Map<string, MpPayment>();
  readonly refunds: string[] = [];
  /** Cada conexión es un vendedor distinto (una cuenta de MP no puede cobrar para dos productoras). */
  lastSeller = '';
  private n = 0;
  authorizeUrl(state: string, redirectUri: string) {
    return `https://auth.mercadopago.test/authorization?state=${encodeURIComponent(state)}&redirect_uri=${encodeURIComponent(redirectUri)}`;
  }
  async exchangeCode(code: string): Promise<MpTokens> {
    if (code !== 'codigo-valido') throw new Error('código inválido');
    this.lastSeller = String(777000100 + ++this.n);
    return { accessToken: 'TEST-token-vendedor', refreshToken: 'TEST-refresh', publicKey: 'TEST-pk', userId: this.lastSeller, scope: 'read write offline_access', liveMode: false, expiresAt: new Date(Date.now() + 180 * 86_400_000) };
  }
  async refresh(): Promise<MpTokens> {
    throw new Error('no se usa');
  }
  async createPreference(token: string, input: MpPreferenceInput, idem: string) {
    this.preferences.push({ token, input, idem });
    return { id: `pref-${this.preferences.length}`, checkoutUrl: `https://www.mercadopago.test/checkout?pref=${this.preferences.length}` };
  }
  async getPayment(_token: string, id: string) {
    return this.payments.get(id) ?? null;
  }
  async searchPaymentsByReference(_token: string, ref: string) {
    return [...this.payments.values()].filter((p) => p.externalReference === ref);
  }
  async refund(_token: string, paymentId: string) {
    this.refunds.push(paymentId);
  }
}

const mp = new TestMercadoPago();
const WEBHOOK_SECRET = 'secreto-webhook-de-prueba';
let ctx: TestContext;

beforeAll(async () => {
  ctx = await setupApp({
    mercadopago: mp,
    env: { MP_CLIENT_ID: 'app-test', MP_CLIENT_SECRET: 'secret-test', PAYMENTS_ENC_KEY: randomBytes(32).toString('base64'), MP_WEBHOOK_SECRET: WEBHOOK_SECRET },
  });
});
afterAll(async () => {
  await ctx.venti.close();
  await ctx.owner.close();
});

async function connectSeller(ownerToken: string, orgId: string) {
  const start = await call(ctx, 'POST', `/v1/organizations/${orgId}/payments/mercadopago/connect`, { token: ownerToken });
  expect(start.status).toBe(200);
  const state = new URL(start.body.authorizeUrl).searchParams.get('state')!;
  const back = await call(ctx, 'GET', `/v1/payments/mercadopago/callback?code=codigo-valido&state=${encodeURIComponent(state)}`, { token: ownerToken });
  return { state, back };
}

function webhook(orgId: string, orderId: string, paymentId: string, opts: { sign?: 'ok' | 'bad' } = {}) {
  const requestId = `req-${randomBytes(4).toString('hex')}`;
  const ts = String(Math.floor(Date.now() / 1000));
  const manifest = `id:${paymentId};request-id:${requestId};ts:${ts};`;
  const v1 = opts.sign === 'bad' ? 'f'.repeat(64) : createHmac('sha256', WEBHOOK_SECRET).update(manifest).digest('hex');
  return ctx.venti.app.inject({
    method: 'POST',
    url: `/v1/webhooks/mercadopago?org=${orgId}&order=${orderId}&data.id=${paymentId}&type=payment`,
    remoteAddress: randomIp(),
    headers: opts.sign ? { 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': requestId } : {},
    payload: { type: 'payment', action: 'payment.updated', data: { id: paymentId } },
  });
}

async function holdAndCheckout(buyerToken: string, eventId: string, ticketTypeId: string, quantity = 2) {
  const hold = await call(ctx, 'POST', '/v1/holds', { token: buyerToken, body: { eventId, items: [{ ticketTypeId, quantity }] } });
  expect(hold.status).toBe(201);
  const co = await call(ctx, 'POST', `/v1/holds/${hold.body.id}/checkout`, { token: buyerToken });
  return { hold, co };
}

describe('Mercado Pago: conexión de la productora', () => {
  it('conecta con OAuth, guarda los tokens cifrados y el state sirve una sola vez', async () => {
    const owner = await registerUser(ctx);
    const { orgId } = await publishedEvent(ctx, owner.token);
    const before = await call(ctx, 'GET', `/v1/organizations/${orgId}/payments/mercadopago`, { token: owner.token });
    expect(before.body).toMatchObject({ available: true, connected: false, commissionBps: 1000 });

    const { state, back } = await connectSeller(owner.token, orgId);
    expect(back.status).toBe(302);
    expect(back.headers.location).toBe(`https://venti.test/business/${orgId}/cobros?mp=ok`);
    const after = await call(ctx, 'GET', `/v1/organizations/${orgId}/payments/mercadopago`, { token: owner.token });
    expect(after.body).toMatchObject({ connected: true, liveMode: false, sellerId: `••••${mp.lastSeller.slice(-4)}` });

    // El token NUNCA queda en claro en la base.
    const raw = await ctx.owner.pool.query('select access_token_enc, refresh_token_enc from payment_accounts where organization_id = $1', [orgId]);
    expect(raw.rows[0].access_token_enc).not.toContain('TEST-token-vendedor');
    expect(raw.rows[0].access_token_enc.startsWith('v1.')).toBe(true);

    // Reusar el mismo state no funciona.
    const replay = await call(ctx, 'GET', `/v1/payments/mercadopago/callback?code=codigo-valido&state=${encodeURIComponent(state)}`, { token: owner.token });
    expect(replay.status).toBe(400);
  });

  it('sólo dueños y finanzas pueden conectar; otra persona no puede completar una conexión ajena', async () => {
    const owner = await registerUser(ctx);
    const intruder = await registerUser(ctx);
    const { orgId } = await publishedEvent(ctx, owner.token);
    expect((await call(ctx, 'POST', `/v1/organizations/${orgId}/payments/mercadopago/connect`, { token: intruder.token })).status).toBe(404);
    const start = await call(ctx, 'POST', `/v1/organizations/${orgId}/payments/mercadopago/connect`, { token: owner.token });
    const state = new URL(start.body.authorizeUrl).searchParams.get('state')!;
    const hijack = await call(ctx, 'GET', `/v1/payments/mercadopago/callback?code=codigo-valido&state=${encodeURIComponent(state)}`, { token: intruder.token });
    expect(hijack.headers.location).toContain('mp=error&motivo=sesion');
    const st = await call(ctx, 'GET', `/v1/organizations/${orgId}/payments/mercadopago`, { token: owner.token });
    expect(st.body.connected).toBe(false);
  });
});

describe('Mercado Pago: compra', () => {
  it('sin cuenta conectada no se puede cobrar', async () => {
    const owner = await registerUser(ctx);
    const buyer = await registerUser(ctx);
    const { eventId, ticketTypeId } = await publishedEvent(ctx, owner.token);
    const { co } = await holdAndCheckout(buyer.token, eventId, ticketTypeId);
    expect(co.status).toBe(409);
    expect(co.body.error.code).toBe('seller_not_connected');
  });

  it('paga: preferencia con el cargo por servicio, el pago confirmado por la API emite las entradas una sola vez', async () => {
    const owner = await registerUser(ctx);
    const buyer = await registerUser(ctx, 'Ana Compradora');
    const { orgId, eventId, ticketTypeId } = await publishedEvent(ctx, owner.token);
    await connectSeller(owner.token, orgId);

    const { co } = await holdAndCheckout(buyer.token, eventId, ticketTypeId, 2);
    expect(co.status).toBe(200);
    expect(co.body.status).toBe('pending_payment');
    expect(co.body.checkoutUrl).toContain('mercadopago.test');
    const pref = mp.preferences.at(-1)!;
    expect(pref.token).toBe('TEST-token-vendedor'); // con el token del vendedor (el dinero va a su cuenta)
    expect(pref.input).toMatchObject({ marketplaceFee: 3000, externalReference: co.body.orderId, payerEmail: buyer.email });
    expect(pref.input.items[0]).toMatchObject({ quantity: 2, unitPrice: 15000, currency: 'ARS' });
    expect(pref.input.items[1]).toMatchObject({ id: 'cargo-servicio', quantity: 1, unitPrice: 5718.16 });
    expect(pref.input.notificationUrl).toContain(`org=${orgId}&order=${co.body.orderId}`);


    // Antes del pago: la orden espera y no hay entradas.
    expect((await call(ctx, 'GET', `/v1/orders/${co.body.orderId}`, { token: buyer.token })).body).toMatchObject({ status: 'pending_payment', tickets: 0 });

    mp.payments.set('9001', { id: '9001', status: 'approved', statusDetail: 'accredited', externalReference: co.body.orderId, transactionAmount: 35718.16, currency: 'ARS', collectorId: mp.lastSeller });
    const wh = await webhook(orgId, co.body.orderId, '9001', { sign: 'ok' });
    expect(wh.statusCode).toBe(200);
    expect((await call(ctx, 'GET', `/v1/orders/${co.body.orderId}`, { token: buyer.token })).body).toMatchObject({ status: 'paid', tickets: 2 });
    const mine = await call(ctx, 'GET', '/v1/me/tickets', { token: buyer.token });
    expect(mine.body.items).toHaveLength(2);
    expect(mine.body.items[0]).toMatchObject({ holderName: 'Ana Compradora', priceCents: 1_500_000, status: 'valid' });
    expect(mine.body.items[0].qr).toMatch(/^V1\./);

    // Mail de confirmación con el detalle de la compra (una sola vez).
    const mail = ctx.outbox.last(buyer.email, 'purchase_confirmed');
    expect(mail?.subject).toContain('Tus entradas para');
    expect(mail?.text).toContain('Total pagado: $');
    expect(mail?.text).toContain('Cargo por servicio');
    expect(mail?.text).toContain('/mis-entradas');
    expect(mail?.html).toContain('Ver mis entradas');

    // Notificación repetida: no duplica.
    await webhook(orgId, co.body.orderId, '9001', { sign: 'ok' });
    expect(ctx.outbox.sent.filter((m) => m.to === buyer.email.toLowerCase() && m.kind === 'purchase_confirmed')).toHaveLength(1);
    expect((await call(ctx, 'GET', '/v1/me/tickets', { token: buyer.token })).body.items).toHaveLength(2);

    // El stock pasó de reservado a vendido y la productora ve la plata con la comisión.
    const stats = await call(ctx, 'GET', `/v1/organizations/${orgId}/events/${eventId}/stats`, { token: owner.token });
    expect(stats.body).toMatchObject({ sold: 2, held: 0, grossCents: 3_000_000, commissionCents: 300_000, netCents: 3_000_000 });

    // Tablero de la productora: compradores, ventas del mes y actividad reciente (sólo nombre de pila).
    const ov = await call(ctx, 'GET', `/v1/organizations/${orgId}/overview`, { token: owner.token });
    expect(ov.body.totals.buyers).toBe(1);
    expect(ov.body.monthly).toHaveLength(6);
    expect(ov.body.monthly.at(-1)).toMatchObject({ grossCents: 3_000_000, tickets: 2 });
    expect(ov.body.recent[0]).toMatchObject({ orderId: co.body.orderId, buyerFirstName: 'Ana', tickets: 2, subtotalCents: 3_000_000 });
    expect(ov.body.recent[0]).not.toHaveProperty('buyerEmail');
    expect(ov.body.events[0]).toHaveProperty('coverUrl');
  });

  it('rechaza firmas falsas y no emite nada si el monto no coincide', async () => {
    const owner = await registerUser(ctx);
    const buyer = await registerUser(ctx);
    const { orgId, eventId, ticketTypeId } = await publishedEvent(ctx, owner.token);
    await connectSeller(owner.token, orgId);
    const { co } = await holdAndCheckout(buyer.token, eventId, ticketTypeId, 1);

    mp.payments.set('9002', { id: '9002', status: 'approved', statusDetail: 'accredited', externalReference: co.body.orderId, transactionAmount: 1, currency: 'ARS', collectorId: mp.lastSeller });
    expect((await webhook(orgId, co.body.orderId, '9002', { sign: 'bad' })).statusCode).toBe(401);
    expect((await webhook(orgId, co.body.orderId, '9002', { sign: 'ok' })).statusCode).toBe(200);
    expect((await call(ctx, 'GET', `/v1/orders/${co.body.orderId}`, { token: buyer.token })).body).toMatchObject({ status: 'pending_payment', tickets: 0 });

    // Un pago de OTRA orden no sirve para esta.
    mp.payments.set('9003', { id: '9003', status: 'approved', statusDetail: 'accredited', externalReference: 'otra-orden', transactionAmount: 15000, currency: 'ARS', collectorId: mp.lastSeller });
    await webhook(orgId, co.body.orderId, '9003', { sign: 'ok' });
    expect((await call(ctx, 'GET', `/v1/orders/${co.body.orderId}`, { token: buyer.token })).body.status).toBe('pending_payment');
  });

  it('si el pago llega cuando ya no queda stock, se devuelve automáticamente', async () => {
    const owner = await registerUser(ctx);
    const buyer = await registerUser(ctx);
    const { orgId, eventId, ticketTypeId } = await publishedEvent(ctx, owner.token);
    await connectSeller(owner.token, orgId);
    const { hold, co } = await holdAndCheckout(buyer.token, eventId, ticketTypeId, 1);
    // La reserva venció y otra persona se llevó todo el stock.
    await ctx.owner.pool.query("update holds set status = 'expired', closed_at = now() where id = $1", [hold.body.id]);
    await ctx.owner.pool.query('update ticket_types set held = 0, sold = capacity where id = $1', [ticketTypeId]);

    mp.payments.set('9004', { id: '9004', status: 'approved', statusDetail: 'accredited', externalReference: co.body.orderId, transactionAmount: 17859.08, currency: 'ARS', collectorId: mp.lastSeller });
    await webhook(orgId, co.body.orderId, '9004', { sign: 'ok' });
    expect((await call(ctx, 'GET', `/v1/orders/${co.body.orderId}`, { token: buyer.token })).body).toMatchObject({ status: 'refunded', tickets: 0 });
    expect(mp.refunds).toContain('9004');
  });

  it('si la notificación no llegó, la página de la compra la consulta (refresh)', async () => {
    const owner = await registerUser(ctx);
    const buyer = await registerUser(ctx);
    const { orgId, eventId, ticketTypeId } = await publishedEvent(ctx, owner.token);
    await connectSeller(owner.token, orgId);
    const { co } = await holdAndCheckout(buyer.token, eventId, ticketTypeId, 1);
    mp.payments.set('9005', { id: '9005', status: 'approved', statusDetail: 'accredited', externalReference: co.body.orderId, transactionAmount: 17859.08, currency: 'ARS', collectorId: mp.lastSeller });
    const res = await call(ctx, 'GET', `/v1/orders/${co.body.orderId}?refresh=1`, { token: buyer.token });
    expect(res.body).toMatchObject({ status: 'paid', tickets: 1 });
    // Nadie más puede ver esa compra.
    const other = await registerUser(ctx);
    expect((await call(ctx, 'GET', `/v1/orders/${co.body.orderId}`, { token: other.token })).status).toBe(404);
  });
});

describe('Mercado Pago: API de Orders', () => {
  it('traduce los estados de la orden a los de un pago', () => {
    expect(isMpOrderId('ORD01J67CQQH5904WDBVZEM4JMEP3')).toBe(true);
    expect(isMpOrderId('123456789')).toBe(false);
    const base = { id: 'ORD1', external_reference: 'ref', total_amount: '33000.00', currency: 'ARS', user_id: 777 };
    expect(orderToPayment({ ...base, status: 'processed', status_detail: 'accredited', total_paid_amount: '33000.00' })).toMatchObject({ id: 'ORD1', status: 'approved', transactionAmount: 33000, currency: 'ARS', collectorId: '777', externalReference: 'ref' });
    expect(orderToPayment({ ...base, status: 'refunded', status_detail: 'refunded' }).status).toBe('refunded');
    expect(orderToPayment({ ...base, status: 'failed', status_detail: 'rejected_by_issuer' }).status).toBe('rejected');
    expect(orderToPayment({ ...base, status: 'canceled', status_detail: 'canceled' }).status).toBe('cancelled');
    expect(orderToPayment({ ...base, status: 'action_required', status_detail: 'waiting_capture' }).status).toBe('in_process');
  });

  it('el aviso de una orden (sin ?org=&order=) emite las entradas del vendedor correcto, una sola vez', async () => {
    const owner = await registerUser(ctx);
    const buyer = await registerUser(ctx, 'Beto Comprador');
    const { orgId, eventId, ticketTypeId } = await publishedEvent(ctx, owner.token);
    await connectSeller(owner.token, orgId);
    const seller = mp.lastSeller;
    const { co } = await holdAndCheckout(buyer.token, eventId, ticketTypeId, 1);
    expect(co.status).toBe(200);
    // La orden de Mercado Pago: aprobada, con la referencia a la compra de Lintick y cobrada por ESTE vendedor.
    mp.payments.set('ORD01TESTAPROBADA', { id: 'ORD01TESTAPROBADA', status: 'approved', statusDetail: 'accredited', externalReference: co.body.orderId, transactionAmount: 17859.08, currency: 'ARS', collectorId: seller });
    const send = () =>
      ctx.venti.app.inject({ method: 'POST', url: '/v1/webhooks/mercadopago', remoteAddress: randomIp(), payload: { type: 'order', action: 'order.processed', user_id: Number(seller), data: { id: 'ORD01TESTAPROBADA' } } });
    expect((await send()).statusCode).toBe(200);
    expect((await call(ctx, 'GET', `/v1/orders/${co.body.orderId}`, { token: buyer.token })).body).toMatchObject({ status: 'paid', tickets: 1 });
    await send(); // repetido: no duplica
    expect((await call(ctx, 'GET', '/v1/me/tickets', { token: buyer.token })).body.items).toHaveLength(1);

    // Un aviso con un vendedor que no es de Lintick no hace nada.
    const res = await ctx.venti.app.inject({ method: 'POST', url: '/v1/webhooks/mercadopago', remoteAddress: randomIp(), payload: { type: 'order', user_id: 1, data: { id: 'ORD01OTRA' } } });
    expect(res.statusCode).toBe(200);
  });
});
