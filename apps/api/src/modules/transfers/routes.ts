import { randomUUID } from 'node:crypto';
import { transitionTicket } from '@venti/domain';
import { and, desc, eq, events, gt, sql, ticketTransfers, ticketTypes, tickets, users, venues, withContext } from '@venti/db';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { recordTicketEvents } from '../../lib/audit.ts';
import { requireAuth, type Services } from '../../lib/context.ts';
import { randomToken, sha256 } from '../../lib/crypto.ts';
import { simpleEmail, esc } from '../../lib/email-layout.ts';
import { AppError, conflict, notFound } from '../../lib/errors.ts';

/**
 * Transferencia de entradas (como en Ticketmaster):
 *  1. Quien tiene la entrada la envía a un email. Mientras está pendiente, la entrada queda BLOQUEADA (no entra).
 *  2. Quien la recibe (con ese email verificado) la acepta: la original se ANULA y se emite una entrada nueva
 *     a su nombre, con otro QR. El QR anterior deja de servir, aunque alguien lo haya copiado.
 *  3. Mientras no la acepten, quien la envió puede cancelarla y la recupera; quien la recibe puede rechazarla.
 */
const TransferDto = z.object({
  id: z.string().uuid(),
  ticketId: z.string().uuid(),
  status: z.enum(['pending', 'accepted', 'cancelled', 'expired']),
  toName: z.string(),
  toEmail: z.string(),
  fromName: z.string().nullable(),
  event: z.object({ id: z.string().uuid(), title: z.string(), startsAt: z.date(), venueName: z.string().nullable() }),
  ticketTypeName: z.string(),
  createdAt: z.date(),
  expiresAt: z.date(),
});

const maskEmail = (e: string) => e.replace(/^(.)(.*)(@.*)$/, (_m, a: string, b: string, c: string) => a + '•'.repeat(Math.min(b.length, 6)) + c);

