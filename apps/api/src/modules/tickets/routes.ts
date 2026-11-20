import { createPublicKey, randomUUID } from 'node:crypto';
import { TICKET_STATUSES, isTerminal, signTicketQr, transitionTicket, verifyTicketQr } from '@venti/domain';
import { and, desc, eq, events, gt, isNotNull, lte, sql, staffAssignments, ticketClaims, ticketEvents, ticketTypes, tickets, users, venues, withContext } from '@venti/db';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { audit, recordTicketEvents } from '../../lib/audit.ts';
import { inOrg, requireAuth, requireOrgPermission, type Services } from '../../lib/context.ts';
import { AppError, conflict, notFound } from '../../lib/errors.ts';
import { protectDocument } from '../../lib/identity.ts';

const TicketDto = z.object({
  id: z.string().uuid(),
  status: z.enum(TICKET_STATUSES),
  holderName: z.string(),
  ticketType: z.object({ id: z.string().uuid(), name: z.string(), kind: z.string() }),
  event: z.object({ id: z.string().uuid(), title: z.string(), startsAt: z.date(), endsAt: z.date(), venueName: z.string().nullable(), city: z.string().nullable() }),
  priceCents: z.number(),
  currency: z.string(),
  issuedAt: z.date(),
  usedAt: z.date().nullable(),
  /** Sólo presente si el ticket habilita el ingreso. */
  qr: z.string().nullable(),
});

const HistoryDto = z.array(z.object({ type: z.string(), occurredAt: z.date(), data: z.record(z.string(), z.unknown()) }));

const ScanResult = z.object({
  result: z.enum(['admitted', 'already_used', 'invalid_signature', 'malformed', 'wrong_event', 'not_found', 'outdated_qr', 'not_valid']),
  message: z.string(),
  ticket: z
    .object({ id: z.string().uuid(), holderName: z.string(), holderDocLast3: z.string().nullable(), ticketTypeName: z.string(), status: z.enum(TICKET_STATUSES), usedAt: z.date().nullable() })
    .nullable(),
});

type ScanResultCode = z.infer<typeof ScanResult>['result'];

const SCAN_MESSAGES: Record<ScanResultCode, string> = {
  admitted: 'Ingreso habilitado.',
  already_used: 'Esta entrada ya ingresó.',
  invalid_signature: 'QR falsificado o alterado.',
  malformed: 'El código no es una entrada LinTICK.',
  wrong_event: 'La entrada es de otro evento.',
  not_found: 'Entrada inexistente.',
  outdated_qr: 'QR desactualizado: el titular regeneró su entrada. Pedí el QR vigente.',
  not_valid: 'La entrada fue anulada, devuelta o transferida.',
};

