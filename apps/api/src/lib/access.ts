import { and, eq, gt, lte, staffAssignments, type Db } from '@venti/db';
import { inOrg, type OrgAccess } from './context.ts';
import { AppError } from './errors.ts';

/**
 * H4: el personal de acceso sólo escanea eventos donde tiene un turno vigente (evento + horario).
 * Dueños, administradores y encargados pueden controlar cualquier evento de su productora.
 */
export async function assertCanScanEvent(db: Db, access: OrgAccess, eventId: string, now: Date): Promise<void> {
  if (access.role !== 'access_staff') return;
  const [assignment] = await inOrg(db, access, (tx) =>
    tx
      .select({ id: staffAssignments.id })
      .from(staffAssignments)
      .where(and(eq(staffAssignments.eventId, eventId), eq(staffAssignments.userId, access.userId), lte(staffAssignments.validFrom, now), gt(staffAssignments.validUntil, now))),
  );
  if (!assignment) throw new AppError(403, 'not_assigned', 'No tenés un turno asignado en este evento ahora.');
}
