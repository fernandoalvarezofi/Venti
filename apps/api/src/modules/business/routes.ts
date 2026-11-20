import { randomUUID } from 'node:crypto';
import { TICKET_STATUSES, validateStages } from '@venti/domain';
import {
  and,
  asc,
  count,
  desc,
  eq,
  events,
  holds,
  inArray,
  memberships,
  orders,
  organizations,
  staffAssignments,
  users,
  priceStages,
  sql,
  ticketTypes,
  tickets,
  venues,
  type Tx,
} from '@venti/db';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { audit, recordTicketEvents } from '../../lib/audit.ts';
import { inOrg, requireOrgPermission, type OrgAccess, type Services } from '../../lib/context.ts';
import { AppError, conflict, notFound } from '../../lib/errors.ts';
import { maskEmail, protectDocument } from '../../lib/identity.ts';
import { EventContentFields } from '../events/content.ts';
import { commissionBpsFromSettings, releaseEventHoldsTx } from '../inventory/service.ts';

const OrgParams = z.object({ orgId: z.string().uuid() });
const EventParams = OrgParams.extend({ eventId: z.string().uuid() });
const TypeParams = EventParams.extend({ ticketTypeId: z.string().uuid() });

async function loadOwnEvent(tx: Tx, access: OrgAccess, eventId: string, opts: { forUpdate?: boolean } = {}) {
  const q = tx.select().from(events).where(and(eq(events.id, eventId), eq(events.organizationId, access.orgId)));
  const [e] = opts.forUpdate ? await q.for('update') : await q;
  if (!e) throw notFound('Evento');
  return e;
}

function assertEditable(status: string) {
  if (status === 'cancelled' || status === 'finished') throw conflict('event_closed', 'El evento está cerrado y ya no admite cambios.');
}

const StatsDto = z.object({
  capacity: z.number(),
  sold: z.number(),
  held: z.number(),
  available: z.number(),
  courtesies: z.number(),
  checkedIn: z.number(),
  /** Lo que pagaron los compradores (sólo ventas cobradas). */
  grossCents: z.number(),
  /** Comisión de Lintick sobre esas ventas (se descuenta a la productora). */
  commissionCents: z.number(),
  /** Lo que cobra la productora: bruto − comisión. */
  netCents: z.number(),
  /** Comisión vigente para las próximas ventas, en puntos básicos (1000 = 10%). */
  commissionBps: z.number(),
  activeHolds: z.number(),
  byType: z.array(
    z.object({ id: z.string().uuid(), name: z.string(), kind: z.string(), capacity: z.number(), sold: z.number(), held: z.number(), courtesies: z.number(), checkedIn: z.number(), grossCents: z.number() }),
  ),
  /** Entradas emitidas por día (hora de Argentina), últimos 30 días. */
  daily: z.array(z.object({ date: z.string(), sold: z.number(), courtesies: z.number() })),
});

