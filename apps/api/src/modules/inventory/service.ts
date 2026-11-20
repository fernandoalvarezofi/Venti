import { randomUUID } from 'node:crypto';
import { DEFAULT_BUYER_FEE_BPS, DomainError, MAX_BUYER_FEE_BPS, buyerFeeCents, resolveActiveStage } from '@venti/domain';
import {
  and,
  asc,
  eq,
  events,
  holdItems,
  holds,
  inArray,
  organizations,
  priceStages,
  sql,
  ticketTypes,
  withContext,
  type Db,
  type Tx,
} from '@venti/db';
import { AppError, conflict, notFound } from '../../lib/errors.ts';

export interface HoldRequestItem {
  readonly ticketTypeId: string;
  readonly quantity: number;
}

export interface QuoteLine {
  ticketTypeId: string;
  ticketTypeName: string;
  stageId: string;
  stageName: string;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
}

export interface Quote {
  eventId: string;
  currency: string;
  lines: QuoteLine[];
  subtotalCents: number;
  feeCents: number;
  feeBps: number;
  totalCents: number;
}

export interface HoldView {
  readonly id: string;
  readonly eventId: string;
  readonly status: 'active' | 'converted' | 'expired' | 'released';
  readonly expiresAt: Date;
  readonly currency: string;
  readonly subtotalCents: number;
  readonly feeCents: number;
  readonly totalCents: number;
  readonly items: { ticketTypeId: string; ticketTypeName: string; stageName: string | null; quantity: number; unitPriceCents: number }[];
}

/** Límite de unidades por compra entre todos los tipos (anti-acaparamiento). */
export const MAX_UNITS_PER_HOLD = 20;

export function feeBpsFromSettings(settings: unknown): number {
  const raw = (settings as { buyerFeeBps?: unknown } | null)?.buyerFeeBps;
  return typeof raw === 'number' && Number.isSafeInteger(raw) && raw >= 0 && raw <= MAX_BUYER_FEE_BPS ? raw : DEFAULT_BUYER_FEE_BPS;
}

function validateItems(items: readonly HoldRequestItem[]): string[] {
  const totalUnits = items.reduce((a, i) => a + i.quantity, 0);
  if (totalUnits > MAX_UNITS_PER_HOLD) throw new AppError(422, 'hold.too_many_units', `Máximo ${MAX_UNITS_PER_HOLD} entradas por compra.`);
  const ids = items.map((i) => i.ticketTypeId);
  if (new Set(ids).size !== ids.length) throw new AppError(400, 'hold.duplicate_items', 'Cada tipo de entrada debe aparecer una sola vez.');
  return ids;
}

interface SaleEvent {
  id: string;
  organizationId: string;
  feeBps: number;
}

/** Evento vendible + cargo por servicio de su productora. La organización la decide el servidor. */
async function loadSaleEvent(db: Db, eventId: string, userId: string | null, now: Date): Promise<SaleEvent> {
  const [row] = await withContext(db, { userId }, (tx) =>
    tx
      .select({ id: events.id, organizationId: events.organizationId, status: events.status, endsAt: events.endsAt, settings: organizations.settings })
      .from(events)
      .innerJoin(organizations, eq(organizations.id, events.organizationId))
      .where(eq(events.id, eventId)),
  );
  if (!row) throw notFound('Evento');
  if (row.status !== 'published' || row.endsAt <= now) throw conflict('event_not_on_sale', 'El evento no está a la venta.');
  return { id: row.id, organizationId: row.organizationId, feeBps: feeBpsFromSettings(row.settings) };
}

/**
 * Precio de una selección: valida cada tipo (visibilidad, ventana de venta, máximo por compra)
 * y elige la etapa vigente contando lo vendido y lo reservado. No reserva nada.
 * Es la única fuente de verdad del precio: la usan la cotización y la reserva.
 */
