import { createHash, randomBytes } from 'node:crypto';
import { and, eq, orders, organizations, paymentAccounts, paymentOauthStates, sql, tickets, withContext } from '@venti/db';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { audit } from '../../lib/audit.ts';
import { inOrg, requireAuth, requireOrgPermission, type Services } from '../../lib/context.ts';
import { AppError, notFound } from '../../lib/errors.ts';
import { verifyMpSignature } from '../../lib/mercadopago.ts';
import { commissionBpsFromSettings } from '../inventory/service.ts';
import { applyPayment, paymentsEnabled, reconcileOrder, sellerAccess, startCheckout } from './service.ts';

const OrgParams = z.object({ orgId: z.string().uuid() });
const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

export async function paymentRoutes(app: FastifyInstance, s: Services): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  // La vuelta de Mercado Pago pasa por la web (/api/…) para que llegue la sesión de quien conecta.
  const redirectUri = `${s.config.PUBLIC_WEB_URL}/api/v1/payments/mercadopago/callback`;
  const panel = (orgId: string, qs: string) => `${s.config.PUBLIC_WEB_URL}/business/${orgId}/cobros?${qs}`;

  // ─── Conexión de la cuenta de la productora ───
  r.get(
    '/v1/organizations/:orgId/payments/mercadopago',
    {
      schema: {
        tags: ['payments'],
        summary: 'Estado de la cuenta de Mercado Pago de la productora',
        params: OrgParams,
        response: {
          200: z.object({
            available: z.boolean(),
            connected: z.boolean(),
            liveMode: z.boolean().nullable(),
            sellerId: z.string().nullable(),
            connectedAt: z.date().nullable(),
            expiresAt: z.date().nullable(),
            lastError: z.string().nullable(),
            commissionBps: z.number(),
          }),
        },
      },
    },
    async (req) => {
      const access = await requireOrgPermission(s.db, req, req.params.orgId, 'finance.read');
      const [acc] = await inOrg(s.db, access, (tx) => tx.select().from(paymentAccounts).where(eq(paymentAccounts.organizationId, access.orgId)));
      const [org] = await inOrg(s.db, access, (tx) => tx.select({ settings: organizations.settings }).from(organizations).where(eq(organizations.id, access.orgId)));
      const connected = Boolean(acc && acc.status === 'connected');
      return {
        available: paymentsEnabled(s),
        connected,
        liveMode: acc ? acc.liveMode : null,
        // Sólo los últimos 4 dígitos del id de vendedor (para reconocer la cuenta sin exponerla).
        sellerId: acc ? `••••${acc.providerUserId.slice(-4)}` : null,
        connectedAt: acc?.createdAt ?? null,
        expiresAt: acc?.expiresAt ?? null,
        lastError: acc?.lastError ?? null,
        commissionBps: commissionBpsFromSettings(org?.settings ?? null),
      };
    },
  );

  r.post(
    '/v1/organizations/:orgId/payments/mercadopago/connect',
    {
      config: { rateLimit: { max: 20, timeWindow: '10 minutes' } },
      schema: { tags: ['payments'], summary: 'Empezar a conectar Mercado Pago (devuelve el enlace de autorización)', params: OrgParams, response: { 200: z.object({ authorizeUrl: z.string().url() }) } },
    },
    async (req) => {
      const access = await requireOrgPermission(s.db, req, req.params.orgId, 'finance.write');
      if (!s.mp || !s.secretBox) throw new AppError(503, 'payments_disabled', 'Los cobros online todavía no están activados en Lintick.');
      const state = randomBytes(32).toString('base64url');
      await inOrg(s.db, access, (tx) =>
        tx.insert(paymentOauthStates).values({ stateHash: sha256(state), organizationId: access.orgId, userId: access.userId, expiresAt: new Date(s.now().getTime() + 15 * 60_000) }),
      );
      return { authorizeUrl: s.mp.authorizeUrl(state, redirectUri) };
    },
  );

  r.get(
    '/v1/payments/mercadopago/callback',
    {
      config: { rateLimit: { max: 30, timeWindow: '10 minutes' } },
      schema: {
        tags: ['payments'],
        summary: 'Vuelta de Mercado Pago después de autorizar (redirige al panel)',
        querystring: z.object({ code: z.string().max(400).optional(), state: z.string().max(200).optional(), error: z.string().max(200).optional() }),
      },
    },
    async (req, reply) => {
      const { code, state, error } = req.query;
      if (!state) throw new AppError(400, 'bad_state', 'Falta el identificador de la conexión.');
      // El "state" se consume una sola vez y vence a los 15 minutos.
      const rows = await withContext(s.db, {}, (tx) => tx.execute(sql`select organization_id, user_id from venti_consume_oauth_state(${sha256(state)})`));
      const found = (rows as unknown as { rows?: { organization_id: string; user_id: string }[] }).rows?.[0] ?? (rows as unknown as { organization_id: string; user_id: string }[])[0];
      if (!found) throw new AppError(400, 'bad_state', 'La conexión venció o ya se usó. Volvé a intentarlo desde el panel.');
      const orgId = found.organization_id;
      // Sólo puede completar la conexión la misma persona que la empezó (con su sesión).
      if (!req.auth || req.auth.userId !== found.user_id) return reply.redirect(panel(orgId, 'mp=error&motivo=sesion'));
      if (error || !code) return reply.redirect(panel(orgId, 'mp=cancelado'));
      if (!s.mp || !s.secretBox) return reply.redirect(panel(orgId, 'mp=error&motivo=desactivado'));
      // Revalidar el permiso (pudo cambiar en estos minutos).
      const access = await requireOrgPermission(s.db, req, orgId, 'finance.write');
      let tokens;
      try {
        tokens = await s.mp.exchangeCode(code, redirectUri);
      } catch {
        return reply.redirect(panel(orgId, 'mp=error&motivo=intercambio'));
      }
      const box = s.secretBox;
      const now = s.now();
      try {
        await inOrg(s.db, access, async (tx) => {
          const values = {
            organizationId: orgId,
            status: 'connected' as const,
            providerUserId: tokens.userId,
            accessTokenEnc: box.seal(tokens.accessToken, `mp:${orgId}`),
            refreshTokenEnc: tokens.refreshToken ? box.seal(tokens.refreshToken, `mp:${orgId}`) : null,
            publicKey: tokens.publicKey,
            scope: tokens.scope,
            liveMode: tokens.liveMode,
            expiresAt: tokens.expiresAt,
            connectedBy: access.userId,
            lastError: null,
            updatedAt: now,
          };
          await tx.insert(paymentAccounts).values(values).onConflictDoUpdate({ target: paymentAccounts.organizationId, set: values });
          await audit(tx, { orgId, actorUserId: access.userId, action: 'payments.mercadopago_connected', entityType: 'organization', entityId: orgId, data: { sellerId: tokens.userId.slice(-4), liveMode: tokens.liveMode }, ip: req.ip });
        });
      } catch (err) {
        // La misma cuenta de Mercado Pago no puede cobrar para dos productoras.
        if ((err as { cause?: { code?: string } }).cause?.code === '23505') return reply.redirect(panel(orgId, 'mp=error&motivo=cuenta_en_uso'));
        throw err;
      }
      return reply.redirect(panel(orgId, 'mp=ok'));
    },
  );

  r.delete(
    '/v1/organizations/:orgId/payments/mercadopago',
    { schema: { tags: ['payments'], summary: 'Desconectar Mercado Pago', params: OrgParams, response: { 204: z.null() } } },
    async (req, reply) => {
      const access = await requireOrgPermission(s.db, req, req.params.orgId, 'finance.write');
      await inOrg(s.db, access, async (tx) => {
        await tx.delete(paymentAccounts).where(eq(paymentAccounts.organizationId, access.orgId));
        await audit(tx, { orgId: access.orgId, actorUserId: access.userId, action: 'payments.mercadopago_disconnected', entityType: 'organization', entityId: access.orgId, ip: req.ip });
      });
      return reply.status(204).send(null);
    },
  );

  // ─── Compra ───
  r.post(
    '/v1/holds/:holdId/checkout',
    {
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
      schema: {
        tags: ['payments'],
        summary: 'Pagar una reserva (crea la orden y el enlace de pago de Mercado Pago)',
        params: z.object({ holdId: z.string().uuid() }),
        response: { 200: z.object({ orderId: z.string().uuid(), status: z.enum(['pending_payment', 'paid']), checkoutUrl: z.string().url().nullable() }) },
      },
    },
    async (req) => {
      const { userId } = requireAuth(req);
      return startCheckout(s, userId, req.params.holdId);
    },
  );

  r.get(
    '/v1/orders/:orderId',
    {
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
      schema: {
        tags: ['payments'],
        summary: 'Estado de una compra (con ?refresh=1 consulta a Mercado Pago)',
        params: z.object({ orderId: z.string().uuid() }),
        querystring: z.object({ refresh: z.enum(['0', '1']).default('0') }),
        response: {
          200: z.object({
            id: z.string().uuid(),
            status: z.enum(['pending_payment', 'paid', 'cancelled', 'expired', 'refunded', 'partially_refunded']),
            eventId: z.string().uuid(),
            totalCents: z.number(),
            currency: z.string(),
            tickets: z.number(),
          }),
        },
      },
    },
    async (req) => {
      const { userId } = requireAuth(req);
      const load = () =>
        withContext(s.db, { userId }, (tx) => tx.select().from(orders).where(and(eq(orders.id, req.params.orderId), eq(orders.buyerUserId, userId))));
      let [o] = await load();
      if (!o) throw notFound('Compra');
      if (req.query.refresh === '1' && o.status === 'pending_payment' && o.providerPreferenceId) {
        await reconcileOrder(s, o.organizationId, o.id).catch(() => undefined);
        [o] = await load();
      }
      const [count] = await withContext(s.db, { userId }, (tx) =>
        tx.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(tickets).where(and(eq(tickets.orderId, o!.id), eq(tickets.ownerUserId, userId))),
      );
      return { id: o!.id, status: o!.status, eventId: o!.eventId, totalCents: o!.totalCents, currency: o!.currency, tickets: count?.n ?? 0 };
    },
  );

  // ─── Notificaciones de Mercado Pago ───
  r.post(
    '/v1/webhooks/mercadopago',
    {
      config: { rateLimit: { max: 600, timeWindow: '1 minute' } },
      schema: {
        tags: ['payments'],
        summary: 'Notificaciones de Mercado Pago (pagos y desconexiones)',
        querystring: z.object({ org: z.string().uuid().optional(), order: z.string().uuid().optional(), 'data.id': z.string().max(64).optional(), type: z.string().max(40).optional(), topic: z.string().max(40).optional(), id: z.string().max(64).optional() }).passthrough(),
      },
    },
    async (req, reply) => {
      const q = req.query;
      const body = (req.body ?? {}) as { type?: string; action?: string; user_id?: number | string; data?: { id?: string | number } };
      const type = body.type ?? q.type ?? q.topic;
      const dataId = String(body.data?.id ?? q['data.id'] ?? q.id ?? '');

      // Si Mercado Pago firma la notificación, la firma tiene que ser válida.
      const sig = req.headers['x-signature'];
      if (s.config.MP_WEBHOOK_SECRET && typeof sig === 'string') {
        const ok = verifyMpSignature({ xSignature: sig, xRequestId: req.headers['x-request-id'] as string | undefined, dataId: q['data.id'] ?? dataId, secret: s.config.MP_WEBHOOK_SECRET });
        if (!ok) return reply.status(401).send({ error: { code: 'bad_signature', message: 'Firma inválida.' } });
      }
      if (!paymentsEnabled(s)) return reply.status(200).send({ ok: true });

      // El vendedor desconectó Lintick desde Mercado Pago.
      if (type === 'mp-connect' && body.action?.includes('deauthorized') && body.user_id !== undefined) {
        const rows = await withContext(s.db, {}, (tx) => tx.execute(sql`select venti_payment_account_org('mercadopago', ${String(body.user_id)}) as org`));
        const org = ((rows as unknown as { rows?: { org: string | null }[] }).rows?.[0] ?? (rows as unknown as { org: string | null }[])[0])?.org;
        if (org) {
          await withContext(s.db, { orgId: org }, async (tx) => {
            await tx.update(paymentAccounts).set({ status: 'revoked', lastError: 'Desconectada desde Mercado Pago.', updatedAt: s.now() }).where(eq(paymentAccounts.organizationId, org));
            await audit(tx, { orgId: org, actorUserId: null, action: 'payments.mercadopago_revoked', entityType: 'organization', entityId: org });
          });
        }
        return reply.status(200).send({ ok: true });
      }

      // Pagos: la notificación sólo dice "mirá el pago X". Lo que vale es lo que responde la API.
      if ((type === 'payment' || type === 'merchant_order' || !type) && q.org && q.order && /^\d+$/.test(dataId) && type !== 'merchant_order') {
        const seller = await sellerAccess(s, q.org).catch(() => null);
        if (!seller) return reply.status(200).send({ ok: true });
        const payment = await s.mp!.getPayment(seller.token, dataId);
        if (payment) await applyPayment(s, q.org, q.order, payment, seller.providerUserId);
      }
      return reply.status(200).send({ ok: true });
    },
  );
}
