import { createHmac, timingSafeEqual } from 'node:crypto';
import { AppError } from './errors.ts';

/**
 * Cliente de Mercado Pago (Checkout Pro, modelo marketplace).
 *
 * Fuentes verificadas (developers.mercadopago.com, 2026-11):
 *  - OAuth: GET https://auth.mercadopago.com/authorization?client_id&response_type=code&platform_id=mp&state&redirect_uri
 *           POST https://api.mercadopago.com/oauth/token (authorization_code | refresh_token, test_token)
 *  - Preferencia: POST /checkout/preferences con el access_token DEL VENDEDOR y marketplace_fee (monto, no %).
 *  - Pagos: GET /v1/payments/{id}, GET /v1/payments/search?external_reference=…, POST /v1/payments/{id}/refunds.
 *  - Firma de webhooks: SDK oficial (mercadopago@3.6.2, utils/webhook): HMAC-SHA256 en hex sobre
 *    "id:<data.id>;request-id:<x-request-id>;ts:<ts>;" omitiendo los pares que falten.
 */

export interface MpTokens {
  accessToken: string;
  refreshToken: string | null;
  publicKey: string | null;
  userId: string;
  scope: string | null;
  liveMode: boolean;
  expiresAt: Date | null;
}

export interface MpPreferenceInput {
  items: { id: string; title: string; quantity: number; unitPrice: number; currency: string }[];
  marketplaceFee: number;
  externalReference: string;
  notificationUrl: string;
  backUrl: string;
  payerEmail: string;
  expiresAt: Date;
  statementDescriptor: string;
}

export interface MpPayment {
  id: string;
  status: string;
  statusDetail: string | null;
  externalReference: string | null;
  transactionAmount: number;
  currency: string;
  collectorId: string | null;
}

export interface MercadoPagoClient {
  authorizeUrl(state: string, redirectUri: string): string;
  exchangeCode(code: string, redirectUri: string): Promise<MpTokens>;
  refresh(refreshToken: string): Promise<MpTokens>;
  createPreference(accessToken: string, input: MpPreferenceInput, idempotencyKey: string): Promise<{ id: string; checkoutUrl: string }>;
  getPayment(accessToken: string, paymentId: string): Promise<MpPayment | null>;
  searchPaymentsByReference(accessToken: string, externalReference: string): Promise<MpPayment[]>;
  refund(accessToken: string, paymentId: string, idempotencyKey: string): Promise<void>;
}

const API = 'https://api.mercadopago.com';

function toPayment(p: Record<string, unknown>): MpPayment {
  return {
    id: String(p.id),
    status: String(p.status ?? ''),
    statusDetail: p.status_detail ? String(p.status_detail) : null,
    externalReference: p.external_reference ? String(p.external_reference) : null,
    transactionAmount: Number(p.transaction_amount ?? 0),
    currency: String(p.currency_id ?? ''),
    collectorId: p.collector_id !== undefined && p.collector_id !== null ? String(p.collector_id) : null,
  };
}

function toTokens(t: Record<string, unknown>, now: Date): MpTokens {
  if (!t.access_token || t.user_id === undefined) throw new AppError(502, 'mp_bad_token', 'Mercado Pago no devolvió credenciales válidas.');
  const expiresIn = Number(t.expires_in);
  return {
    accessToken: String(t.access_token),
    refreshToken: t.refresh_token ? String(t.refresh_token) : null,
    publicKey: t.public_key ? String(t.public_key) : null,
    userId: String(t.user_id),
    scope: t.scope ? String(t.scope) : null,
    liveMode: t.live_mode === undefined ? true : Boolean(t.live_mode),
    expiresAt: Number.isFinite(expiresIn) && expiresIn > 0 ? new Date(now.getTime() + expiresIn * 1000) : null,
  };
}

export class HttpMercadoPago implements MercadoPagoClient {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly testMode: boolean;
  private readonly now: () => Date;

