import { randomUUID } from 'node:crypto';
import { CURRENCIES, SLUG_PATTERN, TICKET_KINDS, resolveActiveStage, slugify, validateStages } from '@venti/domain';
import {
  and,
  asc,
  eq,
  events,
  gt,
  gte,
  inArray,
  isNull,
  lte,
  organizations,
  priceStages,
  sql,
  ticketTypes,
  venues,
  withContext,
  type Tx,
} from '@venti/db';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { audit } from '../../lib/audit.ts';
import { inOrg, requireOrgPermission, type Services } from '../../lib/context.ts';
import { EventContentDto, EventContentFields, MediaDto, contentView, loadEventMedia } from './content.ts';
import { AppError, conflict, notFound } from '../../lib/errors.ts';

// ───────────── DTOs ─────────────

const VenueBody = z.object({
  name: z.string().trim().min(2).max(160),
  address: z.string().trim().min(3).max(240),
  city: z.string().trim().min(2).max(120),
  province: z.string().trim().min(2).max(120),
  capacity: z.number().int().positive().optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});
const VenueDto = z.object({
  id: z.string().uuid(),
  name: z.string(),
  address: z.string(),
  city: z.string(),
  province: z.string(),
  capacity: z.number().nullable(),
});

const EventBody = z
  .object({
    title: z.string().trim().min(3).max(160),
    slug: z.string().regex(SLUG_PATTERN).max(80).optional(),
    description: z.string().max(20_000).default(''),
    category: z.string().trim().min(2).max(40),
    venueId: z.string().uuid().nullable().optional(),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    timezone: z.string().default('America/Argentina/Buenos_Aires'),
    coverImageUrl: z.string().url().max(2048).nullable().optional(),
    ...Object.fromEntries(Object.entries(EventContentFields).map(([k, v]) => [k, v.optional()])) as { [K in keyof typeof EventContentFields]: z.ZodOptional<(typeof EventContentFields)[K]> },
  })
  .refine((e) => e.endsAt > e.startsAt, { message: 'El evento debe terminar después de empezar.', path: ['endsAt'] });

const StageBody = z.object({
  name: z.string().trim().min(1).max(80),
  priceCents: z.number().int().min(0),
  startsAt: z.coerce.date().nullable().default(null),
  endsAt: z.coerce.date().nullable().default(null),
  quantityLimit: z.number().int().positive().nullable().default(null),
});

const TicketTypeBody = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().max(2000).default(''),
  kind: z.enum(TICKET_KINDS),
  currency: z.enum(CURRENCIES).default('ARS'),
  capacity: z.number().int().positive().max(1_000_000),
  maxPerOrder: z.number().int().min(1).max(100).default(10),
  salesStartAt: z.coerce.date().nullable().default(null),
  salesEndAt: z.coerce.date().nullable().default(null),
  hidden: z.boolean().default(false),
  stages: z.array(StageBody).min(1).max(20),
});

const StageDto = z.object({
  id: z.string().uuid(),
  name: z.string(),
  position: z.number(),
  priceCents: z.number(),
  startsAt: z.date().nullable(),
  endsAt: z.date().nullable(),
  quantityLimit: z.number().nullable(),
  soldCount: z.number(),
  heldCount: z.number(),
});

const SALE_STATES = ['on_sale', 'sold_out', 'not_started', 'ended', 'unavailable'] as const;

const TicketTypeDto = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string(),
  kind: z.enum(TICKET_KINDS),
  currency: z.enum(CURRENCIES),
  capacity: z.number(),
  sold: z.number(),
  held: z.number(),
  available: z.number(),
  maxPerOrder: z.number(),
  salesStartAt: z.date().nullable(),
  salesEndAt: z.date().nullable(),
  hidden: z.boolean(),
  saleState: z.enum(SALE_STATES),
  currentStage: StageDto.nullable(),
  stages: z.array(StageDto),
});

const EventDto = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  slug: z.string(),
  title: z.string(),
  description: z.string(),
  category: z.string(),
  status: z.enum(['draft', 'published', 'cancelled', 'finished']),
  startsAt: z.date(),
  endsAt: z.date(),
  timezone: z.string(),
  coverImageUrl: z.string().nullable(),
  venueId: z.string().uuid().nullable(),
  publishedAt: z.date().nullable(),
});

