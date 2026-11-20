import type { KeyObject } from 'node:crypto';
import { roleHas, type OrgRole, type Permission } from '@venti/domain';
import { and, eq, memberships, withContext, type Db, type Tx } from '@venti/db';
import type { FastifyRequest } from 'fastify';
import type { Config } from '../config.ts';
import type { EmailSender } from './email.ts';
import { forbidden, notFound, unauthorized } from './errors.ts';

/** Dependencias compartidas por todos los módulos (composition root en app.ts). */
export interface Services {
  readonly config: Config;
  readonly db: Db;
  readonly qrPrivateKey: KeyObject;
  readonly email: EmailSender;
  /** Clave HMAC para documentos (DNI). */
  readonly docKey: Buffer;
  readonly now: () => Date;
}

export interface AuthInfo {
  readonly userId: string;
  readonly sessionId: string;
  readonly mfaVerified: boolean;
}

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthInfo | null;
  }
}

export function requireAuth(req: FastifyRequest): AuthInfo {
  if (!req.auth) throw unauthorized();
  return req.auth;
}

export interface OrgAccess {
  readonly orgId: string;
  readonly userId: string;
  readonly role: OrgRole;
}

/**
 * Verifica que el usuario pertenezca a la organización y tenga el permiso.
 * Si no es miembro responde 404 (no revela que la organización existe); si es miembro sin permiso, 403.
 */
export async function requireOrgPermission(db: Db, req: FastifyRequest, orgId: string, permission: Permission): Promise<OrgAccess> {
  const { userId } = requireAuth(req);
  const [membership] = await withContext(db, { orgId, userId }, (tx) =>
    tx
      .select({ role: memberships.role })
      .from(memberships)
      .where(and(eq(memberships.organizationId, orgId), eq(memberships.userId, userId))),
  );
  if (!membership) throw notFound('Organización');
  if (!roleHas(membership.role, permission)) throw forbidden();
  return { orgId, userId, role: membership.role };
}

/** Atajo: transacción en el contexto de una organización a la que ya se verificó acceso. */
export function inOrg<T>(db: Db, access: OrgAccess, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return withContext(db, { orgId: access.orgId, userId: access.userId }, fn);
}