  constructor(clientId: string, clientSecret: string, testMode: boolean, now: () => Date = () => new Date()) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.testMode = testMode;
    this.now = now;
  }

  authorizeUrl(state: string, redirectUri: string): string {
    const qs = new URLSearchParams({ client_id: this.clientId, response_type: 'code', platform_id: 'mp', state, redirect_uri: redirectUri });
    return `https://auth.mercadopago.com/authorization?${qs}`;
  }

  protected async call(path: string, init: RequestInit & { token?: string; idem?: string }, okStatuses = [200, 201]): Promise<{ status: number; body: Record<string, unknown> }> {
    const headers: Record<string, string> = { 'content-type': 'application/json', accept: 'application/json' };
    if (init.token) headers.authorization = `Bearer ${init.token}`;
    if (init.idem) headers['x-idempotency-key'] = init.idem;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12_000);
    let res: Response;
    try {
      res = await fetch(`${API}${path}`, { ...init, headers, signal: ctrl.signal });
    } catch {
      throw new AppError(502, 'mp_unreachable', 'No pudimos comunicarnos con Mercado Pago. Probá de nuevo en unos segundos.');
    } finally {
      clearTimeout(timer);
    }
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!okStatuses.includes(res.status)) {
      const detail = typeof body.message === 'string' ? body.message : typeof body.error === 'string' ? body.error : `HTTP ${res.status}`;
      throw new AppError(502, 'mp_error', `Mercado Pago rechazó la operación (${detail}).`, { status: res.status });
    }
    return { status: res.status, body };
  }

  async exchangeCode(code: string, redirectUri: string): Promise<MpTokens> {
    const { body } = await this.call('/oauth/token', {
      method: 'POST',
      body: JSON.stringify({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        test_token: this.testMode ? 'true' : 'false',
      }),
    });
    return toTokens(body, this.now());
  }

  async refresh(refreshToken: string): Promise<MpTokens> {
    const { body } = await this.call('/oauth/token', {
      method: 'POST',
      body: JSON.stringify({ client_id: this.clientId, client_secret: this.clientSecret, grant_type: 'refresh_token', refresh_token: refreshToken }),
    });
    return toTokens(body, this.now());
  }

  async createPreference(accessToken: string, p: MpPreferenceInput, idempotencyKey: string) {
    const { body } = await this.call('/checkout/preferences', {
      method: 'POST',
      token: accessToken,
      idem: idempotencyKey,
      body: JSON.stringify({
        items: p.items.map((i) => ({ id: i.id, title: i.title, quantity: i.quantity, unit_price: i.unitPrice, currency_id: i.currency })),
        marketplace_fee: p.marketplaceFee,
        external_reference: p.externalReference,
        notification_url: p.notificationUrl,
        back_urls: { success: p.backUrl, pending: p.backUrl, failure: p.backUrl },
        auto_return: 'approved',
        // Sólo aprobado o rechazado: nada de pagos "pendientes" en efectivo que lleguen después de que venza la reserva.
        binary_mode: true,
        expires: true,
        expiration_date_to: p.expiresAt.toISOString(),
        payer: { email: p.payerEmail },
        statement_descriptor: p.statementDescriptor,
      }),
    });
    const url = (this.testMode ? body.sandbox_init_point : body.init_point) ?? body.init_point;
    if (!body.id || !url) throw new AppError(502, 'mp_bad_preference', 'Mercado Pago no devolvió el enlace de pago.');
    return { id: String(body.id), checkoutUrl: String(url) };
  }

  async getPayment(accessToken: string, paymentId: string): Promise<MpPayment | null> {
    try {
      const { body } = await this.call(`/v1/payments/${encodeURIComponent(paymentId)}`, { method: 'GET', token: accessToken });
      return toPayment(body);
    } catch (err) {
      if (err instanceof AppError && (err.details as { status?: number } | undefined)?.status === 404) return null;
      throw err;
    }
  }

  async searchPaymentsByReference(accessToken: string, externalReference: string): Promise<MpPayment[]> {
    const qs = new URLSearchParams({ external_reference: externalReference, sort: 'date_created', criteria: 'desc' });
    const { body } = await this.call(`/v1/payments/search?${qs}`, { method: 'GET', token: accessToken });
    const results = Array.isArray(body.results) ? (body.results as Record<string, unknown>[]) : [];
    return results.map(toPayment);
  }

  async refund(accessToken: string, paymentId: string, idempotencyKey: string): Promise<void> {
    await this.call(`/v1/payments/${encodeURIComponent(paymentId)}/refunds`, { method: 'POST', token: accessToken, idem: idempotencyKey, body: '{}' });
  }
}

/** Verificación de la firma x-signature (misma regla que el SDK oficial). */
export function verifyMpSignature(opts: { xSignature: string | undefined; xRequestId: string | undefined; dataId: string | undefined; secret: string }): boolean {
  const header = opts.xSignature?.trim();
  if (!header) return false;
  let ts: string | undefined;
  let v1: string | undefined;
  for (const part of header.split(',')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim().toLowerCase();
    const v = part.slice(i + 1).trim();
    if (k === 'ts') ts = v;
    if (k === 'v1') v1 = v;
  }
  if (!ts || !/^\d+$/.test(ts) || !v1) return false;
  const parts: string[] = [];
  if (opts.dataId?.trim()) parts.push(`id:${opts.dataId.trim()}`);
  if (opts.xRequestId?.trim()) parts.push(`request-id:${opts.xRequestId.trim()}`);
  parts.push(`ts:${ts}`);
  const expected = createHmac('sha256', opts.secret).update(parts.join(';') + ';').digest('hex');
  return expected.length === v1.length && timingSafeEqual(Buffer.from(expected), Buffer.from(v1));
}