export async function ticketRoutes(app: FastifyInstance, s: Services): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const publicKey = createPublicKey(s.qrPrivateKey);

  const ticketSelect = {
    t: tickets,
    typeName: ticketTypes.name,
    typeKind: ticketTypes.kind,
    eventTitle: events.title,
    startsAt: events.startsAt,
    endsAt: events.endsAt,
    venueName: venues.name,
    city: venues.city,
  };
  type TicketRow = {
    t: typeof tickets.$inferSelect;
    typeName: string;
    typeKind: string;
    eventTitle: string;
    startsAt: Date;
    endsAt: Date;
    venueName: string | null;
    city: string | null;
  };
  const toDto = (row: TicketRow): z.infer<typeof TicketDto> => ({
    id: row.t.id,
    status: row.t.status,
    holderName: row.t.holderName,
    ticketType: { id: row.t.ticketTypeId, name: row.typeName, kind: row.typeKind },
    event: { id: row.t.eventId, title: row.eventTitle, startsAt: row.startsAt, endsAt: row.endsAt, venueName: row.venueName, city: row.city },
    priceCents: row.t.priceCents,
    currency: row.t.currency,
    issuedAt: row.t.issuedAt,
    usedAt: row.t.usedAt,
    qr: row.t.status === 'valid' ? signTicketQr({ ticketId: row.t.id, version: row.t.qrVersion, eventId: row.t.eventId }, s.qrPrivateKey) : null,
  });

  // ─── Cortesías (panel) ───
  r.post(
    '/v1/organizations/:orgId/events/:eventId/courtesies',
    {
      schema: {
        tags: ['tickets'],
        summary: 'Emitir cortesías',
        description: 'Emite tickets sin cargo descontando stock real. Si el email pertenece a una cuenta VERIFICADA, el ticket aparece en su app; si no, queda pendiente hasta que alguien confirme ese email.',
        params: z.object({ orgId: z.string().uuid(), eventId: z.string().uuid() }),
        body: z.object({
          ticketTypeId: z.string().uuid(),
          quantity: z.number().int().min(1).max(50),
          holderName: z.string().trim().min(2).max(120),
          holderEmail: z.string().trim().toLowerCase().email(),
          // Acepta "30.111.222" o "30111222": se normaliza y valida en protectDocument.
          holderDocument: z.string().trim().max(15).optional(),
          note: z.string().trim().max(500).optional(),
        }),
        response: { 201: z.object({ ticketIds: z.array(z.string().uuid()), pendingClaim: z.boolean() }) },
      },
    },
    async (req, reply) => {
      const access = await requireOrgPermission(s.db, req, req.params.orgId, 'tickets.courtesy');
      const b = req.body;
      // H1: sólo se entrega directo a una cuenta que DEMOSTRÓ controlar ese email.
      const [owner] = await s.db
        .select({ id: users.id })
        .from(users)
        .where(and(sql`lower(${users.email}) = ${b.holderEmail}`, isNotNull(users.emailVerifiedAt)));
      // H3: el DNI nunca se guarda en claro.
      const doc = b.holderDocument ? protectDocument(s.docKey, access.orgId, b.holderDocument) : null;
      if (b.holderDocument && !doc) throw new AppError(400, 'invalid_document', 'DNI inválido.');
      const ticketIds = await inOrg(s.db, access, async (tx) => {
        const [e] = await tx.select().from(events).where(and(eq(events.id, req.params.eventId), eq(events.organizationId, access.orgId)));
        if (!e) throw notFound('Evento');
        if (e.status === 'cancelled' || e.status === 'finished') throw conflict('event_closed', 'El evento está cerrado.');
        const [tt] = await tx
          .update(ticketTypes)
          .set({ sold: sql`${ticketTypes.sold} + ${b.quantity}` })
          .where(
            and(
              eq(ticketTypes.id, b.ticketTypeId),
              eq(ticketTypes.eventId, e.id),
              sql`${ticketTypes.sold} + ${ticketTypes.held} + ${b.quantity} <= ${ticketTypes.capacity}`,
            ),
          )
          .returning();
        if (!tt) {
          const [exists] = await tx.select({ id: ticketTypes.id }).from(ticketTypes).where(and(eq(ticketTypes.id, b.ticketTypeId), eq(ticketTypes.eventId, e.id)));
          if (!exists) throw notFound('Tipo de entrada');
          throw conflict('insufficient_stock', 'No queda stock suficiente para emitir esas cortesías.');
        }
        const ids = Array.from({ length: b.quantity }, () => randomUUID());
        await tx.insert(tickets).values(
          ids.map((id) => ({
            id,
            organizationId: access.orgId,
            eventId: e.id,
            ticketTypeId: tt.id,
            ownerUserId: owner?.id ?? null,
            assignmentStatus: owner ? ('assigned' as const) : ('pending_claim' as const),
            holderName: b.holderName,
            holderEmail: b.holderEmail,
            holderDocHmac: doc?.hmac ?? null,
            holderDocLast3: doc?.last3 ?? null,
            priceCents: 0,
            currency: tt.currency,
          })),
        );
        if (!owner) {
          // Reclamo abierto hasta el fin del evento: se resuelve cuando alguien confirma ese email.
          await tx.insert(ticketClaims).values(ids.map((id) => ({ id: randomUUID(), organizationId: access.orgId, ticketId: id, emailLower: b.holderEmail, expiresAt: e.endsAt })));
        }
        await recordTicketEvents(
          tx,
          ids.map((id) => ({ orgId: access.orgId, ticketId: id, type: 'issued', actorUserId: access.userId, data: { reason: 'courtesy', note: b.note ?? null, pendingClaim: !owner } })),
        );
        await audit(tx, {
          orgId: access.orgId,
          actorUserId: access.userId,
          action: 'tickets.courtesy_issued',
          entityType: 'event',
          entityId: e.id,
          data: { ticketTypeId: tt.id, quantity: b.quantity, holderEmail: b.holderEmail },
          ip: req.ip,
        });
        return { ids, eventTitle: e.title };
      });
      // Aviso al invitado (si el proveedor de email no está configurado, la cortesía igual queda emitida).
      if (s.email.enabled) {
        await s.email
          .send({
            to: b.holderEmail,
            kind: owner ? 'tickets_assigned' : 'tickets_pending_claim',
            subject: `Tenés ${b.quantity === 1 ? 'una entrada' : `${b.quantity} entradas`} para ${ticketIds.eventTitle}`,
            text: owner
              ? `Ya están en "Mis entradas": ${s.config.PUBLIC_WEB_URL}/mis-entradas`
              : `Para recibirlas, creá tu cuenta en LinTICK con este mismo email y confirmalo: ${s.config.PUBLIC_WEB_URL}/registrarse?next=/mis-entradas
Si ya tenés cuenta, ingresá y confirmá tu email.`,
          })
          .catch((err) => req.log.warn({ err }, 'No se pudo avisar por email de una cortesía'));
      }
      return reply.status(201).send({ ticketIds: ticketIds.ids, pendingClaim: !owner });
    },
  );

  // ─── Mis entradas (comprador, cualquier organización) ───
  r.get('/v1/me/tickets', { schema: { tags: ['tickets'], summary: 'Mis entradas', response: { 200: z.object({ items: z.array(TicketDto) }) } } }, async (req) => {
    const { userId } = requireAuth(req);
    const rows = await withContext(s.db, { userId }, (tx) =>
      tx
        .select(ticketSelect)
        .from(tickets)
        .innerJoin(ticketTypes, eq(ticketTypes.id, tickets.ticketTypeId))
        .innerJoin(events, eq(events.id, tickets.eventId))
        .leftJoin(venues, eq(venues.id, events.venueId))
        .where(eq(tickets.ownerUserId, userId))
        .orderBy(desc(events.startsAt)),
    );
    return { items: rows.map(toDto) };
  });

  r.get(
    '/v1/me/tickets/:ticketId',
    {
      schema: {
        tags: ['tickets'],
        summary: 'Detalle e historial de una entrada propia',
        params: z.object({ ticketId: z.string().uuid() }),
        response: { 200: TicketDto.extend({ history: HistoryDto }) },
      },
    },
    async (req) => {
      const { userId } = requireAuth(req);
      return withContext(s.db, { userId }, async (tx) => {
        const [row] = await tx
          .select(ticketSelect)
          .from(tickets)
          .innerJoin(ticketTypes, eq(ticketTypes.id, tickets.ticketTypeId))
          .innerJoin(events, eq(events.id, tickets.eventId))
          .leftJoin(venues, eq(venues.id, events.venueId))
          .where(and(eq(tickets.id, req.params.ticketId), eq(tickets.ownerUserId, userId)));
        if (!row) throw notFound('Entrada');
        const history = await tx
          .select({ type: ticketEvents.type, occurredAt: ticketEvents.occurredAt, data: ticketEvents.data })
          .from(ticketEvents)
          .where(eq(ticketEvents.ticketId, row.t.id))
          .orderBy(ticketEvents.occurredAt);
        return { ...toDto(row), history: history.map((h) => ({ ...h, data: (h.data ?? {}) as Record<string, unknown> })) };
      });
    },
  );

  r.post(
    '/v1/me/tickets/:ticketId/rotate-qr',
    {
      schema: {
        tags: ['tickets'],
        summary: 'Regenerar el QR de una entrada propia',
        description: 'Invalida el QR anterior (por ejemplo, si se compartió una captura). No cambia el titular.',
        params: z.object({ ticketId: z.string().uuid() }),
        response: { 200: z.object({ qr: z.string() }) },
      },
    },
    async (req) => {
      const { userId } = requireAuth(req);
      const [own] = await withContext(s.db, { userId }, (tx) =>
        tx.select({ id: tickets.id, organizationId: tickets.organizationId }).from(tickets).where(and(eq(tickets.id, req.params.ticketId), eq(tickets.ownerUserId, userId))),
      );
      if (!own) throw notFound('Entrada');
      return withContext(s.db, { orgId: own.organizationId, userId }, async (tx) => {
        const [t] = await tx
          .update(tickets)
          .set({ qrVersion: sql`${tickets.qrVersion} + 1`, updatedAt: s.now() })
          .where(and(eq(tickets.id, own.id), eq(tickets.ownerUserId, userId), eq(tickets.status, 'valid')))
          .returning();
        if (!t) throw conflict('ticket_not_valid', 'Sólo se puede regenerar el QR de una entrada vigente.');
        await recordTicketEvents(tx, [{ orgId: t.organizationId, ticketId: t.id, type: 'qr_rotated', actorUserId: userId, data: { version: t.qrVersion } }]);
        return { qr: signTicketQr({ ticketId: t.id, version: t.qrVersion, eventId: t.eventId }, s.qrPrivateKey) };
      });
    },
  );

  // ─── Control de acceso online (base de LinTICK Access) ───
  r.post(
    '/v1/organizations/:orgId/events/:eventId/check-in',
    {
      config: { rateLimit: { max: 600, timeWindow: '1 minute' } },
      schema: {
        tags: ['access'],
        summary: 'Validar un QR y registrar el ingreso',
        description: 'Verifica la firma Ed25519, el evento, la versión del QR y el estado. El primer escaneo gana: los siguientes devuelven already_used.',
        params: z.object({ orgId: z.string().uuid(), eventId: z.string().uuid() }),
        body: z.object({ qr: z.string().max(512), gate: z.string().trim().max(60).optional(), deviceId: z.string().trim().max(80).optional() }),
        response: { 200: ScanResult },
      },
    },
    async (req) => {
      const access = await requireOrgPermission(s.db, req, req.params.orgId, 'access.scan');
      // H4: el personal de acceso sólo escanea eventos donde tiene una asignación vigente (evento + turno).
      if (access.role === 'access_staff') {
        const now = s.now();
        const [assignment] = await inOrg(s.db, access, (tx) =>
          tx
            .select({ id: staffAssignments.id })
            .from(staffAssignments)
            .where(
              and(
                eq(staffAssignments.eventId, req.params.eventId),
                eq(staffAssignments.userId, access.userId),
                lte(staffAssignments.validFrom, now),
                gt(staffAssignments.validUntil, now),
              ),
            ),
        );
        if (!assignment) throw new AppError(403, 'not_assigned', 'No tenés un turno asignado en este evento ahora.');
      }
      const verdict = verifyTicketQr(req.body.qr, publicKey);
      if (!verdict.ok) {
        const result: ScanResultCode = verdict.reason === 'bad_signature' ? 'invalid_signature' : 'malformed';
        return { result, message: SCAN_MESSAGES[result], ticket: null };
      }
      const { claims } = verdict;
      if (claims.eventId !== req.params.eventId) return { result: 'wrong_event' as const, message: SCAN_MESSAGES.wrong_event, ticket: null };

      return inOrg(s.db, access, async (tx) => {
        const [row] = await tx
          .select({ t: tickets, typeName: ticketTypes.name })
          .from(tickets)
          .innerJoin(ticketTypes, eq(ticketTypes.id, tickets.ticketTypeId))
          .where(and(eq(tickets.id, claims.ticketId), eq(tickets.eventId, req.params.eventId)))
          .for('update', { of: tickets });
        if (!row) return { result: 'not_found' as const, message: SCAN_MESSAGES.not_found, ticket: null };
        const view = (t: typeof tickets.$inferSelect) => ({ id: t.id, holderName: t.holderName, holderDocLast3: t.holderDocLast3, ticketTypeName: row.typeName, status: t.status, usedAt: t.usedAt });
        const t = row.t;
        if (t.status === 'used') return { result: 'already_used' as const, message: SCAN_MESSAGES.already_used, ticket: view(t) };
        if (isTerminal(t.status) || t.status !== 'valid') return { result: 'not_valid' as const, message: SCAN_MESSAGES.not_valid, ticket: view(t) };
        if (t.qrVersion !== claims.version) return { result: 'outdated_qr' as const, message: SCAN_MESSAGES.outdated_qr, ticket: view(t) };

        const now = s.now();
        const [used] = await tx
          .update(tickets)
          .set({ status: transitionTicket(t.status, 'check_in'), usedAt: now, updatedAt: now })
          .where(eq(tickets.id, t.id))
          .returning();
        await recordTicketEvents(tx, [
          { orgId: access.orgId, ticketId: t.id, type: 'checked_in', actorUserId: access.userId, data: { gate: req.body.gate ?? null, deviceId: req.body.deviceId ?? null } },
        ]);
        return { result: 'admitted' as const, message: SCAN_MESSAGES.admitted, ticket: view(used!) };
      });
    },
  );
}