async function priceSelection(tx: Tx, event: SaleEvent, items: readonly HoldRequestItem[], now: Date): Promise<Quote> {
  const ids = items.map((i) => i.ticketTypeId);
  const types = await tx.select().from(ticketTypes).where(and(eq(ticketTypes.eventId, event.id), inArray(ticketTypes.id, ids)));
  const stages = await tx.select().from(priceStages).where(inArray(priceStages.ticketTypeId, ids)).orderBy(asc(priceStages.position));
  const lines: QuoteLine[] = [];
  const currencies = new Set<string>();

  for (const item of items) {
    const tt = types.find((t) => t.id === item.ticketTypeId);
    if (!tt || tt.hidden) throw notFound('Tipo de entrada');
    if (tt.kind === 'courtesy') throw new AppError(422, 'hold.not_for_sale', `"${tt.name}" no se vende al público.`);
    if (tt.salesStartAt && now < tt.salesStartAt) throw conflict('hold.sales_not_started', `La venta de "${tt.name}" todavía no empezó.`);
    if (tt.salesEndAt && now >= tt.salesEndAt) throw conflict('hold.sales_ended', `La venta de "${tt.name}" terminó.`);
    if (item.quantity > tt.maxPerOrder) throw new AppError(422, 'hold.max_per_order', `Máximo ${tt.maxPerOrder} entradas "${tt.name}" por compra.`);
    if (tt.capacity - tt.sold - tt.held < item.quantity) {
      throw conflict('hold.insufficient_stock', `No quedan suficientes entradas "${tt.name}".`, { ticketTypeId: tt.id, available: Math.max(0, tt.capacity - tt.sold - tt.held) });
    }
    const typeStages = stages.filter((st) => st.ticketTypeId === tt.id).map((st) => ({ ...st, soldCount: st.soldCount + st.heldCount }));
    const stage = resolveActiveStage(typeStages, now, item.quantity);
    if (!stage) throw conflict('hold.no_active_price', `"${tt.name}" no tiene un precio vigente para esa cantidad.`);
    const stageRow = stages.find((st) => st.id === stage.id)!;
    currencies.add(tt.currency);
    lines.push({
      ticketTypeId: tt.id,
      ticketTypeName: tt.name,
      stageId: stage.id,
      stageName: stageRow.name,
      quantity: item.quantity,
      unitPriceCents: stage.priceCents,
      lineTotalCents: stage.priceCents * item.quantity,
    });
  }
  if (currencies.size > 1) throw new DomainError('hold.mixed_currency', 'No se pueden combinar entradas en distintas monedas.');

  const subtotalCents = lines.reduce((a, l) => a + l.lineTotalCents, 0);
  const feeCents = buyerFeeCents(subtotalCents, event.feeBps);
  return {
    eventId: event.id,
    currency: [...currencies][0] ?? 'ARS',
    lines,
    subtotalCents,
    feeCents,
    feeBps: event.feeBps,
    totalCents: subtotalCents + feeCents,
  };
}

/** Cotización con precios y cargos reales del servidor. No requiere sesión ni reserva stock. */
export async function quote(db: Db, input: { eventId: string; items: readonly HoldRequestItem[]; now: Date }): Promise<Quote> {
  validateItems(input.items);
  const event = await loadSaleEvent(db, input.eventId, null, input.now);
  return withContext(db, {}, (tx) => priceSelection(tx, event, input.items, input.now));
}

/**
 * Reserva stock de forma atómica.
 *
 * Garantía: nunca se reserva más que la capacidad, aun con miles de requests concurrentes.
 * Cada descuento es un único UPDATE condicional (`sold + held + q <= capacity`). En READ COMMITTED,
 * Postgres reevalúa la condición sobre la versión más reciente de la fila tras esperar el lock,
 * y además el CHECK `ticket_types_stock` actúa como red de seguridad.
 */
export async function createHold(
  db: Db,
  input: { userId: string; eventId: string; items: readonly HoldRequestItem[]; ttlMinutes: number; now: Date },
): Promise<HoldView> {
  validateItems(input.items);
  const event = await loadSaleEvent(db, input.eventId, input.userId, input.now);

  return withContext(db, { orgId: event.organizationId, userId: input.userId }, async (tx) => {
    // Una reserva activa por usuario y evento: la nueva reemplaza a la anterior y devuelve su stock.
    const previous = await tx
      .select({ id: holds.id })
      .from(holds)
      .where(and(eq(holds.userId, input.userId), eq(holds.eventId, event.id), eq(holds.status, 'active')))
      .for('update');
    for (const p of previous) await releaseHoldTx(tx, p.id, 'released', input.now);

    const priced = await priceSelection(tx, event, input.items, input.now);

    for (const line of priced.lines) {
      const reserved = await tx
        .update(ticketTypes)
        .set({ held: sql`${ticketTypes.held} + ${line.quantity}` })
        .where(and(eq(ticketTypes.id, line.ticketTypeId), sql`${ticketTypes.sold} + ${ticketTypes.held} + ${line.quantity} <= ${ticketTypes.capacity}`))
        .returning({ id: ticketTypes.id });
      if (reserved.length === 0) {
        throw conflict('hold.insufficient_stock', `No quedan suficientes entradas "${line.ticketTypeName}".`, { ticketTypeId: line.ticketTypeId });
      }
      const stageReserved = await tx
        .update(priceStages)
        .set({ heldCount: sql`${priceStages.heldCount} + ${line.quantity}` })
        .where(
          and(
            eq(priceStages.id, line.stageId),
            sql`(${priceStages.quantityLimit} IS NULL OR ${priceStages.soldCount} + ${priceStages.heldCount} + ${line.quantity} <= ${priceStages.quantityLimit})`,
          ),
        )
        .returning({ id: priceStages.id });
      if (stageReserved.length === 0) {
        // Otra compra agotó la etapa entre la lectura y la reserva: el cliente reintenta y obtiene el precio nuevo.
        throw conflict('hold.price_changed', `El precio de "${line.ticketTypeName}" cambió. Volvé a intentar.`);
      }
    }

    const holdId = randomUUID();
    const expiresAt = new Date(input.now.getTime() + input.ttlMinutes * 60_000);
    await tx.insert(holds).values({
      id: holdId,
      organizationId: event.organizationId,
      eventId: event.id,
      userId: input.userId,
      currency: priced.currency as 'ARS' | 'USD',
      subtotalCents: priced.subtotalCents,
      feeCents: priced.feeCents,
      expiresAt,
    });
    await tx.insert(holdItems).values(
      priced.lines.map((l) => ({
        holdId,
        organizationId: event.organizationId,
        ticketTypeId: l.ticketTypeId,
        priceStageId: l.stageId,
        quantity: l.quantity,
        unitPriceCents: l.unitPriceCents,
      })),
    );

    return {
      id: holdId,
      eventId: event.id,
      status: 'active',
      expiresAt,
      currency: priced.currency,
      subtotalCents: priced.subtotalCents,
      feeCents: priced.feeCents,
      totalCents: priced.totalCents,
      items: priced.lines.map((l) => ({ ticketTypeId: l.ticketTypeId, ticketTypeName: l.ticketTypeName, stageName: l.stageName, quantity: l.quantity, unitPriceCents: l.unitPriceCents })),
    };
  });
}

