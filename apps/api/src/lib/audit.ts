import { randomUUID } from 'node:crypto';
import { auditLogs, ticketEvents, type Tx } from '@venti/db';

export interface AuditEntry {
  readonly orgId: string;
  readonly actorUserId: string | null;
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly data?: Record<string, unknown>;
  readonly ip?: string | null;
}

/** Registra una acción administrativa dentro de la misma transacción que la produce. */
export async function audit(tx: Tx, e: AuditEntry): Promise<void> {
  await tx.insert(auditLogs).values({
    id: randomUUID(),
    organizationId: e.orgId,
    actorUserId: e.actorUserId,
    action: e.action,
    entityType: e.entityType,
    entityId: e.entityId,
    data: e.data ?? {},
    ip: e.ip ?? null,
  });
}

export async function recordTicketEvents(
  tx: Tx,
  rows: readonly { orgId: string; ticketId: string; type: string; actorUserId: string | null; data?: Record<string, unknown> }[],
): Promise<void> {
  if (rows.length === 0) return;
  await tx.insert(ticketEvents).values(
    rows.map((r) => ({
      id: randomUUID(),
      organizationId: r.orgId,
      ticketId: r.ticketId,
      type: r.type,
      actorUserId: r.actorUserId,
      data: r.data ?? {},
    })),
  );
}