/** Estadísticas de un evento calculadas en una sola transacción (consistentes entre sí). */
async function eventStats(tx: Tx, eventId: string, orgId: string, now: Date) {
  const types = await tx.select().from(ticketTypes).where(eq(ticketTypes.eventId, eventId)).orderBy(asc(ticketTypes.createdAt));
  const perType = await tx
    .select({
      ticketTypeId: tickets.ticketTypeId,
      courtesies: sql<number>`count(*) filter (where ${tickets.orderId} is null and ${tickets.priceCents} = 0 and ${tickets.status} <> 'void')`.mapWith(Number),
      checkedIn: sql<number>`count(*) filter (where ${tickets.status} = 'used')`.mapWith(Number),
      grossCents: sql<number>`coalesce(sum(${tickets.priceCents}) filter (where ${tickets.orderId} is not null and ${tickets.status} in ('valid','used','locked')), 0)`.mapWith(Number),
    })
    .from(tickets)
    .where(eq(tickets.eventId, eventId))
    .groupBy(tickets.ticketTypeId);
  const [money] = await tx
    .select({ commissionCents: sql<number>`coalesce(sum(${orders.commissionCents}), 0)`.mapWith(Number) })
    .from(orders)
    .where(and(eq(orders.eventId, eventId), eq(orders.status, 'paid')));
  const [org] = await tx.select({ settings: organizations.settings }).from(organizations).where(eq(organizations.id, orgId));
  const since = new Date(now.getTime() - 29 * 86_400_000);
  const dayExpr = sql<string>`to_char((${tickets.issuedAt} at time zone 'America/Argentina/Buenos_Aires')::date, 'YYYY-MM-DD')`;
  const dailyRows = await tx
    .select({
      date: dayExpr,
      sold: sql<number>`count(*) filter (where ${tickets.orderId} is not null)`.mapWith(Number),
      courtesies: sql<number>`count(*) filter (where ${tickets.orderId} is null)`.mapWith(Number),
    })
    .from(tickets)
    .where(and(eq(tickets.eventId, eventId), sql`${tickets.issuedAt} >= ${since}`))
    .groupBy(dayExpr);
  const daily: { date: string; sold: number; courtesies: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });
    const row = dailyRows.find((r) => r.date === d);
    daily.push({ date: d, sold: row?.sold ?? 0, courtesies: row?.courtesies ?? 0 });
  }
  const [holdsRow] = await tx
    .select({ n: count() })
    .from(holds)
    .where(and(eq(holds.eventId, eventId), eq(holds.status, 'active')));
  const byType = types.map((t) => {
    const p = perType.find((x) => x.ticketTypeId === t.id);
    return { id: t.id, name: t.name, kind: t.kind, capacity: t.capacity, sold: t.sold, held: t.held, courtesies: p?.courtesies ?? 0, checkedIn: p?.checkedIn ?? 0, grossCents: p?.grossCents ?? 0 };
  });
  const sum = (k: 'capacity' | 'sold' | 'held' | 'courtesies' | 'checkedIn') => byType.reduce((a, t) => a + t[k], 0);
  return {
    capacity: sum('capacity'),
    sold: sum('sold'),
    held: sum('held'),
    available: Math.max(0, sum('capacity') - sum('sold') - sum('held')),
    courtesies: sum('courtesies'),
    checkedIn: sum('checkedIn'),
    grossCents: perType.reduce((a, p) => a + p.grossCents, 0),
    commissionCents: money?.commissionCents ?? 0,
    netCents: perType.reduce((a, p) => a + p.grossCents, 0) - (money?.commissionCents ?? 0),
    commissionBps: commissionBpsFromSettings(org?.settings ?? null),
    activeHolds: holdsRow?.n ?? 0,
    byType,
    daily,
  };
}