/** Devuelve el stock de una reserva activa. Idempotente: si ya no está activa, no hace nada. */
export async function releaseHoldTx(tx: Tx, holdId: string, status: 'released' | 'expired', now: Date): Promise<boolean> {
  const [closed] = await tx
    .update(holds)
    .set({ status, closedAt: now })
    .where(and(eq(holds.id, holdId), eq(holds.status, 'active')))
    .returning({ id: holds.id });
  if (!closed) return false;
  const items = await tx.select().from(holdItems).where(eq(holdItems.holdId, holdId));
  for (const it of items) {
    await tx
      .update(ticketTypes)
      .set({ held: sql`${ticketTypes.held} - ${it.quantity}` })
      .where(eq(ticketTypes.id, it.ticketTypeId));
    if (it.priceStageId) {
      await tx
        .update(priceStages)
        .set({ heldCount: sql`${priceStages.heldCount} - ${it.quantity}` })
        .where(eq(priceStages.id, it.priceStageId));
    }
  }
  return true;
}

export async function getHold(db: Db, userId: string, holdId: string, now: Date): Promise<HoldView> {
  return withContext(db, { userId }, async (tx) => {
    const [h] = await tx.select().from(holds).where(and(eq(holds.id, holdId), eq(holds.userId, userId)));
    if (!h) throw notFound('Reserva');
    // hold_items/ticket_types se leen en el contexto de la organización de la reserva (ya verificada como propia).
    await tx.execute(sql`select set_config('app.org_id', ${h.organizationId}, true)`);
    const items = await tx
      .select({ item: holdItems, typeName: ticketTypes.name, stageName: priceStages.name })
      .from(holdItems)
      .innerJoin(ticketTypes, eq(ticketTypes.id, holdItems.ticketTypeId))
      .leftJoin(priceStages, eq(priceStages.id, holdItems.priceStageId))
      .where(eq(holdItems.holdId, h.id));
    const status = h.status === 'active' && h.expiresAt <= now ? 'expired' : h.status;
    return {
      id: h.id,
      eventId: h.eventId,
      status,
      expiresAt: h.expiresAt,
      currency: h.currency,
      subtotalCents: h.subtotalCents,
      feeCents: h.feeCents,
      totalCents: h.subtotalCents + h.feeCents,
      items: items.map((i) => ({
        ticketTypeId: i.item.ticketTypeId,
        ticketTypeName: i.typeName,
        stageName: i.stageName,
        quantity: i.item.quantity,
        unitPriceCents: i.item.unitPriceCents,
      })),
    };
  });
}

export async function releaseHold(db: Db, userId: string, holdId: string, now: Date): Promise<void> {
  const [h] = await withContext(db, { userId }, (tx) =>
    tx.select({ id: holds.id, organizationId: holds.organizationId }).from(holds).where(and(eq(holds.id, holdId), eq(holds.userId, userId))),
  );
  if (!h) throw notFound('Reserva');
  await withContext(db, { orgId: h.organizationId, userId }, (tx) => releaseHoldTx(tx, h.id, 'released', now));
}

/** Libera todas las reservas activas de un evento (cancelación). Corre en el contexto de su organización. */
export async function releaseEventHoldsTx(tx: Tx, eventId: string, now: Date): Promise<number> {
  const active = await tx.select({ id: holds.id }).from(holds).where(and(eq(holds.eventId, eventId), eq(holds.status, 'active'))).for('update');
  let n = 0;
  for (const h of active) if (await releaseHoldTx(tx, h.id, 'released', now)) n++;
  return n;
}

/** Expira reservas vencidas de todas las organizaciones (función SECURITY DEFINER acotada). */
export async function expireHolds(db: Db, batchSize = 500): Promise<number> {
  const result = await db.execute<{ n: number }>(sql`select venti_expire_holds(${batchSize}) as n`);
  return Number(result.rows[0]?.n ?? 0);
}