const EventDetailDto = EventDto.extend({ venue: VenueDto.nullable(), ticketTypes: z.array(TicketTypeDto) }).merge(EventContentDto);

const PublicTicketTypeDto = TicketTypeDto.omit({ sold: true, held: true, capacity: true, hidden: true, stages: true }).extend({
  currentStage: StageDto.pick({ id: true, name: true, priceCents: true, endsAt: true }).nullable(),
});
const PublicEventDto = EventDto.omit({ status: true, publishedAt: true, venueId: true }).extend({
  status: z.enum(['published', 'cancelled', 'finished']),
  organization: z.object({ id: z.string().uuid(), slug: z.string(), name: z.string() }),
  venue: VenueDto.nullable(),
  coverImage: MediaDto.nullable(),
});

const OrgParams = z.object({ orgId: z.string().uuid() });
const EventParams = OrgParams.extend({ eventId: z.string().uuid() });

// ───────────── Lectura compartida ─────────────

type TicketTypeRow = typeof ticketTypes.$inferSelect;
type StageRow = typeof priceStages.$inferSelect;

export function describeTicketType(tt: TicketTypeRow, stages: StageRow[], now: Date) {
  const available = tt.capacity - tt.sold - tt.held;
  const stageInputs = stages.map((st) => ({ ...st, soldCount: st.soldCount + st.heldCount }));
  const current = resolveActiveStage(stageInputs, now, 1);
  const currentRow = current ? stages.find((st) => st.id === current.id) ?? null : null;
  let saleState: (typeof SALE_STATES)[number];
  if (tt.salesStartAt && now < tt.salesStartAt) saleState = 'not_started';
  else if (tt.salesEndAt && now >= tt.salesEndAt) saleState = 'ended';
  else if (available <= 0) saleState = 'sold_out';
  else if (!currentRow) saleState = 'unavailable';
  else saleState = 'on_sale';
  const stageDto = (st: StageRow) => ({
    id: st.id,
    name: st.name,
    position: st.position,
    priceCents: st.priceCents,
    startsAt: st.startsAt,
    endsAt: st.endsAt,
    quantityLimit: st.quantityLimit,
    soldCount: st.soldCount,
    heldCount: st.heldCount,
  });
  return {
    id: tt.id,
    name: tt.name,
    description: tt.description,
    kind: tt.kind,
    currency: tt.currency,
    capacity: tt.capacity,
    sold: tt.sold,
    held: tt.held,
    available,
    maxPerOrder: tt.maxPerOrder,
    salesStartAt: tt.salesStartAt,
    salesEndAt: tt.salesEndAt,
    hidden: tt.hidden,
    saleState,
    currentStage: currentRow ? stageDto(currentRow) : null,
    stages: stages.map(stageDto),
  };
}

export async function loadTicketTypes(tx: Tx, eventId: string, now: Date) {
  const types = await tx.select().from(ticketTypes).where(eq(ticketTypes.eventId, eventId)).orderBy(asc(ticketTypes.createdAt));
  if (types.length === 0) return [];
  const stages = await tx
    .select()
    .from(priceStages)
    .where(inArray(priceStages.ticketTypeId, types.map((t) => t.id)))
    .orderBy(asc(priceStages.position));
  return types.map((tt) => describeTicketType(tt, stages.filter((st) => st.ticketTypeId === tt.id), now));
}

async function loadVenue(tx: Tx, venueId: string | null) {
  if (!venueId) return null;
  const [v] = await tx.select().from(venues).where(eq(venues.id, venueId));
  return v ? { id: v.id, name: v.name, address: v.address, city: v.city, province: v.province, capacity: v.capacity } : null;
}

// ───────────── Rutas ─────────────

