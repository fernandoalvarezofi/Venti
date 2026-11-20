import { and, eq, gt, isNull, sql, ticketClaims, tickets, withContext, type Db } from '@venti/db';
import { recordTicketEvents } from './audit.ts';

/**
 * Entrega al usuario las entradas emitidas a su email que esperaban reclamo (H1).
 * Sólo debe llamarse cuando el usuario DEMOSTRÓ controlar ese email (verificación o recuperación).
 * Idempotente: un reclamo ya resuelto no se vuelve a aplicar.
 */
export async function bindPendingClaims(db: Db, userId: string, now: Date): Promise<number> {
  // La política RLS sólo muestra reclamos dirigidos al email verificado de este usuario.
  const open = await withContext(db, { userId }, (tx) =>
    tx
      .select({ id: ticketClaims.id, orgId: ticketClaims.organizationId, ticketId: ticketClaims.ticketId })
      .from(ticketClaims)
      .where(and(isNull(ticketClaims.claimedAt), gt(ticketClaims.expiresAt, now))),
  );
  let bound = 0;
  for (const c of open) {
    const ok = await withContext(db, { orgId: c.orgId, userId }, async (tx) => {
      const [claim] = await tx
        .update(ticketClaims)
        .set({ claimedBy: userId, claimedAt: now })
        .where(and(eq(ticketClaims.id, c.id), isNull(ticketClaims.claimedAt)))
        .returning({ id: ticketClaims.id });
      if (!claim) return false;
      const [t] = await tx
        .update(tickets)
        .set({ ownerUserId: userId, assignmentStatus: 'assigned', updatedAt: now })
        .where(and(eq(tickets.id, c.ticketId), eq(tickets.assignmentStatus, 'pending_claim')))
        .returning({ id: tickets.id });
      if (!t) return false;
      await recordTicketEvents(tx, [{ orgId: c.orgId, ticketId: t.id, type: 'claimed', actorUserId: userId, data: {} }]);
      return true;
    });
    if (ok) bound++;
  }
  return bound;
}

/** Cantidad de reclamos abiertos para un email (para avisos). */
export async function countOpenClaims(db: Db, userId: string, now: Date): Promise<number> {
  const [row] = await withContext(db, { userId }, (tx) =>
    tx
      .select({ n: sql<number>`count(*)`.mapWith(Number) })
      .from(ticketClaims)
      .where(and(isNull(ticketClaims.claimedAt), gt(ticketClaims.expiresAt, now))),
  );
  return row?.n ?? 0;
}
