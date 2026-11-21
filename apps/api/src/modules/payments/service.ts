import { randomUUID } from 'node:crypto';
import { transitionTicket } from '@venti/domain';
import {
  and,
  eq,
  events,
  holdItems,
  holds,
  orders,
  paymentAccounts,
  payments,
  priceStages,
  sql,
  ticketTypes,
  tickets,
  users,
  withContext,
  type Tx,
} from '@venti/db';
import { audit, recordTicketEvents } from '../../lib/audit.ts';
import type { Services } from '../../lib/context.ts';
import { AppError, conflict, notFound } from '../../lib/errors.ts';
import { isMpOrderId, type MpPayment } from '../../lib/mercadopago.ts';

/** Minutos extra que se le dan a una reserva cuando la persona pasa a pagar (una sola vez). */
const PAY_WINDOW_MINUTES = 15;

export function paymentsEnabled(s: Services): boolean {
  return Boolean(s.mp && s.secretBox);
}

function requirePayments(s: Services) {
  if (!s.mp || !s.secretBox) {
    throw new AppError(503, 'payments_disabled', 'Los cobros online todavía no están activados en Lintick.');
  }
  return { mp: s.mp, box: s.secretBox };
}

/** Token del vendedor, descifrado; si vence en menos de 7 días, se renueva y se guarda el nuevo. */
export async function sellerAccess(s: Services, orgId: string): Promise<{ token: string; providerUserId: string; liveMode: boolean }> {
  const { mp, box } = requirePayments(s);
  const [acc] = await withContext(s.db, { orgId }, (tx) => tx.select().from(paymentAccounts).where(eq(paymentAccounts.organizationId, orgId)));
  if (!acc || acc.status !== 'connected') {
    throw conflict('seller_not_connected', 'La productora todavía no conectó su cuenta de Mercado Pago, así que no puede cobrar online.');
  }
  let token = box.open(acc.accessTokenEnc, `mp:${orgId}`);
  const soon = s.now().getTime() + 7 * 86_400_000;
  if (acc.expiresAt && acc.expiresAt.getTime() < soon && acc.refreshTokenEnc) {
    try {
      const fresh = await mp.refresh(box.open(acc.refreshTokenEnc, `mp:${orgId}`));
      token = fresh.accessToken;
      await withContext(s.db, { orgId }, (tx) =>
        tx
          .update(paymentAccounts)
          .set({
            accessTokenEnc: box.seal(fresh.accessToken, `mp:${orgId}`),
            refreshTokenEnc: fresh.refreshToken ? box.seal(fresh.refreshToken, `mp:${orgId}`) : acc.refreshTokenEnc,
            expiresAt: fresh.expiresAt,
            lastError: null,
            updatedAt: s.now(),
          })
          .where(eq(paymentAccounts.organizationId, orgId)),
      );
    } catch (err) {
      // Si la renovación falla pero el token todavía sirve, se sigue; el error queda anotado.
      await withContext(s.db, { orgId }, (tx) =>
        tx.update(paymentAccounts).set({ lastError: err instanceof Error ? err.message.slice(0, 300) : 'refresh_failed', updatedAt: s.now() }).where(eq(paymentAccounts.organizationId, orgId)),
      );
      if (acc.expiresAt.getTime() <= s.now().getTime()) throw new AppError(502, 'mp_token_expired', 'La conexión con Mercado Pago venció. La productora tiene que volver a conectarla.');
    }
  }
  return { token, providerUserId: acc.providerUserId, liveMode: acc.liveMode };
}