export async function eventRoutes(app: FastifyInstance, s: Services): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  // Venues
  r.post(
    '/v1/organizations/:orgId/venues',
    { schema: { tags: ['events'], summary: 'Crear un lugar', params: OrgParams, body: VenueBody, response: { 201: VenueDto } } },
    async (req, reply) => {
      const access = await requireOrgPermission(s.db, req, req.params.orgId, 'events.write');
      const b = req.body;
      const venue = await inOrg(s.db, access, async (tx) => {
        const [v] = await tx
          .insert(venues)
          .values({
            id: randomUUID(),
            organizationId: access.orgId,
            name: b.name,
            address: b.address,
            city: b.city,
            province: b.province,
            capacity: b.capacity ?? null,
            latitude: b.latitude?.toString() ?? null,
            longitude: b.longitude?.toString() ?? null,
          })
          .returning();
        return v!;
      });
      return reply.status(201).send(venue);
    },
  );

  r.get(
    '/v1/organizations/:orgId/venues',
    { schema: { tags: ['events'], summary: 'Lugares de la organización', params: OrgParams, response: { 200: z.object({ items: z.array(VenueDto) }) } } },
    async (req) => {
      const access = await requireOrgPermission(s.db, req, req.params.orgId, 'events.read');
      const items = await inOrg(s.db, access, (tx) =>
        tx.select().from(venues).where(eq(venues.organizationId, access.orgId)).orderBy(asc(venues.name)),
      );
      return { items };
    },
  );

  // Eventos (panel)
  r.post(
    '/v1/organizations/:orgId/events',
    { schema: { tags: ['events'], summary: 'Crear un evento (borrador)', params: OrgParams, body: EventBody, response: { 201: EventDto } } },
    async (req, reply) => {
      const access = await requireOrgPermission(s.db, req, req.params.orgId, 'events.write');
      const b = req.body;
      const slug = b.slug ?? slugify(`${b.title} ${b.startsAt.toISOString().slice(0, 10)}`);
      const event = await inOrg(s.db, access, async (tx) => {
        if (b.venueId && !(await loadVenue(tx, b.venueId))) throw notFound('Lugar');
        const [taken] = await tx
          .select({ id: events.id })
          .from(events)
          .where(and(eq(events.organizationId, access.orgId), eq(events.slug, slug)));
        if (taken) throw conflict('slug_taken', `Ya existe un evento con el identificador "${slug}".`);
        const [e] = await tx
          .insert(events)
          .values({
            id: randomUUID(),
            organizationId: access.orgId,
            slug,
            title: b.title,
            description: b.description,
            category: b.category.toLowerCase(),
            venueId: b.venueId ?? null,
            startsAt: b.startsAt,
            endsAt: b.endsAt,
            timezone: b.timezone,
            coverImageUrl: b.coverImageUrl ?? null,
            doorsOpenAt: b.doorsOpenAt ?? null,
            minAge: b.minAge ?? null,
            dressCode: b.dressCode ?? null,
            lineup: (b.lineup ?? []).map((l) => ({ ...l, imageId: null })),
            amenities: b.amenities ?? [],
            extraAmenities: b.extraAmenities ?? [],
            links: b.links ?? {},
            policies: b.policies ?? '',
            summary: b.summary ?? '',
            videos: b.videos ?? [],
            // Al crear todavía no hay imágenes subidas: logos y fotos se agregan después.
            sponsors: (b.sponsors ?? []).map((x) => ({ ...x, logoId: null })),
            faq: b.faq ?? [],
            contact: b.contact ?? {},
            seo: b.seo ?? {},
            pageSections: b.pageSections ?? [],
          })
          .returning();
        await audit(tx, { orgId: access.orgId, actorUserId: access.userId, action: 'event.created', entityType: 'event', entityId: e!.id, ip: req.ip });
        return e!;
      });
      return reply.status(201).send(event);
    },
  );

  r.get(
    '/v1/organizations/:orgId/events',
    { schema: { tags: ['events'], summary: 'Eventos de la organización', params: OrgParams, response: { 200: z.object({ items: z.array(EventDto) }) } } },
    async (req) => {
      const access = await requireOrgPermission(s.db, req, req.params.orgId, 'events.read');
      const items = await inOrg(s.db, access, (tx) =>
        tx.select().from(events).where(and(eq(events.organizationId, access.orgId), isNull(events.archivedAt))).orderBy(asc(events.startsAt)),
      );
      return { items };
    },
  );

  // ─── Eliminar un evento ───
  // Sin ventas ni entradas: se borra del todo. Con ventas: sólo si ya terminó o se canceló, y se ARCHIVA (las compras
  // y el historial de cobros se conservan). Publicado y por venir con entradas: primero hay que cancelarlo.
  r.delete(
    '/v1/organizations/:orgId/events/:eventId',
    { schema: { tags: ['events'], summary: 'Eliminar (o archivar) un evento', params: OrgParams.extend({ eventId: z.string().uuid() }), response: { 200: z.object({ result: z.enum(['deleted', 'archived']) }) } } },
    async (req) => {
      const access = await requireOrgPermission(s.db, req, req.params.orgId, 'events.write');
      const now = s.now();
      return inOrg(s.db, access, async (tx) => {
        const [e] = await tx.select().from(events).where(and(eq(events.id, req.params.eventId), eq(events.organizationId, access.orgId))).for('update');
        if (!e) throw notFound('Evento');
        const counted = (await tx.execute(sql`select (select count(*) from tickets where event_id = ${e.id}) + (select count(*) from orders where event_id = ${e.id}) as n`)) as unknown as { rows?: { n: string }[] } & { n: string }[];
        const n = (counted.rows ?? counted)[0]?.n ?? 0;
        if (Number(n) === 0) {
          await tx.delete(events).where(eq(events.id, e.id));
          await audit(tx, { orgId: access.orgId, actorUserId: access.userId, action: 'event.deleted', entityType: 'event', entityId: e.id, data: { title: e.title }, ip: req.ip });
          return { result: 'deleted' as const };
        }
        const closed = e.status === 'cancelled' || e.status === 'finished' || e.endsAt <= now || e.status === 'draft';
        if (!closed) throw conflict('event_has_sales', 'Este evento tiene entradas vendidas y todavía no terminó: primero cancelalo (así se avisa a los compradores).');
        await tx.update(events).set({ archivedAt: now, updatedAt: now }).where(eq(events.id, e.id));
        await audit(tx, { orgId: access.orgId, actorUserId: access.userId, action: 'event.archived', entityType: 'event', entityId: e.id, data: { title: e.title }, ip: req.ip });
        return { result: 'archived' as const };
      });
    },
  );

  r.get(
    '/v1/organizations/:orgId/events/:eventId',
    { schema: { tags: ['events'], summary: 'Detalle de un evento con stock y etapas', params: EventParams, response: { 200: EventDetailDto } } },
    async (req) => {
      const access = await requireOrgPermission(s.db, req, req.params.orgId, 'events.read');
      return inOrg(s.db, access, async (tx) => {
        const [e] = await tx
          .select()
          .from(events)
          .where(and(eq(events.id, req.params.eventId), eq(events.organizationId, access.orgId)));
        if (!e) throw notFound('Evento');
        const media = await loadEventMedia(tx, [e.id]);
        return { ...e, venue: await loadVenue(tx, e.venueId), ticketTypes: await loadTicketTypes(tx, e.id, s.now()), ...contentView(e, media.get(e.id)) };
      });
    },
  );

  r.post(
    '/v1/organizations/:orgId/events/:eventId/ticket-types',
    {
      schema: {
        tags: ['events'],
        summary: 'Crear un tipo de entrada con sus etapas de precio',
        params: EventParams,
        body: TicketTypeBody,
        response: { 201: TicketTypeDto },
      },
    },
    async (req, reply) => {
      const access = await requireOrgPermission(s.db, req, req.params.orgId, 'inventory.write');
      const b = req.body;
      if (b.salesStartAt && b.salesEndAt && b.salesEndAt <= b.salesStartAt) {
        throw new AppError(400, 'invalid_sales_window', 'La venta debe terminar después de empezar.');
      }
      const stageInputs = b.stages.map((st, i) => ({ ...st, position: i + 1 }));
      validateStages(stageInputs);
      const totalStageLimits = stageInputs.every((st) => st.quantityLimit !== null)
        ? stageInputs.reduce((acc, st) => acc + (st.quantityLimit ?? 0), 0)
        : null;
      if (totalStageLimits !== null && totalStageLimits < b.capacity) {
        throw new AppError(400, 'stages_below_capacity', 'Todas las etapas tienen cupo y su suma es menor a la capacidad: parte del stock nunca podría venderse.');
      }
      const result = await inOrg(s.db, access, async (tx) => {
        const [e] = await tx
          .select()
          .from(events)
          .where(and(eq(events.id, req.params.eventId), eq(events.organizationId, access.orgId)));
        if (!e) throw notFound('Evento');
        if (e.status === 'cancelled' || e.status === 'finished') throw conflict('event_closed', 'El evento ya no admite cambios de entradas.');
        const id = randomUUID();
        const [tt] = await tx
          .insert(ticketTypes)
          .values({
            id,
            organizationId: access.orgId,
            eventId: e.id,
            name: b.name,
            description: b.description,
            kind: b.kind,
            currency: b.currency,
            capacity: b.capacity,
            maxPerOrder: b.maxPerOrder,
            salesStartAt: b.salesStartAt,
            salesEndAt: b.salesEndAt,
            hidden: b.hidden,
          })
          .returning();
        const stages = await tx
          .insert(priceStages)
          .values(stageInputs.map((st) => ({ id: randomUUID(), organizationId: access.orgId, ticketTypeId: id, ...st })))
          .returning();
        await audit(tx, {
          orgId: access.orgId,
          actorUserId: access.userId,
          action: 'ticket_type.created',
          entityType: 'ticket_type',
          entityId: id,
          data: { eventId: e.id, capacity: b.capacity, stages: stageInputs.map((st) => ({ name: st.name, priceCents: st.priceCents })) },
          ip: req.ip,
        });
        return describeTicketType(tt!, stages.sort((a, c) => a.position - c.position), s.now());
      });
      return reply.status(201).send(result);
    },
  );

  r.patch(
    '/v1/organizations/:orgId/events/:eventId/ticket-types/:ticketTypeId/capacity',
    {
      schema: {
        tags: ['events'],
        summary: 'Ajustar la capacidad de un tipo de entrada',
        description: 'No puede quedar por debajo de lo vendido más lo reservado.',
        params: EventParams.extend({ ticketTypeId: z.string().uuid() }),
        body: z.object({ capacity: z.number().int().positive().max(1_000_000) }),
        response: { 200: z.object({ capacity: z.number(), sold: z.number(), held: z.number() }) },
      },
    },
    async (req) => {
      const access = await requireOrgPermission(s.db, req, req.params.orgId, 'inventory.write');
      return inOrg(s.db, access, async (tx) => {
        const [updated] = await tx
          .update(ticketTypes)
          .set({ capacity: req.body.capacity, updatedAt: s.now() })
          .where(
            and(
              eq(ticketTypes.id, req.params.ticketTypeId),
              eq(ticketTypes.eventId, req.params.eventId),
              sql`${ticketTypes.sold} + ${ticketTypes.held} <= ${req.body.capacity}`,
            ),
          )
          .returning({ capacity: ticketTypes.capacity, sold: ticketTypes.sold, held: ticketTypes.held });
        if (!updated) {
          const [tt] = await tx.select().from(ticketTypes).where(and(eq(ticketTypes.id, req.params.ticketTypeId), eq(ticketTypes.eventId, req.params.eventId)));
          if (!tt) throw notFound('Tipo de entrada');
          throw conflict('capacity_below_committed', 'La capacidad no puede ser menor a lo vendido más lo reservado.', { sold: tt.sold, held: tt.held });
        }
        await audit(tx, { orgId: access.orgId, actorUserId: access.userId, action: 'ticket_type.capacity_changed', entityType: 'ticket_type', entityId: req.params.ticketTypeId, data: { capacity: req.body.capacity }, ip: req.ip });
        return updated;
      });
    },
  );

  r.post(
    '/v1/organizations/:orgId/events/:eventId/publish',
    { schema: { tags: ['events'], summary: 'Publicar un evento en el catálogo', params: EventParams, response: { 200: EventDto } } },
    async (req) => {
      const access = await requireOrgPermission(s.db, req, req.params.orgId, 'events.publish');
      return inOrg(s.db, access, async (tx) => {
        const [e] = await tx
          .select()
          .from(events)
          .where(and(eq(events.id, req.params.eventId), eq(events.organizationId, access.orgId)))
          .for('update');
        if (!e) throw notFound('Evento');
        if (e.status !== 'draft') throw conflict('not_draft', 'Sólo se pueden publicar eventos en borrador.');
        if (e.endsAt <= s.now()) throw conflict('event_past', 'No se puede publicar un evento que ya terminó.');
        if (!e.venueId) throw conflict('venue_required', 'Asigná un lugar antes de publicar.');
        const types = await tx.select({ id: ticketTypes.id }).from(ticketTypes).where(eq(ticketTypes.eventId, e.id));
        if (types.length === 0) throw conflict('ticket_types_required', 'Creá al menos un tipo de entrada antes de publicar.');
        const [published] = await tx
          .update(events)
          .set({ status: 'published', publishedAt: s.now(), updatedAt: s.now() })
          .where(eq(events.id, e.id))
          .returning();
        await audit(tx, { orgId: access.orgId, actorUserId: access.userId, action: 'event.published', entityType: 'event', entityId: e.id, ip: req.ip });
        return published!;
      });
    },
  );

  // Cantidad de eventos a la venta por categoría (para la cinta de categorías del inicio).
  r.get(
    '/v1/public/categories',
    {
      schema: {
        tags: ['catalog'],
        summary: 'Eventos publicados y vigentes por categoría',
        response: { 200: z.object({ items: z.array(z.object({ category: z.string(), count: z.number() })) }) },
      },
    },
    async () => {
      const now = s.now();
      const rows = await withContext(s.db, {}, (tx) =>
        tx
          .select({ category: events.category, count: sql<number>`count(*)`.mapWith(Number) })
          .from(events)
          .where(and(eq(events.status, 'published'), gt(events.endsAt, now)))
          .groupBy(events.category),
      );
      return { items: rows };
    },
  );

  // Catálogo público (Lintick y white label)
  r.get(
    '/v1/public/events',
    {
      schema: {
        tags: ['catalog'],
        summary: 'Buscar eventos publicados',
        querystring: z.object({
          q: z.string().trim().min(2).max(80).optional(),
          city: z.string().trim().max(120).optional(),
          province: z.string().trim().max(120).optional(),
          category: z.string().trim().toLowerCase().max(40).optional(),
          organization: z.string().regex(SLUG_PATTERN).optional(),
          from: z.coerce.date().optional(),
          to: z.coerce.date().optional(),
          limit: z.coerce.number().int().min(1).max(50).default(20),
          /** Cursor de paginación: `<startsAt ISO>_<eventId>` del último elemento. */
          cursor: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z_[0-9a-f-]{36}$/)
            .optional(),
        }),
        response: {
          200: z.object({ items: z.array(PublicEventDto.extend({ fromPriceCents: z.number().nullable() })), nextCursor: z.string().nullable() }),
        },
      },
    },
    async (req) => {
      const qy = req.query;
      const now = s.now();
      return withContext(s.db, {}, async (tx) => {
        const conds = [eq(events.status, 'published'), gt(events.endsAt, now)];
        if (qy.q) conds.push(sql`${events.title} ILIKE ${'%' + qy.q.replace(/[%_\\]/g, '\\$&') + '%'}`);
        if (qy.category) conds.push(eq(events.category, qy.category));
        if (qy.city) conds.push(sql`lower(${venues.city}) = lower(${qy.city})`);
        if (qy.province) conds.push(sql`lower(${venues.province}) = lower(${qy.province})`);
        if (qy.organization) conds.push(eq(organizations.slug, qy.organization));
        if (qy.from) conds.push(gte(events.startsAt, qy.from));
        if (qy.to) conds.push(lte(events.startsAt, qy.to));
        if (qy.cursor) {
          const [ts, id] = [qy.cursor.slice(0, qy.cursor.indexOf('_')), qy.cursor.slice(qy.cursor.indexOf('_') + 1)];
          conds.push(sql`(${events.startsAt}, ${events.id}) > (${new Date(ts)}, ${id}::uuid)`);
        }
        const fromPrice = sql<number | null>`(
          select min(ps.price_cents)::bigint from price_stages ps
          join ticket_types tt on tt.id = ps.ticket_type_id
          where tt.event_id = ${events.id} and tt.hidden = false
            and (ps.starts_at is null or ps.starts_at <= ${now})
            and (ps.ends_at is null or ps.ends_at > ${now})
        )`.mapWith(Number);
        const rows = await tx
          .select({ event: events, org: { id: organizations.id, slug: organizations.slug, name: organizations.name }, venue: venues, fromPriceCents: fromPrice })
          .from(events)
          .innerJoin(organizations, eq(organizations.id, events.organizationId))
          .leftJoin(venues, eq(venues.id, events.venueId))
          .where(and(...conds))
          .orderBy(asc(events.startsAt), asc(events.id))
          .limit(qy.limit + 1);
        const page = rows.slice(0, qy.limit);
        const last = page.at(-1);
        const media = await loadEventMedia(tx, page.map((p) => p.event.id));
        return {
          items: page.map(({ event: e, org, venue, fromPriceCents }) => ({
            id: e.id,
            organizationId: e.organizationId,
            slug: e.slug,
            title: e.title,
            description: e.description,
            category: e.category,
            status: e.status as 'published',
            startsAt: e.startsAt,
            endsAt: e.endsAt,
            timezone: e.timezone,
            coverImageUrl: e.coverImageUrl,
            organization: org,
            venue: venue ? { id: venue.id, name: venue.name, address: venue.address, city: venue.city, province: venue.province, capacity: venue.capacity } : null,
            fromPriceCents: fromPriceCents ?? null,
            coverImage: media.get(e.id)?.cover ?? null,
          })),
          nextCursor: rows.length > qy.limit && last ? `${last.event.startsAt.toISOString()}_${last.event.id}` : null,
        };
      });
    },
  );

  r.get(
    '/v1/public/events/:eventId',
    {
      schema: {
        tags: ['catalog'],
        summary: 'Detalle público de un evento con entradas disponibles',
        params: z.object({ eventId: z.string().uuid() }),
        response: { 200: PublicEventDto.extend({ ticketTypes: z.array(PublicTicketTypeDto) }).merge(EventContentDto) },
      },
    },
    async (req) =>
      withContext(s.db, {}, async (tx) => {
        const [row] = await tx
          .select({ event: events, org: { id: organizations.id, slug: organizations.slug, name: organizations.name } })
          .from(events)
          .innerJoin(organizations, eq(organizations.id, events.organizationId))
          .where(and(eq(events.id, req.params.eventId), inArray(events.status, ['published', 'cancelled', 'finished'])));
        if (!row) throw notFound('Evento');
        const e = row.event;
        const types = (await loadTicketTypes(tx, e.id, s.now())).filter((t) => !t.hidden);
        const media = await loadEventMedia(tx, [e.id]);
        return {
          ...contentView(e, media.get(e.id)),
          id: e.id,
          organizationId: e.organizationId,
          slug: e.slug,
          title: e.title,
          description: e.description,
          category: e.category,
          status: e.status as 'published' | 'cancelled' | 'finished',
          startsAt: e.startsAt,
          endsAt: e.endsAt,
          timezone: e.timezone,
          coverImageUrl: e.coverImageUrl,
          organization: row.org,
          venue: await loadVenue(tx, e.venueId),
          ticketTypes: types.map((t) => ({
            id: t.id,
            name: t.name,
            description: t.description,
            kind: t.kind,
            currency: t.currency,
            available: e.status === 'published' ? Math.max(t.available, 0) : 0,
            maxPerOrder: t.maxPerOrder,
            salesStartAt: t.salesStartAt,
            salesEndAt: t.salesEndAt,
            saleState: e.status === 'published' ? t.saleState : ('unavailable' as const),
            currentStage: t.currentStage
              ? { id: t.currentStage.id, name: t.currentStage.name, priceCents: t.currentStage.priceCents, endsAt: t.currentStage.endsAt }
              : null,
          })),
        };
      }),
  );
}
