import { createPublicKey, randomUUID } from 'node:crypto';
import { TICKET_STATUSES, isTerminal, signTicketQr, transitionTicket, verifyTicketQr } from '@venti/domain';
import { and, desc, eq, events, gt, ne, or, isNotNull, lte, organizations, sql, staffAssignments, ticketClaims, ticketEvents, ticketTypes, tickets, users, venues, withContext } from '@venti/db';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { audit, recordTicketEvents } from '../../lib/audit.ts';
import { inOrg, keyByStaffSession, requireAuth, requireOrgPermission, type Services } from '../../lib/context.ts';
import { AppError, conflict, notFound } from '../../lib/errors.ts';
import { simpleEmail } from '../../lib/email-layout.ts';
import { sendCourtesyTickets, sendPurchasePreview } from '../payments/emails.ts';
import { commissionBpsFromSettings } from '../inventory/service.ts';
import { assertCanScanEvent } from '../../lib/access.ts';
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
    .object({
      id: z.string().uuid(),
      holderName: z.string(),
      holderDocLast3: z.string().nullable(),
      ticketTypeName: z.string(),
      status: z.enum(TICKET_STATUSES),
      usedAt: z.date().nullable(),
      /** Si ya entró: nombre de quien lo dejó pasar y por qué puerta. */
      usedByName: z.string().nullable().optional(),
      usedGate: z.string().nullable().optional(),
    })
    .nullable(),
});

type ScanResultCode = z.infer<typeof ScanResult>['result'];

const SCAN_MESSAGES: Record<ScanResultCode | 'transfer_pending', string> = {
  admitted: 'Ingreso habilitado.',
  already_used: 'Esta entrada ya ingresó.',
  invalid_signature: 'QR falsificado o alterado.',
  malformed: 'El código no es una entrada Lintick.',
  wrong_event: 'La entrada es de otro evento.',
  not_found: 'Entrada inexistente.',
  outdated_qr: 'QR desactualizado: el titular regeneró su entrada. Pedí el QR vigente.',
  not_valid: 'La entrada fue anulada, devuelta o transferida.',
  transfer_pending: 'Transferencia en curso: quien la recibió todavía no la aceptó. Pedile que la acepte (o que se cancele) y que muestre el QR nuevo.',
};