// ─── Compra: reserva → orden → enlace de pago ───
export async function startCheckout(s: Services, userId: string, holdId: string): Promise<{ orderId: string; status: 'pending_payment' | 'paid'; checkoutUrl: string | null }> {
  const now = s.now();
  const [h] = await withContext(s.db, { userId }, (tx) => tx.select().from(holds).where(and(eq(holds.id, holdId), eq(holds.userId, userId))));
  if (!h) throw notFound('Reserva');
  if (h.status !== 'active' || h.expiresAt <= now) throw conflict('hold_not_active', 'La reserva venció. Volvé a elegir tus entradas.');
  const [buyer] = await withContext(s.db, { userId }, (tx) => tx.select({ email: users.email, fullName: users.fullName }).from(users).where(eq(users.id, userId)));
  if (!buyer) throw notFound('Usuario');

  // Entradas gratuitas: no hay nada que cobrar, se emiten al instante.
  if (h.subtotalCents + h.feeCents === 0) {
    const orderId = await withContext(s.db, { orgId: h.organizationId, userId }, async (tx) => {
      const order = await upsertOrder(tx, h, userId);
      if (order.status === 'pending_payment') await fulfillOrder(tx, s, order.id, null);
      return order.id;
    });
    return { orderId, status: 'paid', checkoutUrl: null };
  }

  const { mp } = requirePayments(s);
  const seller = await sellerAccess(s, h.organizationId);
  const prepared = await withContext(s.db, { orgId: h.organizationId, userId }, async (tx) => {
    const order = await upsertOrder(tx, h, userId);
    if (order.status !== 'pending_payment') return { order, items: [], title: '' };
    // Tiempo para pagar: se extiende la reserva una vez (no se puede estirar indefinidamente).
    const maxExpiry = new Date(now.getTime() + PAY_WINDOW_MINUTES * 60_000);
    if (h.expiresAt < maxExpiry && !order.providerPreferenceId) {
      await tx.update(holds).set({ expiresAt: maxExpiry }).where(and(eq(holds.id, h.id), eq(holds.status, 'active')));
    }
    const [ev] = await tx.select({ title: events.title }).from(events).where(eq(events.id, h.eventId));
    const items = await tx
      .select({ ticketTypeId: holdItems.ticketTypeId, quantity: holdItems.quantity, unitPriceCents: holdItems.unitPriceCents, name: ticketTypes.name, currency: ticketTypes.currency })
      .from(holdItems)
      .innerJoin(ticketTypes, eq(ticketTypes.id, holdItems.ticketTypeId))
      .where(eq(holdItems.holdId, h.id));
    return { order, items, title: ev?.title ?? 'Evento' };
  });
  if (prepared.order.status === 'paid') return { orderId: prepared.order.id, status: 'paid', checkoutUrl: null };
  if (prepared.order.status !== 'pending_payment') throw conflict('order_closed', 'Esta compra ya no se puede pagar.');

  const [fresh] = await withContext(s.db, { userId }, (tx) => tx.select({ expiresAt: holds.expiresAt }).from(holds).where(eq(holds.id, h.id)));
  const pref = await mp.createPreference(
    seller.token,
    {
      items: prepared.items.map((i) => ({
        id: i.ticketTypeId,
        title: `${i.name} — ${prepared.title}`.slice(0, 250),
        quantity: i.quantity,
        unitPrice: i.unitPriceCents / 100,
        currency: i.currency,
      })).concat(
        // El cargo por servicio va como ítem aparte: el comprador lo ve en Mercado Pago y es lo que retiene Lintick.
        prepared.order.feeCents > 0
          ? [{ id: 'cargo-servicio', title: 'Cargo por servicio Lintick', quantity: 1, unitPrice: prepared.order.feeCents / 100, currency: prepared.order.currency }]
          : [],
      ),
      // Lintick retiene exactamente el cargo por servicio: la productora recibe el precio completo de las entradas.
      marketplaceFee: prepared.order.feeCents / 100,
      externalReference: prepared.order.id,
      notificationUrl: `${s.config.PUBLIC_API_URL}/v1/webhooks/mercadopago?org=${h.organizationId}&order=${prepared.order.id}`,
      backUrl: `${s.config.PUBLIC_WEB_URL}/compra/${prepared.order.id}`,
      payerEmail: buyer.email,
      expiresAt: fresh?.expiresAt ?? new Date(now.getTime() + PAY_WINDOW_MINUTES * 60_000),
      statementDescriptor: 'LINTICK',
    },
    `pref-${prepared.order.id}`,
  );
  await withContext(s.db, { orgId: h.organizationId, userId }, (tx) =>
    tx.update(orders).set({ providerPreferenceId: pref.id, updatedAt: s.now() }).where(eq(orders.id, prepared.order.id)),
  );
  return { orderId: prepared.order.id, status: 'pending_payment', checkoutUrl: pref.checkoutUrl };
}

/** Una orden por reserva (idempotente: volver a tocar "Pagar" reutiliza la misma). */
async function upsertOrder(tx: Tx, h: typeof holds.$inferSelect, userId: string) {
  const [existing] = await tx.select().from(orders).where(and(eq(orders.buyerUserId, userId), eq(orders.idempotencyKey, `hold:${h.id}`)));
  if (existing) return existing;
  const [created] = await tx
    .insert(orders)
    .values({
      id: randomUUID(),
      organizationId: h.organizationId,
      eventId: h.eventId,
      buyerUserId: userId,
      holdId: h.id,
      currency: h.currency,
      subtotalCents: h.subtotalCents,
      feeCents: h.feeCents,
      totalCents: h.subtotalCents + h.feeCents,
      commissionBps: h.commissionBps,
      commissionCents: h.commissionCents,
      idempotencyKey: `hold:${h.id}`,
    })
    .returning();
  return created!;
}