/** Ids de órdenes de la API de Orders (ej. "ORD01J…"); los pagos clásicos son numéricos. */
export const isMpOrderId = (id: string) => /^ORD[0-9A-Z]+$/.test(id);

/**
 * Estado de una orden (API de Orders) traducido al de un pago clásico, para reusar la misma lógica de cobro:
 *  processed/accredited → approved · refunded → refunded · failed → rejected · canceled → cancelled · resto → in_process.
 * El id de "pago" es el id de la orden de Mercado Pago (es lo que se consulta y se devuelve).
 */
export function orderToPayment(o: Record<string, unknown>): MpPayment {
  const status = String(o.status ?? '');
  const detail = o.status_detail ? String(o.status_detail) : null;
  const mapped =
    status === 'processed' && detail !== 'partially_refunded' ? 'approved'
    : status === 'processed' ? 'approved'
    : status === 'refunded' ? 'refunded'
    : status === 'failed' ? 'rejected'
    : status === 'canceled' ? 'cancelled'
    : 'in_process';
  const paid = Number(o.total_paid_amount ?? 0);
  return {
    id: String(o.id),
    status: mapped,
    statusDetail: detail,
    externalReference: o.external_reference ? String(o.external_reference) : null,
    transactionAmount: paid > 0 ? paid : Number(o.total_amount ?? 0),
    currency: String(o.currency ?? ''),
    collectorId: o.user_id !== undefined && o.user_id !== null ? String(o.user_id) : null,
  };
}

/**
 * Checkout Pro con la API de Orders (la que Mercado Pago recomienda para integraciones nuevas).
 * Misma interfaz que la de Preferences: el resto de Lintick no cambia. Se activa con MP_INTEGRATION=orders.
 */
export class HttpMercadoPagoOrders extends HttpMercadoPago {
  override async createPreference(accessToken: string, p: MpPreferenceInput, idempotencyKey: string) {
    const money = (n: number) => n.toFixed(2);
    const items = p.items.map((i) => ({ external_code: i.id, title: i.title, quantity: i.quantity, unit_price: money(i.unitPrice) }));
    const total = p.items.reduce((a, i) => a + Math.round(i.unitPrice * 100) * i.quantity, 0) / 100;
    const minutes = Math.max(5, Math.floor((p.expiresAt.getTime() - Date.now()) / 60_000));
    const { body } = await this.call('/v1/orders', {
      method: 'POST',
      token: accessToken,
      idem: idempotencyKey,
      body: JSON.stringify({
        type: 'online',
        processing_mode: 'manual',
        total_amount: money(total),
        external_reference: p.externalReference,
        marketplace_fee: money(p.marketplaceFee),
        expiration_time: `PT${minutes}M`,
        payer: { email: p.payerEmail },
        items,
        config: {
          statement_descriptor: p.statementDescriptor,
          online: { success_url: p.backUrl, failure_url: p.backUrl, pending_url: p.backUrl, auto_return: 'approved' },
        },
      }),
    });
    if (!body.id || !body.checkout_url) throw new AppError(502, 'mp_bad_order', 'Mercado Pago no devolvió el enlace de pago.');
    return { id: String(body.id), checkoutUrl: String(body.checkout_url) };
  }

  override async getPayment(accessToken: string, paymentId: string): Promise<MpPayment | null> {
    if (!isMpOrderId(paymentId)) return super.getPayment(accessToken, paymentId);
    try {
      const { body } = await this.call(`/v1/orders/${encodeURIComponent(paymentId)}`, { method: 'GET', token: accessToken });
      return orderToPayment(body);
    } catch (err) {
      if (err instanceof AppError && (err.details as { status?: number } | undefined)?.status === 404) return null;
      throw err;
    }
  }

  override async refund(accessToken: string, paymentId: string, idempotencyKey: string): Promise<void> {
    if (!isMpOrderId(paymentId)) return super.refund(accessToken, paymentId, idempotencyKey);
    // Sin cuerpo = devolución total.
    await this.call(`/v1/orders/${encodeURIComponent(paymentId)}/refund`, { method: 'POST', token: accessToken, idem: idempotencyKey });
  }
}