/** Quién dejó pasar una entrada (último ingreso registrado): nombre del personal y puerta. */
async function admittedBy(tx: Parameters<Parameters<typeof withContext>[2]>[0], ticketId: string): Promise<{ usedByName: string | null; usedGate: string | null }> {
  const [ev] = await tx
    .select({ name: users.fullName, data: ticketEvents.data })
    .from(ticketEvents)
    .leftJoin(users, eq(users.id, ticketEvents.actorUserId))
    .where(and(eq(ticketEvents.ticketId, ticketId), eq(ticketEvents.type, 'checked_in')))
    .orderBy(desc(ticketEvents.occurredAt))
    .limit(1);
  return { usedByName: ev?.name ?? null, usedGate: ((ev?.data as { gate?: string | null } | undefined)?.gate ?? null) as string | null };
}

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

  // ─── Vista previa del mail de compra (panel): la productora ve cómo le llega a su público ───
  r.post(
    '/v1/organizations/:orgId/events/:eventId/email-preview',
    {
      config: { rateLimit: { max: 5, timeWindow: '10 minutes' } },
      schema: {
        tags: ['tickets'],
        summary: 'Enviar un mail de compra de ejemplo',
        description: 'Manda el mail de confirmación de compra de este evento con un pedido de ejemplo (marcado como vista previa). No crea entradas ni pagos.',
        params: z.object({ orgId: z.string().uuid(), eventId: z.string().uuid() }),
        body: z.object({ to: z.string().trim().toLowerCase().email(), name: z.string().trim().min(1).max(60).default('Ana') }),
        response: { 202: z.object({ sent: z.boolean() }) },
      },
    },
    async (req, reply) => {
      const access = await requireOrgPermission(s.db, req, req.params.orgId, 'tickets.courtesy');
      if (!s.email.enabled) throw new AppError(503, 'email_unavailable', 'El envío de mails no está configurado.');
      const [org] = await inOrg(s.db, access, (tx) => tx.select({ settings: organizations.settings }).from(organizations).where(eq(organizations.id, access.orgId)));
      const sent = await sendPurchasePreview(s, access.orgId, req.params.eventId, req.body.to, req.body.name, commissionBpsFromSettings(org?.settings));
      if (!sent) throw notFound('Evento');
      await inOrg(s.db, access, (tx) => audit(tx, { orgId: access.orgId, actorUserId: access.userId, action: 'event.email_preview_sent', entityType: 'event', entityId: req.params.eventId, data: { to: req.body.to }, ip: req.ip }));
      return reply.status(202).send({ sent: true });
    },
  );

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
        .select({ id: users.id, fullName: users.fullName })
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
      if (s.email.enabled && owner) {
        // Ya tiene cuenta: mail con el diseño de entradas (portada, datos y talones).
        await sendCourtesyTickets(s, access.orgId, ticketIds.ids, b.holderEmail, owner.fullName).catch((err) => req.log.warn({ err }, 'No se pudo avisar por email de una cortesía'));
      } else if (s.email.enabled) {
        await s.email
          .send({
            to: b.holderEmail,
            kind: owner ? 'tickets_assigned' : 'tickets_pending_claim',
            subject: `Tenés ${b.quantity === 1 ? 'una entrada' : `${b.quantity} entradas`} para ${ticketIds.eventTitle}`,
            text: owner
              ? `Ya están en "Mis entradas": ${s.config.PUBLIC_WEB_URL}/mis-entradas`
              : `Para recibirlas, creá tu cuenta en Lintick con este mismo email y confirmalo: ${s.config.PUBLIC_WEB_URL}/registrarse?next=/mis-entradas
Si ya tenés cuenta, ingresá y confirmá tu email.`,
            html: simpleEmail({
              web: s.config.PUBLIC_WEB_URL.replace(/\/+$/, ''),
              preheader: `Te invitaron a ${ticketIds.eventTitle}.`,
              title: `Tenés ${b.quantity === 1 ? 'una entrada' : `${b.quantity} entradas`} para ${ticketIds.eventTitle}`,
              paragraphs: owner
                ? ['¡Te invitaron! Tus entradas ya están en "Mis entradas". Mostrá el QR en la puerta: funciona aunque no tengas señal.']
                : ['¡Te invitaron! Para recibir tus entradas, creá tu cuenta en Lintick con este mismo email y confirmalo.', 'Si ya tenés cuenta, ingresá y confirmá tu email.'],
              cta: owner ? { href: `${s.config.PUBLIC_WEB_URL.replace(/\/+$/, '')}/mis-entradas`, label: 'Ver mis entradas' } : { href: `${s.config.PUBLIC_WEB_URL.replace(/\/+$/, '')}/registrarse?next=/mis-entradas`, label: 'Crear mi cuenta y recibirlas' },
              reason: 'Te llega este mail porque una productora te envió entradas por Lintick.',
            }),
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
        // Las anuladas por reemplazo (transferidas o reemitidas) no se muestran: la vigente es la nueva.
        .where(and(eq(tickets.ownerUserId, userId), ne(tickets.status, 'void')))
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

  // ─── Control de acceso online (base de Lintick Access) ───
  r.post(
    '/v1/organizations/:orgId/events/:eventId/check-in',
    {
      config: { rateLimit: { max: 1200, timeWindow: '1 minute', keyGenerator: keyByStaffSession } },
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
      await assertCanScanEvent(s.db, access, req.params.eventId, s.now());
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
        if (t.status === 'used') return { result: 'already_used' as const, message: SCAN_MESSAGES.already_used, ticket: { ...view(t), ...(await admittedBy(tx, t.id)) } };
        if (t.status === 'locked') return { result: 'not_valid' as const, message: SCAN_MESSAGES.transfer_pending, ticket: view(t) };
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

  // ─── Búsqueda manual en la puerta (por nombre, email, número de entrada o últimos 3 del DNI) ───
  r.get(
    '/v1/organizations/:orgId/events/:eventId/check-in/search',
    {
      config: { rateLimit: { max: 120, timeWindow: '1 minute', keyGenerator: keyByStaffSession } },
      schema: {
        tags: ['access'],
        summary: 'Buscar entradas del evento a mano',
        params: z.object({ orgId: z.string().uuid(), eventId: z.string().uuid() }),
        querystring: z.object({ q: z.string().trim().min(2).max(80) }),
        response: {
          200: z.object({
            items: z.array(
              z.object({ id: z.string().uuid(), holderName: z.string(), email: z.string(), holderDocLast3: z.string().nullable(), ticketTypeName: z.string(), status: z.enum(TICKET_STATUSES), usedAt: z.date().nullable(), usedByName: z.string().nullable(), usedGate: z.string().nullable() }),
            ),
          }),
        },
      },
    },
    async (req) => {
      const access = await requireOrgPermission(s.db, req, req.params.orgId, 'access.scan');
      await assertCanScanEvent(s.db, access, req.params.eventId, s.now());
      const q = req.query.q;
      const code = q.replace(/[^0-9a-f]/gi, '').toLowerCase();
      const like = `%${q.replace(/[%_\\]/g, (m) => '\\' + m)}%`;
      return inOrg(s.db, access, async (tx) => {
        const rows = await tx
          .select({ t: tickets, typeName: ticketTypes.name })
          .from(tickets)
          .innerJoin(ticketTypes, eq(ticketTypes.id, tickets.ticketTypeId))
          .where(
            and(
              eq(tickets.eventId, req.params.eventId),
              ne(tickets.status, 'void'),
              or(
                sql`${tickets.holderName} ilike ${like}`,
                sql`lower(${tickets.holderEmail}) like lower(${like})`,
                code.length >= 4 ? sql`replace(${tickets.id}::text, '-', '') like ${code + '%'}` : sql`false`,
                /^\d{3}$/.test(q) ? eq(tickets.holderDocLast3, q) : sql`false`,
              ),
            ),
          )
          .orderBy(tickets.holderName)
          .limit(15);
        const items = [];
        for (const r0 of rows) {
          const by = r0.t.status === 'used' ? await admittedBy(tx, r0.t.id) : { usedByName: null, usedGate: null };
          items.push({
            id: r0.t.id,
            holderName: r0.t.holderName,
            email: r0.t.holderEmail.replace(/^(.)(.*)(@.*)$/, (_m, a: string, b: string, c: string) => a + '•'.repeat(Math.min(b.length, 5)) + c),
            holderDocLast3: r0.t.holderDocLast3,
            ticketTypeName: r0.typeName,
            status: r0.t.status,
            usedAt: r0.t.usedAt,
            ...by,
          });
        }
        return { items };
      });
    },
  );

  // ─── Ingreso manual (sin QR: celular sin batería, pantalla rota…). Queda registrado como manual. ───
  r.post(
    '/v1/organizations/:orgId/events/:eventId/check-in/manual',
    {
      config: { rateLimit: { max: 120, timeWindow: '1 minute', keyGenerator: keyByStaffSession } },
      schema: {
        tags: ['access'],
        summary: 'Dejar pasar una entrada buscada a mano',
        params: z.object({ orgId: z.string().uuid(), eventId: z.string().uuid() }),
        body: z.object({ ticketId: z.string().uuid(), gate: z.string().trim().max(60).optional(), deviceId: z.string().trim().max(80).optional() }),
        response: { 200: ScanResult },
      },
    },
    async (req) => {
      const access = await requireOrgPermission(s.db, req, req.params.orgId, 'access.scan');
      await assertCanScanEvent(s.db, access, req.params.eventId, s.now());
      return inOrg(s.db, access, async (tx) => {
        const [row] = await tx
          .select({ t: tickets, typeName: ticketTypes.name })
          .from(tickets)
          .innerJoin(ticketTypes, eq(ticketTypes.id, tickets.ticketTypeId))
          .where(and(eq(tickets.id, req.body.ticketId), eq(tickets.eventId, req.params.eventId)))
          .for('update', { of: tickets });
        if (!row) return { result: 'not_found' as const, message: SCAN_MESSAGES.not_found, ticket: null };
        const view = (t: typeof tickets.$inferSelect) => ({ id: t.id, holderName: t.holderName, holderDocLast3: t.holderDocLast3, ticketTypeName: row.typeName, status: t.status, usedAt: t.usedAt });
        const t = row.t;
        if (t.status === 'used') return { result: 'already_used' as const, message: SCAN_MESSAGES.already_used, ticket: { ...view(t), ...(await admittedBy(tx, t.id)) } };
        if (t.status === 'locked') return { result: 'not_valid' as const, message: SCAN_MESSAGES.transfer_pending, ticket: view(t) };
        if (t.status !== 'valid') return { result: 'not_valid' as const, message: SCAN_MESSAGES.not_valid, ticket: view(t) };
        const now = s.now();
        const [used] = await tx.update(tickets).set({ status: transitionTicket(t.status, 'check_in'), usedAt: now, updatedAt: now }).where(eq(tickets.id, t.id)).returning();
        await recordTicketEvents(tx, [
          { orgId: access.orgId, ticketId: t.id, type: 'checked_in', actorUserId: access.userId, data: { gate: req.body.gate ?? null, deviceId: req.body.deviceId ?? null, method: 'manual' } },
        ]);
        return { result: 'admitted' as const, message: SCAN_MESSAGES.admitted, ticket: view(used!) };
      });
    },
  );
}