class OutOfStock extends Error {}

/**
 * Emite las entradas de una orden pagada. Si la reserva sigue viva, convierte lo reservado en vendido;
 * si ya venció, intenta tomar stock otra vez (al mismo precio pagado). Sin stock ⇒ OutOfStock (se devuelve el pago).
 */
async function fulfillOrder(tx: Tx, s: Services, orderId: string, paymentId: string | null): Promise<void> {
  const now = s.now();
  const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for('update');
  if (!order || order.status !== 'pending_payment') return;
  const [h] = order.holdId ? await tx.select().from(holds).where(eq(holds.id, order.holdId)).for('update') : [];
  if (!h) throw new OutOfStock();
  const items = await tx.select().from(holdItems).where(eq(holdItems.holdId, h.id));
  const [buyer] = await tx.select({ email: users.email, fullName: users.fullName }).from(users).where(eq(users.id, order.buyerUserId));

  if (h.status === 'active') {
    for (const it of items) {
      await tx.update(ticketTypes).set({ held: sql`${ticketTypes.held} - ${it.quantity}`, sold: sql`${ticketTypes.sold} + ${it.quantity}` }).where(eq(ticketTypes.id, it.ticketTypeId));
      if (it.priceStageId) {
        await tx.update(priceStages).set({ heldCount: sql`${priceStages.heldCount} - ${it.quantity}`, soldCount: sql`${priceStages.soldCount} + ${it.quantity}` }).where(eq(priceStages.id, it.priceStageId));
      }
    }
    await tx.update(holds).set({ status: 'converted', closedAt: now }).where(eq(holds.id, h.id));
  } else {
    // La reserva venció mientras pagaba: se intenta tomar el stock de nuevo.
    for (const it of items) {
      const ok = await tx
        .update(ticketTypes)
        .set({ sold: sql`${ticketTypes.sold} + ${it.quantity}` })
        .where(and(eq(ticketTypes.id, it.ticketTypeId), sql`${ticketTypes.sold} + ${ticketTypes.held} + ${it.quantity} <= ${ticketTypes.capacity}`))
        .returning({ id: ticketTypes.id });
      if (ok.length === 0) throw new OutOfStock();
      if (it.priceStageId) {
        const st = await tx
          .update(priceStages)
          .set({ soldCount: sql`${priceStages.soldCount} + ${it.quantity}` })
          .where(and(eq(priceStages.id, it.priceStageId), sql`(${priceStages.quantityLimit} IS NULL OR ${priceStages.soldCount} + ${priceStages.heldCount} + ${it.quantity} <= ${priceStages.quantityLimit})`))
          .returning({ id: priceStages.id });
        if (st.length === 0) throw new OutOfStock();
      }
    }
  }

  const rows = items.flatMap((it) =>
    Array.from({ length: it.quantity }, () => ({
      id: randomUUID(),
      organizationId: order.organizationId,
      eventId: order.eventId,
      ticketTypeId: it.ticketTypeId,
      orderId: order.id,
      ownerUserId: order.buyerUserId,
      holderName: buyer?.fullName ?? 'Titular',
      holderEmail: buyer?.email ?? '',
      priceCents: it.unitPriceCents,
      currency: order.currency,
    })),
  );
  if (rows.length > 0) await tx.insert(tickets).values(rows);
  await recordTicketEvents(
    tx,
    rows.map((r) => ({ orgId: order.organizationId, ticketId: r.id, type: 'issued', actorUserId: null, data: { reason: 'purchase', orderId: order.id, paymentId } })),
  );
  await tx.update(orders).set({ status: 'paid', paidAt: now, updatedAt: now }).where(eq(orders.id, order.id));
  await audit(tx, { orgId: order.organizationId, actorUserId: null, action: 'order.paid', entityType: 'order', entityId: order.id, data: { paymentId, tickets: rows.length, totalCents: order.totalCents } });
}

/**
 * Aplica el estado REAL de un pago (leído de la API de Mercado Pago con el token del vendedor).
 * Verifica referencia, monto, moneda y cobrador antes de emitir nada. Idempotente.
 */
