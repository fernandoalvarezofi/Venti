import { createPublicKey } from 'node:crypto';
import { roleHas, transitionTicket } from '@venti/domain';
import { and, asc, desc, eq, events, gt, inArray, memberships, organizations, sql, staffAssignments, ticketEvents, ticketTypes, tickets, venues, withContext } from '@venti/db';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { assertCanScanEvent } from '../../lib/access.ts';
import { audit, recordTicketEvents } from '../../lib/audit.ts';
import { notFound } from '../../lib/errors.ts';
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

  // ─── Modo sin señal ───
  // Clave pública Ed25519 en crudo (32 bytes, base64url): el celular verifica la firma del QR sin conexión.
  const publicKeyRaw = (createPublicKey(s.qrPrivateKey).export({ format: 'jwk' }) as { x: string }).x;

  const PackTicket = z.object({
    id: z.string().uuid(),
    /** Versión vigente del QR. */
    v: z.number(),
    /** Estado: valid | used | locked | void | cancelled | refunded. */
    s: z.string(),
    /** Titular. */
    n: z.string(),
    /** Tipo de entrada. */
    t: z.string(),
    /** Últimos 3 del documento (si se cargó). */
    d: z.string().nullable(),
    /** Hora de ingreso, si ya entró. */
    u: z.date().nullable(),
  });

  r.get(
    '/v1/organizations/:orgId/events/:eventId/access-pack',
    {
      config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
      schema: {
        tags: ['access'],
        summary: 'Lista de entradas para validar sin señal',
        description:
          'Clave pública y entradas del evento con sólo lo necesario para controlar (titular, tipo, últimos 3 del DNI, estado y versión del QR). Con ?since= devuelve sólo lo que cambió.',
        params: z.object({ orgId: z.string().uuid(), eventId: z.string().uuid() }),
        querystring: z.object({ since: z.coerce.date().optional() }),
        response: {
          200: z.object({ eventId: z.string().uuid(), endsAt: z.date(), publicKey: z.string(), serverTime: z.date(), full: z.boolean(), tickets: z.array(PackTicket) }),
        },
      },
    },
    async (req) => {
      const access = await requireOrgPermission(s.db, req, req.params.orgId, 'access.scan');
      const now = s.now();
      await assertCanScanEvent(s.db, access, req.params.eventId, now);
      return inOrg(s.db, access, async (tx) => {
        const [ev] = await tx
          .select({ id: events.id, endsAt: events.endsAt })
          .from(events)
          .where(and(eq(events.id, req.params.eventId), eq(events.organizationId, access.orgId)));
        if (!ev) throw notFound('Evento');
        const since = req.query.since;
        const conds = [eq(tickets.eventId, ev.id)];
        // Margen de 5 s para no perder cambios hechos justo durante la descarga anterior.
        if (since) conds.push(gt(tickets.updatedAt, new Date(since.getTime() - 5000)));
        const rows = await tx
          .select({ id: tickets.id, v: tickets.qrVersion, s: tickets.status, n: tickets.holderName, t: ticketTypes.name, d: tickets.holderDocLast3, u: tickets.usedAt })
          .from(tickets)
          .innerJoin(ticketTypes, eq(ticketTypes.id, tickets.ticketTypeId))
          .where(and(...conds));
        if (!since) {
          await audit(tx, { orgId: access.orgId, actorUserId: access.userId, action: 'access_pack.downloaded', entityType: 'event', entityId: ev.id, data: { tickets: rows.length }, ip: req.ip });
        }
        return { eventId: ev.id, endsAt: ev.endsAt, publicKey: publicKeyRaw, serverTime: now, full: !since, tickets: rows };
      });
    },
  );

  r.post(
    '/v1/organizations/:orgId/events/:eventId/check-in/sync',
    {
      config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
      schema: {
        tags: ['access'],
        summary: 'Subir los ingresos registrados sin señal',
        description:
          'Aplica cada ingreso en orden de hora. Si la entrada ya había ingresado por otro lado, se informa como duplicado y queda registrado para auditoría. Reintentar el mismo lote es seguro.',
        params: z.object({ orgId: z.string().uuid(), eventId: z.string().uuid() }),
        body: z.object({
          deviceId: z.string().trim().min(8).max(80),
          entries: z
            .array(z.object({ ticketId: z.string().uuid(), version: z.number().int().min(1), scannedAt: z.coerce.date(), gate: z.string().trim().max(60).nullish() }))
            .min(1)
            .max(500),
        }),
        response: {
          200: z.object({
            results: z.array(
              z.object({
                ticketId: z.string().uuid(),
                scannedAt: z.date(),
                result: z.enum(['admitted', 'duplicate', 'not_valid', 'outdated_qr', 'not_found']),
                usedAt: z.date().nullable(),
                holderName: z.string().nullable(),
              }),
            ),
          }),
        },
      },
    },
    async (req) => {
      const access = await requireOrgPermission(s.db, req, req.params.orgId, 'access.scan');
      const now = s.now();
      await assertCanScanEvent(s.db, access, req.params.eventId, now);
      const entries = [...req.body.entries].sort((a, b) => a.scannedAt.getTime() - b.scannedAt.getTime());
      return inOrg(s.db, access, async (tx) => {
        const results: {
          ticketId: string;
          scannedAt: Date;
          result: 'admitted' | 'duplicate' | 'not_valid' | 'outdated_qr' | 'not_found';
          usedAt: Date | null;
          holderName: string | null;
        }[] = [];
        for (const e of entries) {
          // Una hora "del futuro" (reloj del celular adelantado) se toma como ahora.
          const at = e.scannedAt.getTime() > now.getTime() ? now : e.scannedAt;
          const [t] = await tx
            .select()
            .from(tickets)
            .where(and(eq(tickets.id, e.ticketId), eq(tickets.eventId, req.params.eventId)))
            .for('update');
          if (!t) {
            results.push({ ticketId: e.ticketId, scannedAt: e.scannedAt, result: 'not_found', usedAt: null, holderName: null });
            continue;
          }
          const base = { ticketId: t.id, scannedAt: e.scannedAt, holderName: t.holderName };
          const data = { offline: true, deviceId: req.body.deviceId, gate: e.gate ?? null, scannedAt: e.scannedAt.toISOString() };
          if (t.status === 'used') {
            // Reintento del mismo lote: mismo instante ⇒ ya aplicado, no es un duplicado.
            if (t.usedAt && t.usedAt.getTime() === at.getTime()) {
              results.push({ ...base, result: 'admitted', usedAt: t.usedAt });
              continue;
            }
            await recordTicketEvents(tx, [
              { orgId: access.orgId, ticketId: t.id, type: 'duplicate_entry', actorUserId: access.userId, data: { ...data, firstUsedAt: t.usedAt?.toISOString() ?? null } },
            ]);
            results.push({ ...base, result: 'duplicate', usedAt: t.usedAt });
            continue;
          }
          if (t.status !== 'valid') {
            await recordTicketEvents(tx, [{ orgId: access.orgId, ticketId: t.id, type: 'offline_entry_rejected', actorUserId: access.userId, data: { ...data, status: t.status } }]);
            results.push({ ...base, result: 'not_valid', usedAt: t.usedAt });
            continue;
          }
          if (t.qrVersion !== e.version) {
            await recordTicketEvents(tx, [{ orgId: access.orgId, ticketId: t.id, type: 'offline_entry_rejected', actorUserId: access.userId, data: { ...data, reason: 'outdated_qr' } }]);
            results.push({ ...base, result: 'outdated_qr', usedAt: null });
            continue;
          }
          const [used] = await tx
            .update(tickets)
            .set({ status: transitionTicket(t.status, 'check_in'), usedAt: at, updatedAt: now })
            .where(eq(tickets.id, t.id))
            .returning();
          await recordTicketEvents(tx, [{ orgId: access.orgId, ticketId: t.id, type: 'checked_in', actorUserId: access.userId, data }]);
          results.push({ ...base, result: 'admitted', usedAt: used!.usedAt });
        }
        return { results };
      });
    },
  );
}