export async function transferRoutes(app: FastifyInstance, s: Services): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const web = () => s.config.PUBLIC_WEB_URL.replace(/\/+$/, '');

  async function me(userId: string) {
    const [u] = await s.db.select({ id: users.id, email: users.email, fullName: users.fullName, verified: users.emailVerifiedAt }).from(users).where(eq(users.id, userId));
    if (!u) throw new AppError(401, 'unauthorized', 'Necesitás iniciar sesión.');
    return u;
  }

  // ─── Enviar una entrada ───
  r.post(
    '/v1/me/tickets/:ticketId/transfer',
    {
      config: { rateLimit: { max: 20, timeWindow: '10 minutes' } },
      schema: {
        tags: ['tickets'],
        summary: 'Transferir una entrada a otra persona',
        params: z.object({ ticketId: z.string().uuid() }),
        body: z.object({ toEmail: z.string().trim().toLowerCase().email().max(254), toName: z.string().trim().min(2).max(120) }),
        response: { 201: z.object({ id: z.string().uuid(), status: z.literal('pending') }) },
      },
    },
    async (req, reply) => {
      const { userId } = requireAuth(req);
      const sender = await me(userId);
      if (!sender.verified) throw new AppError(403, 'email_not_verified', 'Confirmá tu email antes de transferir entradas.');
      if (req.body.toEmail === sender.email.toLowerCase()) throw new AppError(400, 'transfer_to_self', 'No podés transferirte una entrada a vos.');
      const now = s.now();
      const [row] = await withContext(s.db, { userId }, (tx) =>
        tx
          .select({ t: tickets, title: events.title, startsAt: events.startsAt, endsAt: events.endsAt, eventStatus: events.status, typeName: ticketTypes.name, venueName: venues.name })
          .from(tickets)
          .innerJoin(events, eq(events.id, tickets.eventId))
          .innerJoin(ticketTypes, eq(ticketTypes.id, tickets.ticketTypeId))
          .leftJoin(venues, eq(venues.id, events.venueId))
          .where(and(eq(tickets.id, req.params.ticketId), eq(tickets.ownerUserId, userId))),
      );
      if (!row) throw notFound('Entrada');
      if (row.t.status !== 'valid') throw conflict('ticket_not_transferable', row.t.status === 'used' ? 'Esta entrada ya se usó.' : row.t.status === 'locked' ? 'Esta entrada ya tiene una transferencia pendiente.' : 'Esta entrada ya no es válida.');
      if (row.eventStatus === 'cancelled' || row.endsAt <= now) throw conflict('event_closed', 'El evento ya terminó o fue cancelado.');

      const token = randomToken(24);
      const id = randomUUID();
      await withContext(s.db, { orgId: row.t.organizationId, userId }, async (tx) => {
        const [locked] = await tx
          .update(tickets)
          .set({ status: transitionTicket('valid', 'lock'), updatedAt: now })
          .where(and(eq(tickets.id, row.t.id), eq(tickets.status, 'valid'), eq(tickets.ownerUserId, userId)))
          .returning({ id: tickets.id });
        if (!locked) throw conflict('ticket_not_transferable', 'La entrada cambió mientras la transferías. Volvé a intentar.');
        await tx.insert(ticketTransfers).values({
          id,
          organizationId: row.t.organizationId,
          ticketId: row.t.id,
          fromUserId: userId,
          toEmailLower: req.body.toEmail,
          toName: req.body.toName,
          tokenHash: sha256(token),
          expiresAt: row.endsAt,
        });
        await recordTicketEvents(tx, [{ orgId: row.t.organizationId, ticketId: row.t.id, type: 'transfer_offered', actorUserId: userId, data: { transferId: id, to: maskEmail(req.body.toEmail) } }]);
      });

      if (s.email.enabled) {
        const fromFirst = sender.fullName.trim().split(/\s+/)[0] ?? 'Alguien';
        const toFirst = req.body.toName.split(/\s+/)[0] ?? '';
        const link = `${web()}/mis-entradas#recibidas`;
        await s.email
          .send({
            to: req.body.toEmail,
            kind: 'ticket_transfer_offered',
            subject: `${fromFirst} te envió una entrada para ${row.title}`,
            text: `¡Hola${toFirst ? ` ${toFirst}` : ''}! ${sender.fullName} te envió una entrada (${row.typeName}) para ${row.title}.\n\nPara recibirla, entrá a Lintick con este email y aceptala en "Mis entradas": ${link}\nSi todavía no tenés cuenta, creala con este mismo email: ${web()}/registrarse?next=/mis-entradas\n\nAl aceptarla, la entrada queda a tu nombre con un QR nuevo.`,
            html: simpleEmail({
              web: web(),
              preheader: `Aceptala y queda a tu nombre, con tu propio QR.`,
              title: `${fromFirst} te envió una entrada`,
              paragraphs: [
                `<strong>${esc(sender.fullName)}</strong> te envió una entrada <strong>${esc(row.typeName)}</strong> para <strong>${esc(row.title)}</strong>.`,
                'Aceptala desde "Mis entradas" con este email. Queda a tu nombre, con tu propio QR.',
                `¿Todavía no tenés cuenta? <a href="${web()}/registrarse?next=/mis-entradas" style="color:#171411;font-weight:600">Creala con este mismo email</a> y la vas a ver ahí.`,
              ],
              cta: { href: link, label: 'Ver y aceptar la entrada' },
              note: 'Si no conocés a quien te la envió, ignorá este mensaje: la entrada vuelve a su dueño si no la aceptás.',
              reason: 'Te llega este mail porque alguien te transfirió una entrada en Lintick.',
            }),
          })
          .catch((err) => req.log.warn({ err }, 'No se pudo avisar la transferencia por email'));
      }
      return reply.status(201).send({ id, status: 'pending' as const });
    },
  );

  // ─── Listado: las que envié y las que me enviaron ───
  r.get(
    '/v1/me/transfers',
    { schema: { tags: ['tickets'], summary: 'Transferencias enviadas y recibidas (pendientes)', response: { 200: z.object({ incoming: z.array(TransferDto), outgoing: z.array(TransferDto) }) } } },
    async (req) => {
      const { userId } = requireAuth(req);
      const user = await me(userId);
      const now = s.now();
      const base = await withContext(s.db, { userId }, (tx) =>
        tx
          .select({ tr: ticketTransfers })
          .from(ticketTransfers)
          .where(and(eq(ticketTransfers.status, 'pending'), gt(ticketTransfers.expiresAt, now)))
          .orderBy(desc(ticketTransfers.createdAt))
          .limit(100),
      );
      // Detalles del evento: se leen dentro de la organización de cada transferencia (ya autorizada por RLS arriba).
      const out = { incoming: [] as z.infer<typeof TransferDto>[], outgoing: [] as z.infer<typeof TransferDto>[] };
      for (const { tr } of base) {
        const [d] = await withContext(s.db, { orgId: tr.organizationId }, (tx) =>
          tx
            .select({ eventId: events.id, title: events.title, startsAt: events.startsAt, venueName: venues.name, typeName: ticketTypes.name, fromName: users.fullName })
            .from(tickets)
            .innerJoin(events, eq(events.id, tickets.eventId))
            .innerJoin(ticketTypes, eq(ticketTypes.id, tickets.ticketTypeId))
            .leftJoin(venues, eq(venues.id, events.venueId))
            .leftJoin(users, eq(users.id, sql`${tr.fromUserId}::uuid`))
            .where(eq(tickets.id, tr.ticketId)),
        );
        if (!d) continue;
        const dto = {
          id: tr.id,
          ticketId: tr.ticketId,
          status: tr.status,
          toName: tr.toName,
          toEmail: tr.toEmailLower,
          fromName: d.fromName ?? null,
          event: { id: d.eventId, title: d.title, startsAt: d.startsAt, venueName: d.venueName },
          ticketTypeName: d.typeName,
          createdAt: tr.createdAt,
          expiresAt: tr.expiresAt,
        };
        if (tr.fromUserId === userId) out.outgoing.push(dto);
        else if (user.verified && tr.toEmailLower === user.email.toLowerCase()) out.incoming.push({ ...dto, toEmail: tr.toEmailLower });
      }
      return out;
    },
  );

  /** Cierra una transferencia pendiente devolviendo la entrada a su dueño (cancelar o rechazar). */
  async function closeBack(userId: string, transferId: string, who: 'sender' | 'recipient') {
    const now = s.now();
    const [tr] = await withContext(s.db, { userId }, (tx) => tx.select().from(ticketTransfers).where(and(eq(ticketTransfers.id, transferId), eq(ticketTransfers.status, 'pending'))));
    if (!tr) throw notFound('Transferencia');
    if (who === 'sender' && tr.fromUserId !== userId) throw notFound('Transferencia');
    if (who === 'recipient') {
      const u = await me(userId);
      if (!u.verified || u.email.toLowerCase() !== tr.toEmailLower) throw notFound('Transferencia');
    }
    await withContext(s.db, { orgId: tr.organizationId, userId }, async (tx) => {
      const [done] = await tx
        .update(ticketTransfers)
        .set({ status: 'cancelled', resolvedAt: now })
        .where(and(eq(ticketTransfers.id, tr.id), eq(ticketTransfers.status, 'pending')))
        .returning({ id: ticketTransfers.id });
      if (!done) throw conflict('transfer_closed', 'La transferencia ya no está pendiente.');
      await tx.update(tickets).set({ status: transitionTicket('locked', 'unlock'), updatedAt: now }).where(and(eq(tickets.id, tr.ticketId), eq(tickets.status, 'locked')));
      await recordTicketEvents(tx, [{ orgId: tr.organizationId, ticketId: tr.ticketId, type: who === 'sender' ? 'transfer_cancelled' : 'transfer_declined', actorUserId: userId, data: { transferId: tr.id } }]);
    });
  }

  r.post(
    '/v1/me/transfers/:transferId/cancel',
    { schema: { tags: ['tickets'], summary: 'Cancelar una transferencia que envié (recupero la entrada)', params: z.object({ transferId: z.string().uuid() }), response: { 204: z.null() } } },
    async (req, reply) => {
      const { userId } = requireAuth(req);
      await closeBack(userId, req.params.transferId, 'sender');
      return reply.status(204).send(null);
    },
  );

  r.post(
    '/v1/me/transfers/:transferId/decline',
    { schema: { tags: ['tickets'], summary: 'Rechazar una entrada que me enviaron', params: z.object({ transferId: z.string().uuid() }), response: { 204: z.null() } } },
    async (req, reply) => {
      const { userId } = requireAuth(req);
      await closeBack(userId, req.params.transferId, 'recipient');
      return reply.status(204).send(null);
    },
  );

  // ─── Aceptar: la original se anula y se emite una nueva a mi nombre ───
  r.post(
    '/v1/me/transfers/:transferId/accept',
    {
      config: { rateLimit: { max: 30, timeWindow: '10 minutes' } },
      schema: { tags: ['tickets'], summary: 'Aceptar una entrada que me enviaron', params: z.object({ transferId: z.string().uuid() }), response: { 200: z.object({ ticketId: z.string().uuid() }) } },
    },
    async (req) => {
      const { userId } = requireAuth(req);
      const u = await me(userId);
      if (!u.verified) throw new AppError(403, 'email_not_verified', 'Confirmá tu email para recibir entradas.');
      const now = s.now();
      const [tr] = await withContext(s.db, { userId }, (tx) => tx.select().from(ticketTransfers).where(and(eq(ticketTransfers.id, req.params.transferId), eq(ticketTransfers.status, 'pending'))));
      if (!tr || tr.toEmailLower !== u.email.toLowerCase()) throw notFound('Transferencia');
      if (tr.expiresAt <= now) throw conflict('transfer_expired', 'El evento ya terminó: la transferencia venció.');

      const newId = randomUUID();
      const result = await withContext(s.db, { orgId: tr.organizationId, userId }, async (tx) => {
        const [claimed] = await tx
          .update(ticketTransfers)
          .set({ status: 'accepted', resolvedAt: now, acceptedBy: userId })
          .where(and(eq(ticketTransfers.id, tr.id), eq(ticketTransfers.status, 'pending')))
          .returning({ id: ticketTransfers.id });
        if (!claimed) throw conflict('transfer_closed', 'La transferencia ya no está pendiente.');
        const [old] = await tx
          .update(tickets)
          .set({ status: transitionTicket('locked', 'reissue'), updatedAt: now })
          .where(and(eq(tickets.id, tr.ticketId), eq(tickets.status, 'locked')))
          .returning();
        if (!old) throw conflict('ticket_not_transferable', 'La entrada ya no está disponible.');
        await tx.insert(tickets).values({
          id: newId,
          organizationId: old.organizationId,
          eventId: old.eventId,
          ticketTypeId: old.ticketTypeId,
          orderId: old.orderId,
          ownerUserId: userId,
          holderName: u.fullName,
          holderEmail: u.email.toLowerCase(),
          holderDocHmac: null,
          holderDocLast3: null,
          assignmentStatus: 'assigned',
          status: 'valid',
          qrVersion: 1,
          previousTicketId: old.id,
          priceCents: old.priceCents,
          currency: old.currency,
          issuedAt: now,
        });
        await tx.update(ticketTransfers).set({ newTicketId: newId }).where(eq(ticketTransfers.id, tr.id));
        await recordTicketEvents(tx, [
          { orgId: old.organizationId, ticketId: old.id, type: 'transferred_out', actorUserId: userId, data: { transferId: tr.id, newTicketId: newId } },
          { orgId: old.organizationId, ticketId: newId, type: 'transferred_in', actorUserId: userId, data: { transferId: tr.id, previousTicketId: old.id } },
        ]);
        return { eventTitle: (await tx.select({ title: events.title }).from(events).where(eq(events.id, old.eventId)))[0]?.title ?? '' };
      });

      // Aviso a quien la envió.
      if (s.email.enabled) {
        const [from] = await s.db.select({ email: users.email, fullName: users.fullName }).from(users).where(eq(users.id, tr.fromUserId));
        if (from) {
          await s.email
            .send({
              to: from.email.toLowerCase(),
              kind: 'ticket_transfer_accepted',
              subject: `${u.fullName.split(/\s+/)[0]} aceptó tu entrada para ${result.eventTitle}`,
              text: `${u.fullName} aceptó la entrada que le enviaste para ${result.eventTitle}. Ahora está a su nombre y ya no aparece en tu cuenta.`,
              html: simpleEmail({
                web: web(),
                preheader: 'La entrada ya está a su nombre.',
                title: 'Aceptaron tu entrada',
                paragraphs: [`<strong>${esc(u.fullName)}</strong> aceptó la entrada que le enviaste para <strong>${esc(result.eventTitle)}</strong>.`, 'Ahora está a su nombre, con su propio QR, y ya no aparece en tu cuenta.'],
                cta: { href: `${web()}/mis-entradas`, label: 'Ver mis entradas' },
                reason: 'Te llega este mail porque transferiste una entrada en Lintick.',
              }),
            })
            .catch((err) => req.log.warn({ err }, 'No se pudo avisar la transferencia aceptada'));
        }
      }
      return { ticketId: newId };
    },
  );
}