export async function businessRoutes(app: FastifyInstance, s: Services): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  // ─── Resumen de la productora ───
  r.get(
    '/v1/organizations/:orgId/overview',
    {
      schema: {
        tags: ['business'],
        summary: 'Resumen de la productora: eventos con su ocupación',
        params: OrgParams,
        response: {
          200: z.object({
            totals: z.object({
              events: z.number(),
              published: z.number(),
              drafts: z.number(),
              ticketsSold: z.number(),
              capacity: z.number(),
              checkedIn: z.number(),
              grossCents: z.number(),
              commissionCents: z.number(),
              netCents: z.number(),
              commissionBps: z.number(),
            }),
            events: z.array(
              z.object({
                id: z.string().uuid(),
                title: z.string(),
                status: z.enum(['draft', 'published', 'cancelled', 'finished']),
                startsAt: z.date(),
                endsAt: z.date(),
                venueName: z.string().nullable(),
                city: z.string().nullable(),
                capacity: z.number(),
                sold: z.number(),
                held: z.number(),
                checkedIn: z.number(),
                grossCents: z.number(),
              }),
            ),
          }),
        },
      },
    },
    async (req) => {
      const access = await requireOrgPermission(s.db, req, req.params.orgId, 'events.read');
      return inOrg(s.db, access, async (tx) => {
        const rows = await tx
          .select({
            id: events.id,
            title: events.title,
            status: events.status,
            startsAt: events.startsAt,
            endsAt: events.endsAt,
            venueName: venues.name,
            city: venues.city,
            capacity: sql<number>`coalesce((select sum(tt.capacity) from ticket_types tt where tt.event_id = ${events.id}), 0)`.mapWith(Number),
            sold: sql<number>`coalesce((select sum(tt.sold) from ticket_types tt where tt.event_id = ${events.id}), 0)`.mapWith(Number),
            held: sql<number>`coalesce((select sum(tt.held) from ticket_types tt where tt.event_id = ${events.id}), 0)`.mapWith(Number),
            checkedIn: sql<number>`(select count(*) from tickets t where t.event_id = ${events.id} and t.status = 'used')`.mapWith(Number),
            grossCents: sql<number>`coalesce((select sum(t.price_cents) from tickets t where t.event_id = ${events.id} and t.order_id is not null and t.status in ('valid','used','locked')), 0)`.mapWith(Number),
          })
          .from(events)
          .leftJoin(venues, eq(venues.id, events.venueId))
          .where(eq(events.organizationId, access.orgId))
          .orderBy(desc(events.startsAt));
        const [money] = await tx
          .select({ commissionCents: sql<number>`coalesce(sum(${orders.commissionCents}), 0)`.mapWith(Number) })
          .from(orders)
          .where(and(eq(orders.organizationId, access.orgId), eq(orders.status, 'paid')));
        const [org] = await tx.select({ settings: organizations.settings }).from(organizations).where(eq(organizations.id, access.orgId));
        const grossCents = rows.reduce((a, e) => a + e.grossCents, 0);
        const commissionCents = money?.commissionCents ?? 0;
        return {
          totals: {
            checkedIn: rows.reduce((a, e) => a + e.checkedIn, 0),
            grossCents,
            commissionCents,
            netCents: grossCents - commissionCents,
            commissionBps: commissionBpsFromSettings(org?.settings ?? null),
            events: rows.length,
            published: rows.filter((e) => e.status === 'published').length,
            drafts: rows.filter((e) => e.status === 'draft').length,
            ticketsSold: rows.reduce((a, e) => a + e.sold, 0),
            capacity: rows.reduce((a, e) => a + e.capacity, 0),
          },
          events: rows,
        };
      });
    },
  );

  // ─── Editar evento ───
  r.patch(
    '/v1/organizations/:orgId/events/:eventId',
    {
      schema: {
        tags: ['business'],
        summary: 'Editar los datos de un evento',
        params: EventParams,
        body: z
          .object({
            title: z.string().trim().min(3).max(160),
            description: z.string().max(20_000),
            category: z.string().trim().toLowerCase().min(2).max(40),
            venueId: z.string().uuid().nullable(),
            startsAt: z.coerce.date(),
            endsAt: z.coerce.date(),
            coverImageUrl: z.string().url().max(2048).nullable(),
            ...EventContentFields,
          })
          .partial()
          .refine((b) => Object.keys(b).length > 0, 'Indicá al menos un dato para cambiar.'),
        response: { 200: z.object({ id: z.string().uuid(), updated: z.array(z.string()) }) },
      },
    },
    async (req) => {
      const access = await requireOrgPermission(s.db, req, req.params.orgId, 'events.write');
      const b = req.body;
      return inOrg(s.db, access, async (tx) => {
        const e = await loadOwnEvent(tx, access, req.params.eventId, { forUpdate: true });
        assertEditable(e.status);
        const startsAt = b.startsAt ?? e.startsAt;
        const endsAt = b.endsAt ?? e.endsAt;
        if (endsAt <= startsAt) throw new AppError(400, 'invalid_dates', 'El evento debe terminar después de empezar.');
        if (b.venueId) {
          const [v] = await tx.select({ id: venues.id }).from(venues).where(and(eq(venues.id, b.venueId), eq(venues.organizationId, access.orgId)));
          if (!v) throw notFound('Lugar');
        }
        if (e.status === 'published' && b.venueId === null) throw conflict('venue_required', 'Un evento publicado necesita un lugar.');
        await tx
          .update(events)
          .set({ ...b, updatedAt: s.now() })
          .where(eq(events.id, e.id));
        const updated = Object.keys(b);
        await audit(tx, {
          orgId: access.orgId,
          actorUserId: access.userId,
          action: 'event.updated',
          entityType: 'event',
          entityId: e.id,
          data: { fields: updated, wasPublished: e.status === 'published' },
          ip: req.ip,
        });
        return { id: e.id, updated };
      });
    },
  );

  // ─── Cancelar evento ───
  r.post(
    '/v1/organizations/:orgId/events/:eventId/cancel',
    {
      schema: {
        tags: ['business'],
        summary: 'Cancelar un evento',
        description: 'Saca el evento de la venta, libera las reservas y anula las entradas emitidas. Las devoluciones de dinero se procesan con el módulo de pagos.',
        params: EventParams,
        body: z.object({ reason: z.string().trim().min(5).max(500) }),
        response: { 200: z.object({ id: z.string().uuid(), ticketsCancelled: z.number(), holdsReleased: z.number() }) },
      },
    },
    async (req) => {
      const access = await requireOrgPermission(s.db, req, req.params.orgId, 'events.publish');
      return inOrg(s.db, access, async (tx) => {
        const e = await loadOwnEvent(tx, access, req.params.eventId, { forUpdate: true });
        assertEditable(e.status);
        const now = s.now();
        await tx.update(events).set({ status: 'cancelled', cancelledAt: now, cancellationReason: req.body.reason, updatedAt: now }).where(eq(events.id, e.id));
        const holdsReleased = await releaseEventHoldsTx(tx, e.id, now);
        const cancelled = await tx
          .update(tickets)
          .set({ status: 'cancelled', updatedAt: now })
          .where(and(eq(tickets.eventId, e.id), inArray(tickets.status, ['valid', 'locked'])))
          .returning({ id: tickets.id });
        await recordTicketEvents(
          tx,
          cancelled.map((t) => ({ orgId: access.orgId, ticketId: t.id, type: 'cancelled', actorUserId: access.userId, data: { reason: 'event_cancelled' } })),
        );
        await audit(tx, {
          orgId: access.orgId,
          actorUserId: access.userId,
          action: 'event.cancelled',
          entityType: 'event',
          entityId: e.id,
          data: { reason: req.body.reason, ticketsCancelled: cancelled.length, holdsReleased },
          ip: req.ip,
        });
        return { id: e.id, ticketsCancelled: cancelled.length, holdsReleased };
      });
    },
  );

  // ─── Editar tipo de entrada ───
  r.patch(
    '/v1/organizations/:orgId/events/:eventId/ticket-types/:ticketTypeId',
    {
      schema: {
        tags: ['business'],
        summary: 'Editar un tipo de entrada',
        description: 'Para cambiar capacidad usá /capacity; para precios, las etapas.',
        params: TypeParams,
        body: z
          .object({
            name: z.string().trim().min(1).max(80),
            description: z.string().max(2000),
            maxPerOrder: z.number().int().min(1).max(100),
            salesStartAt: z.coerce.date().nullable(),
            salesEndAt: z.coerce.date().nullable(),
            hidden: z.boolean(),
          })
          .partial()
          .refine((b) => Object.keys(b).length > 0, 'Indicá al menos un dato para cambiar.'),
        response: { 200: z.object({ id: z.string().uuid(), updated: z.array(z.string()) }) },
      },
    },
    async (req) => {
      const access = await requireOrgPermission(s.db, req, req.params.orgId, 'inventory.write');
      return inOrg(s.db, access, async (tx) => {
        const e = await loadOwnEvent(tx, access, req.params.eventId);
        assertEditable(e.status);
        const [tt] = await tx.select().from(ticketTypes).where(and(eq(ticketTypes.id, req.params.ticketTypeId), eq(ticketTypes.eventId, e.id))).for('update');
        if (!tt) throw notFound('Tipo de entrada');
        const start = req.body.salesStartAt === undefined ? tt.salesStartAt : req.body.salesStartAt;
        const end = req.body.salesEndAt === undefined ? tt.salesEndAt : req.body.salesEndAt;
        if (start && end && end <= start) throw new AppError(400, 'invalid_sales_window', 'La venta debe terminar después de empezar.');
        await tx.update(ticketTypes).set({ ...req.body, updatedAt: s.now() }).where(eq(ticketTypes.id, tt.id));
        const updated = Object.keys(req.body);
        await audit(tx, { orgId: access.orgId, actorUserId: access.userId, action: 'ticket_type.updated', entityType: 'ticket_type', entityId: tt.id, data: { fields: updated }, ip: req.ip });
        return { id: tt.id, updated };
      });
    },
  );

  // ─── Etapas de precio ───
  const StageBody = z.object({
    name: z.string().trim().min(1).max(80),
    priceCents: z.number().int().min(0),
    startsAt: z.coerce.date().nullable().default(null),
    endsAt: z.coerce.date().nullable().default(null),
    quantityLimit: z.number().int().positive().nullable().default(null),
  });

  r.post(
    '/v1/organizations/:orgId/events/:eventId/ticket-types/:ticketTypeId/stages',
    {
      schema: {
        tags: ['business'],
        summary: 'Agregar una etapa de precio al final',
        params: TypeParams,
        body: StageBody,
        response: { 201: z.object({ id: z.string().uuid(), position: z.number() }) },
      },
    },
    async (req, reply) => {
      const access = await requireOrgPermission(s.db, req, req.params.orgId, 'inventory.write');
      const result = await inOrg(s.db, access, async (tx) => {
        const e = await loadOwnEvent(tx, access, req.params.eventId);
        assertEditable(e.status);
        const [tt] = await tx.select({ id: ticketTypes.id }).from(ticketTypes).where(and(eq(ticketTypes.id, req.params.ticketTypeId), eq(ticketTypes.eventId, e.id))).for('update');
        if (!tt) throw notFound('Tipo de entrada');
        const [last] = await tx.select({ max: sql<number>`coalesce(max(${priceStages.position}), 0)`.mapWith(Number) }).from(priceStages).where(eq(priceStages.ticketTypeId, tt.id));
        const position = (last?.max ?? 0) + 1;
        validateStages([{ ...req.body, position }]);
        const id = randomUUID();
        await tx.insert(priceStages).values({ id, organizationId: access.orgId, ticketTypeId: tt.id, position, ...req.body });
        await audit(tx, { orgId: access.orgId, actorUserId: access.userId, action: 'price_stage.created', entityType: 'price_stage', entityId: id, data: { ticketTypeId: tt.id, priceCents: req.body.priceCents }, ip: req.ip });
        return { id, position };
      });
      return reply.status(201).send(result);
    },
  );

  r.patch(
    '/v1/organizations/:orgId/events/:eventId/ticket-types/:ticketTypeId/stages/:stageId',
    {
      schema: {
        tags: ['business'],
        summary: 'Editar una etapa de precio',
        description: 'El precio sólo se puede cambiar si la etapa todavía no vendió ni reservó: así nadie paga distinto por lo mismo. Si ya vendió, cerrala y creá una nueva.',
        params: TypeParams.extend({ stageId: z.string().uuid() }),
        body: StageBody.partial().refine((b) => Object.keys(b).length > 0, 'Indicá al menos un dato para cambiar.'),
        response: { 200: z.object({ id: z.string().uuid(), updated: z.array(z.string()) }) },
      },
    },
    async (req) => {
      const access = await requireOrgPermission(s.db, req, req.params.orgId, 'inventory.write');
      return inOrg(s.db, access, async (tx) => {
        const e = await loadOwnEvent(tx, access, req.params.eventId);
        assertEditable(e.status);
        const [st] = await tx
          .select()
          .from(priceStages)
          .innerJoin(ticketTypes, eq(ticketTypes.id, priceStages.ticketTypeId))
          .where(and(eq(priceStages.id, req.params.stageId), eq(priceStages.ticketTypeId, req.params.ticketTypeId), eq(ticketTypes.eventId, e.id)))
          .for('update', { of: priceStages });
        if (!st) throw notFound('Etapa');
        const stage = st.price_stages;
        const b = req.body;
        if (b.priceCents !== undefined && b.priceCents !== stage.priceCents && stage.soldCount + stage.heldCount > 0) {
          throw conflict('stage_has_sales', 'Esta etapa ya tiene ventas o reservas: no se puede cambiar su precio. Cerrala con una fecha de fin y creá una etapa nueva.');
        }
        const merged = {
          position: stage.position,
          priceCents: b.priceCents ?? stage.priceCents,
          startsAt: b.startsAt === undefined ? stage.startsAt : b.startsAt,
          endsAt: b.endsAt === undefined ? stage.endsAt : b.endsAt,
          quantityLimit: b.quantityLimit === undefined ? stage.quantityLimit : b.quantityLimit,
        };
        validateStages([merged]);
        if (merged.quantityLimit !== null && merged.quantityLimit < stage.soldCount + stage.heldCount) {
          throw conflict('limit_below_committed', 'El cupo no puede ser menor a lo ya vendido o reservado en esta etapa.');
        }
        await tx.update(priceStages).set(b).where(eq(priceStages.id, stage.id));
        const updated = Object.keys(b);
        await audit(tx, { orgId: access.orgId, actorUserId: access.userId, action: 'price_stage.updated', entityType: 'price_stage', entityId: stage.id, data: { fields: updated, from: { priceCents: stage.priceCents } }, ip: req.ip });
        return { id: stage.id, updated };
      });
    },
  );

  // ─── Estadísticas y asistentes ───
  r.get(
    '/v1/organizations/:orgId/events/:eventId/stats',
    { schema: { tags: ['business'], summary: 'Estadísticas de un evento', params: EventParams, response: { 200: StatsDto } } },
    async (req) => {
      const access = await requireOrgPermission(s.db, req, req.params.orgId, 'events.read');
      return inOrg(s.db, access, async (tx) => {
        const e = await loadOwnEvent(tx, access, req.params.eventId);
        return eventStats(tx, e.id, access.orgId, s.now());
      });
    },
  );

  r.get(
    '/v1/organizations/:orgId/events/:eventId/attendees',
    {
      schema: {
        tags: ['business'],
        summary: 'Entradas emitidas de un evento',
        params: EventParams,
        querystring: z.object({
          q: z.string().trim().min(2).max(80).optional(),
          status: z.enum(TICKET_STATUSES).optional(),
          limit: z.coerce.number().int().min(1).max(200).default(50),
          offset: z.coerce.number().int().min(0).max(100_000).default(0),
        }),
        response: {
          200: z.object({
            total: z.number(),
            items: z.array(
              z.object({
                id: z.string().uuid(),
                holderName: z.string(),
                holderEmail: z.string(),
                holderDocLast3: z.string().nullable(),
                pendingClaim: z.boolean(),
                ticketTypeName: z.string(),
                status: z.enum(TICKET_STATUSES),
                priceCents: z.number(),
                courtesy: z.boolean(),
                issuedAt: z.date(),
                usedAt: z.date().nullable(),
              }),
            ),
          }),
        },
      },
    },
    async (req) => {
      const access = await requireOrgPermission(s.db, req, req.params.orgId, 'tickets.read');
      const { q, status, limit, offset } = req.query;
      return inOrg(s.db, access, async (tx) => {
        const e = await loadOwnEvent(tx, access, req.params.eventId);
        const conds = [eq(tickets.eventId, e.id)];
        if (status) conds.push(eq(tickets.status, status));
        // H3: un DNI se busca por coincidencia EXACTA de su HMAC; nunca por partes.
        const docQuery = q && /^[\d.\s]{7,12}$/.test(q) ? protectDocument(s.docKey, access.orgId, q) : null;
        if (docQuery) conds.push(eq(tickets.holderDocHmac, docQuery.hmac));
        else if (q) {
          const like = `%${q.replace(/[%_\\]/g, '\\$&')}%`;
          conds.push(sql`(${tickets.holderName} ILIKE ${like} OR ${tickets.holderEmail} ILIKE ${like})`);
        }
        const fullEmails = ['owner', 'admin', 'manager', 'finance'].includes(access.role);
        const where = and(...conds);
        const [totalRow] = await tx.select({ n: count() }).from(tickets).where(where);
        const rows = await tx
          .select({ t: tickets, typeName: ticketTypes.name })
          .from(tickets)
          .innerJoin(ticketTypes, eq(ticketTypes.id, tickets.ticketTypeId))
          .where(where)
          .orderBy(desc(tickets.issuedAt), asc(tickets.id))
          .limit(limit)
          .offset(offset);
        return {
          total: totalRow?.n ?? 0,
          items: rows.map(({ t, typeName }) => ({
            id: t.id,
            holderName: t.holderName,
            holderEmail: fullEmails ? t.holderEmail : maskEmail(t.holderEmail),
            holderDocLast3: t.holderDocLast3,
            pendingClaim: t.assignmentStatus === 'pending_claim',
            ticketTypeName: typeName,
            status: t.status,
            priceCents: t.priceCents,
            courtesy: t.orderId === null && t.priceCents === 0,
            issuedAt: t.issuedAt,
            usedAt: t.usedAt,
          })),
        };
      });
    },
  );

  // ─── Turnos del personal de acceso (H4) ───
  const StaffDto = z.object({ id: z.string().uuid(), userId: z.string().uuid(), fullName: z.string(), email: z.string(), validFrom: z.date(), validUntil: z.date() });

  r.get(
    '/v1/organizations/:orgId/events/:eventId/staff',
    { schema: { tags: ['business'], summary: 'Turnos del personal de acceso', params: EventParams, response: { 200: z.object({ items: z.array(StaffDto) }) } } },
    async (req) => {
      const access = await requireOrgPermission(s.db, req, req.params.orgId, 'events.write');
      return inOrg(s.db, access, async (tx) => {
        await loadOwnEvent(tx, access, req.params.eventId);
        const items = await tx
          .select({ id: staffAssignments.id, userId: users.id, fullName: users.fullName, email: users.email, validFrom: staffAssignments.validFrom, validUntil: staffAssignments.validUntil })
          .from(staffAssignments)
          .innerJoin(users, eq(users.id, staffAssignments.userId))
          .where(eq(staffAssignments.eventId, req.params.eventId))
          .orderBy(asc(users.fullName));
        return { items };
      });
    },
  );

  r.put(
    '/v1/organizations/:orgId/events/:eventId/staff',
    {
      schema: {
        tags: ['business'],
        summary: 'Asignar (o reprogramar) un turno de acceso',
        description: 'La persona tiene que ser miembro de la productora con rol Acceso. El turno no puede pasar 48 h y debe cruzarse con el evento.',
        params: EventParams,
        body: z.object({ userId: z.string().uuid(), validFrom: z.coerce.date(), validUntil: z.coerce.date() }),
        response: { 200: z.object({ id: z.string().uuid() }) },
      },
    },
    async (req) => {
      const access = await requireOrgPermission(s.db, req, req.params.orgId, 'events.write');
      const b = req.body;
      if (b.validUntil <= b.validFrom) throw new AppError(400, 'invalid_window', 'El turno debe terminar después de empezar.');
      if (b.validUntil.getTime() - b.validFrom.getTime() > 48 * 3_600_000) throw new AppError(400, 'window_too_long', 'Un turno no puede durar más de 48 horas.');
      return inOrg(s.db, access, async (tx) => {
        const e = await loadOwnEvent(tx, access, req.params.eventId);
        assertEditable(e.status);
        if (b.validUntil <= new Date(e.startsAt.getTime() - 12 * 3_600_000) || b.validFrom >= new Date(e.endsAt.getTime() + 6 * 3_600_000)) {
          throw new AppError(400, 'outside_event', 'El turno tiene que cruzarse con el horario del evento.');
        }
        const [m] = await tx
          .select({ role: memberships.role })
          .from(memberships)
          .where(and(eq(memberships.organizationId, access.orgId), eq(memberships.userId, b.userId)));
        if (!m) throw notFound('Miembro');
        if (m.role !== 'access_staff') throw new AppError(422, 'not_access_staff', 'Sólo se asignan turnos a personas con rol Acceso.');
        const [row] = await tx
          .insert(staffAssignments)
          .values({ id: randomUUID(), organizationId: access.orgId, eventId: e.id, userId: b.userId, validFrom: b.validFrom, validUntil: b.validUntil, createdBy: access.userId })
          .onConflictDoUpdate({ target: [staffAssignments.eventId, staffAssignments.userId], set: { validFrom: b.validFrom, validUntil: b.validUntil } })
          .returning({ id: staffAssignments.id });
        await audit(tx, {
          orgId: access.orgId,
          actorUserId: access.userId,
          action: 'staff.assigned',
          entityType: 'event',
          entityId: e.id,
          data: { userId: b.userId, validFrom: b.validFrom.toISOString(), validUntil: b.validUntil.toISOString() },
          ip: req.ip,
        });
        return { id: row!.id };
      });
    },
  );

  r.delete(
    '/v1/organizations/:orgId/events/:eventId/staff/:userId',
    { schema: { tags: ['business'], summary: 'Quitar un turno de acceso', params: EventParams.extend({ userId: z.string().uuid() }), response: { 204: z.null() } } },
    async (req, reply) => {
      const access = await requireOrgPermission(s.db, req, req.params.orgId, 'events.write');
      await inOrg(s.db, access, async (tx) => {
        await loadOwnEvent(tx, access, req.params.eventId);
        const gone = await tx
          .delete(staffAssignments)
          .where(and(eq(staffAssignments.eventId, req.params.eventId), eq(staffAssignments.userId, req.params.userId)))
          .returning({ id: staffAssignments.id });
        if (gone.length === 0) throw notFound('Turno');
        await audit(tx, { orgId: access.orgId, actorUserId: access.userId, action: 'staff.unassigned', entityType: 'event', entityId: req.params.eventId, data: { userId: req.params.userId }, ip: req.ip });
      });
      return reply.status(204).send(null);
    },
  );

  // ─── Verificación de la cadena de auditoría (H7) ───
  const ChainDto = z.object({ checked: z.number(), ok: z.boolean(), firstBrokenSeq: z.number().nullable(), reason: z.string().nullable() });

  r.get(
    '/v1/organizations/:orgId/audit/verify',
    {
      schema: {
        tags: ['business'],
        summary: 'Verificar que la auditoría no fue alterada',
        description: 'Recalcula la cadena de hashes de la auditoría y del historial de tickets de la productora.',
        params: OrgParams,
        response: { 200: z.object({ auditLogs: ChainDto, ticketEvents: ChainDto }) },
      },
    },
    async (req) => {
      const access = await requireOrgPermission(s.db, req, req.params.orgId, 'audit.read');
      return inOrg(s.db, access, async (tx) => {
        const check = async (table: 'audit_logs' | 'ticket_events') => {
          const res = await tx.execute<{ checked: string; first_broken_seq: string | null; reason: string | null }>(
            sql`select * from venti_verify_chain(${table}, ${access.orgId}::uuid)`,
          );
          const row = res.rows[0]!;
          return {
            checked: Number(row.checked),
            ok: row.first_broken_seq === null,
            firstBrokenSeq: row.first_broken_seq === null ? null : Number(row.first_broken_seq),
            reason: row.reason,
          };
        };
        return { auditLogs: await check('audit_logs'), ticketEvents: await check('ticket_events') };
      });
    },
  );
}