export async function applyPayment(s: Services, orgId: string, orderId: string, payment: MpPayment, sellerUserId: string): Promise<'paid' | 'ignored' | 'mismatch' | 'refunded' | 'pending'> {
  if (payment.externalReference !== orderId) return 'ignored';
  const now = s.now();
  let needsRefund = false;
  const outcome = await withContext(s.db, { orgId }, async (tx) => {
    const [order] = await tx.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.organizationId, orgId))).for('update');
    if (!order) return 'ignored' as const;
    const amountCents = Math.round(payment.transactionAmount * 100);
    const matches = amountCents === order.totalCents && payment.currency === order.currency && (payment.collectorId === null || payment.collectorId === sellerUserId);
    await tx
      .insert(payments)
      .values({ id: randomUUID(), organizationId: orgId, orderId, providerPaymentId: payment.id, status: matches ? payment.status : `mismatch:${payment.status}`, statusDetail: payment.statusDetail, amountCents, currency: order.currency })
      .onConflictDoUpdate({ target: [payments.provider, payments.providerPaymentId], set: { status: matches ? payment.status : `mismatch:${payment.status}`, statusDetail: payment.statusDetail, updatedAt: now } });

    if (!matches) {
      await audit(tx, { orgId, actorUserId: null, action: 'payment.mismatch', entityType: 'order', entityId: orderId, data: { paymentId: payment.id, amountCents, expected: order.totalCents, currency: payment.currency, collectorId: payment.collectorId } });
      return 'mismatch' as const;
    }
    if (payment.status === 'approved') {
      if (order.status === 'paid') return 'paid' as const;
      if (order.status !== 'pending_payment') {
        // Pago aprobado de una orden ya cerrada (p. ej. evento cancelado): se devuelve.
        needsRefund = true;
        return 'refunded' as const;
      }
      try {
        await tx.execute(sql`savepoint fulfill`);
        await fulfillOrder(tx, s, orderId, payment.id);
        await tx.execute(sql`release savepoint fulfill`);
        return 'paid' as const;
      } catch (err) {
        if (!(err instanceof OutOfStock)) throw err;
        await tx.execute(sql`rollback to savepoint fulfill`);
        needsRefund = true;
        await tx.update(orders).set({ status: 'refunded', updatedAt: now }).where(eq(orders.id, orderId));
        await audit(tx, { orgId, actorUserId: null, action: 'order.refunded_out_of_stock', entityType: 'order', entityId: orderId, data: { paymentId: payment.id } });
        return 'refunded' as const;
      }
    }
    if ((payment.status === 'refunded' || payment.status === 'charged_back') && order.status === 'paid') {
      const issued = await tx.select().from(tickets).where(eq(tickets.orderId, orderId));
      for (const t of issued) {
        if (t.status === 'valid' || t.status === 'locked' || t.status === 'cancelled') {
          await tx.update(tickets).set({ status: transitionTicket(t.status, 'refund'), updatedAt: now }).where(eq(tickets.id, t.id));
          await tx.update(ticketTypes).set({ sold: sql`greatest(${ticketTypes.sold} - 1, 0)` }).where(eq(ticketTypes.id, t.ticketTypeId));
        }
      }
      await recordTicketEvents(tx, issued.map((t) => ({ orgId, ticketId: t.id, type: 'refunded', actorUserId: null, data: { paymentId: payment.id, status: payment.status } })));
      await tx.update(orders).set({ status: 'refunded', updatedAt: now }).where(eq(orders.id, orderId));
      await audit(tx, { orgId, actorUserId: null, action: 'order.refunded', entityType: 'order', entityId: orderId, data: { paymentId: payment.id, status: payment.status } });
      return 'refunded' as const;
    }
    return 'pending' as const;
  });

  if (needsRefund) {
    // Fuera de la transacción: llamada a Mercado Pago (idempotente por clave).
    const seller = await sellerAccess(s, orgId);
    await s.mp!.refund(seller.token, payment.id, `refund-${orderId}-${payment.id}`);
  }
  return outcome;
}

/** Consulta a Mercado Pago los pagos de una orden (por si la notificación todavía no llegó). */
export async function reconcileOrder(s: Services, orgId: string, orderId: string): Promise<void> {
  if (!paymentsEnabled(s)) return;
  const seller = await sellerAccess(s, orgId);
  const [o] = await withContext(s.db, { orgId }, (tx) => tx.select({ providerId: orders.providerPreferenceId }).from(orders).where(eq(orders.id, orderId)));
  if (o?.providerId && isMpOrderId(o.providerId)) {
    const p = await s.mp!.getPayment(seller.token, o.providerId);
    if (p) await applyPayment(s, orgId, orderId, p, seller.providerUserId);
    return;
  }
  const found = await s.mp!.searchPaymentsByReference(seller.token, orderId);
  for (const p of found) await applyPayment(s, orgId, orderId, p, seller.providerUserId);
}
