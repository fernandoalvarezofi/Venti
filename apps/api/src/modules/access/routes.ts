import { roleHas } from '@venti/domain';
import { and, asc, desc, eq, events, gt, inArray, memberships, organizations, sql, staffAssignments, ticketEvents, ticketTypes, tickets, venues, withContext } from '@venti/db';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { assertCanScanEvent } from '../../lib/access.ts';
import { requireAuth, requireOrgPermission, inOrg, type Services } from '../../lib/context.ts';

const AccessEvent = z.object({
  orgId: z.string().uuid(),
  orgName: z.string(),
  eventId: z.string().uuid(),
  title: z.string(),
  startsAt: z.date(),
  endsAt: z.date(),
  venueName: z.string().nullable(),
  /** Para el personal de acceso: su turno. Para dueños/encargados: null (pueden controlar siempre). */
  shift: z.object({ from: z.date(), until: z.date() }).nullable(),
});

const Summary = z.object({
  admitted: z.number(),
  expected: z.number(),
  recent: z.array(z.object({ ticketId: z.string().uuid(), holderName: z.string(), ticketTypeName: z.string(), at: z.date(), gate: z.string().nullable() })),
});

/** Lintick Access: qué eventos puede controlar cada persona y cómo va el ingreso. */
export async function accessRoutes(app: FastifyInstance, s: Services): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    '/v1/me/access-events',
    { schema: { tags: ['access'], summary: 'Eventos que puedo controlar en la puerta', response: { 200: z.object({ items: z.array(AccessEvent) }) } } },
    async (req) => {
      const { userId } = requireAuth(req);
      const now = s.now();
      // Eventos que siguen abiertos: terminan dentro de las últimas 12 h o más adelante.
      const openSince = new Date(now.getTime() - 12 * 3_600_000);
      const mine = await withContext(s.db, { userId }, (tx) =>
        tx
          .select({ orgId: memberships.organizationId, role: memberships.role, orgName: organizations.name })
          .from(memberships)
          .innerJoin(organizations, eq(organizations.id, memberships.organizationId))
          .where(eq(memberships.userId, userId)),
      );
      const items: z.infer<typeof AccessEvent>[] = [];
      for (const m of mine) {
        if (!roleHas(m.role, 'access.scan')) continue;
        const access = { orgId: m.orgId, userId, role: m.role };
        const rows = await inOrg(s.db, access, async (tx) => {
          const base = tx
            .select({ e: events, venueName: venues.name })
            .from(events)
            .leftJoin(venues, eq(venues.id, events.venueId))
            .where(and(eq(events.organizationId, m.orgId), eq(events.status, 'published'), gt(events.endsAt, openSince)))
            .orderBy(asc(events.startsAt))
            .limit(50);
          const evs = await base;
          if (m.role !== 'access_staff') return evs.map((x) => ({ ...x, shift: null }));
          const shifts = await tx
            .select()
            .from(staffAssignments)
            .where(and(eq(staffAssignments.userId, userId), gt(staffAssignments.validUntil, now), inArray(staffAssignments.eventId, evs.length ? evs.map((x) => x.e.id) : ['00000000-0000-0000-0000-000000000000'])))
            .orderBy(asc(staffAssignments.validFrom));
          return evs.flatMap((x) => {
            const sh = shifts.find((a) => a.eventId === x.e.id);
            return sh ? [{ ...x, shift: { from: sh.validFrom, until: sh.validUntil } }] : [];
          });
        });
        for (const x of rows) {
          items.push({ orgId: m.orgId, orgName: m.orgName, eventId: x.e.id, title: x.e.title, startsAt: x.e.startsAt, endsAt: x.e.endsAt, venueName: x.venueName, shift: x.shift });
        }
      }
      items.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
      return { items };
    },
  );

  r.get(
    '/v1/organizations/:orgId/events/:eventId/check-in/summary',
    {
      config: { rateLimit: { max: 240, timeWindow: '1 minute' } },
      schema: {
        tags: ['access'],
        summary: 'Contador de ingresos y últimos ingresos (para la pantalla de control)',
        params: z.object({ orgId: z.string().uuid(), eventId: z.string().uuid() }),
        response: { 200: Summary },
      },
    },
    async (req) => {
      const access = await requireOrgPermission(s.db, req, req.params.orgId, 'access.scan');
      await assertCanScanEvent(s.db, access, req.params.eventId, s.now());
      return inOrg(s.db, access, async (tx) => {
        const [counts] = await tx
          .select({
            admitted: sql<number>`count(*) filter (where ${tickets.status} = 'used')`.mapWith(Number),
            expected: sql<number>`count(*) filter (where ${tickets.status} in ('valid','used','locked'))`.mapWith(Number),
          })
          .from(tickets)
          .where(eq(tickets.eventId, req.params.eventId));
        const recent = await tx
          .select({ ticketId: tickets.id, holderName: tickets.holderName, ticketTypeName: ticketTypes.name, at: ticketEvents.occurredAt, data: ticketEvents.data })
          .from(ticketEvents)
          .innerJoin(tickets, eq(tickets.id, ticketEvents.ticketId))
          .innerJoin(ticketTypes, eq(ticketTypes.id, tickets.ticketTypeId))
          .where(and(eq(tickets.eventId, req.params.eventId), eq(ticketEvents.type, 'checked_in')))
          .orderBy(desc(ticketEvents.occurredAt))
          .limit(8);
        return {
          admitted: counts?.admitted ?? 0,
          expected: counts?.expected ?? 0,
          recent: recent.map((x) => ({ ticketId: x.ticketId, holderName: x.holderName, ticketTypeName: x.ticketTypeName, at: x.at, gate: ((x.data as { gate?: string | null }).gate ?? null) as string | null })),
        };
      });
    },
  );
}
