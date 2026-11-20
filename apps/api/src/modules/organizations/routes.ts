import { randomUUID } from 'node:crypto';
import { ORG_ROLES, SLUG_PATTERN, slugify } from '@venti/domain';
import { and, asc, brands, eq, memberships, organizations, sql, users, withContext } from '@venti/db';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { audit } from '../../lib/audit.ts';
import { inOrg, requireAuth, requireOrgPermission, type Services } from '../../lib/context.ts';
import { AppError, conflict, notFound } from '../../lib/errors.ts';

const OrgDto = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  name: z.string(),
  legalName: z.string().nullable(),
  taxId: z.string().nullable(),
  role: z.enum(ORG_ROLES),
});

const MemberDto = z.object({ userId: z.string().uuid(), email: z.string(), fullName: z.string(), role: z.enum(ORG_ROLES), createdAt: z.date() });

/** CUIT argentino: 11 dígitos con dígito verificador módulo 11. */
export function isValidCuit(raw: string): boolean {
  const digits = raw.replace(/\D/g, '');
  if (digits.length !== 11) return false;
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const sum = weights.reduce((acc, w, i) => acc + w * Number(digits[i]), 0);
  let check = 11 - (sum % 11);
  if (check === 11) check = 0;
  if (check === 10) return false;
  return check === Number(digits[10]);
}

const OrgId = z.object({ orgId: z.string().uuid() });

export async function organizationRoutes(app: FastifyInstance, s: Services): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.post(
    '/v1/organizations',
    {
      schema: {
        tags: ['organizations'],
        summary: 'Crear una productora (el creador queda como owner)',
        body: z.object({
          name: z.string().trim().min(2).max(120),
          slug: z.string().regex(SLUG_PATTERN).max(60).optional(),
          legalName: z.string().trim().max(200).optional(),
          taxId: z
            .string()
            .trim()
            .refine(isValidCuit, 'CUIT inválido.')
            .transform((v) => v.replace(/\D/g, ''))
            .optional(),
        }),
        response: { 201: OrgDto },
      },
    },
    async (req, reply) => {
      const { userId } = requireAuth(req);
      const id = randomUUID();
      const slug = req.body.slug ?? slugify(req.body.name, 60);
      if (!SLUG_PATTERN.test(slug)) throw new AppError(400, 'invalid_slug', 'No se pudo generar un identificador válido; indicá un slug.');
      const org = await withContext(s.db, { orgId: id, userId }, async (tx) => {
        const [taken] = await tx.select({ id: organizations.id }).from(organizations).where(eq(organizations.slug, slug));
        if (taken) throw conflict('slug_taken', `El identificador "${slug}" ya está en uso.`);
        const [created] = await tx
          .insert(organizations)
          .values({ id, slug, name: req.body.name, legalName: req.body.legalName ?? null, taxId: req.body.taxId ?? null })
          .returning();
        await tx.insert(memberships).values({ organizationId: id, userId, role: 'owner' });
        // Marca por defecto: base del white label.
        await tx.insert(brands).values({ id: randomUUID(), organizationId: id, slug, name: req.body.name });
        await audit(tx, { orgId: id, actorUserId: userId, action: 'organization.created', entityType: 'organization', entityId: id, ip: req.ip });
        return created!;
      });
      return reply.status(201).send({ ...org, role: 'owner' as const });
    },
  );

  r.get(
    '/v1/organizations',
    { schema: { tags: ['organizations'], summary: 'Organizaciones del usuario', response: { 200: z.object({ items: z.array(OrgDto) }) } } },
    async (req) => {
      const { userId } = requireAuth(req);
      const items = await withContext(s.db, { userId }, (tx) =>
        tx
          .select({
            id: organizations.id,
            slug: organizations.slug,
            name: organizations.name,
            legalName: organizations.legalName,
            taxId: organizations.taxId,
            role: memberships.role,
          })
          .from(memberships)
          .innerJoin(organizations, eq(organizations.id, memberships.organizationId))
          .where(eq(memberships.userId, userId))
          .orderBy(asc(organizations.name)),
      );
      return { items };
    },
  );

  r.get(
    '/v1/organizations/:orgId/members',
    { schema: { tags: ['organizations'], summary: 'Miembros de la organización', params: OrgId, response: { 200: z.object({ items: z.array(MemberDto) }) } } },
    async (req) => {
      const access = await requireOrgPermission(s.db, req, req.params.orgId, 'members.manage');
      const items = await inOrg(s.db, access, (tx) =>
        tx
          .select({ userId: users.id, email: users.email, fullName: users.fullName, role: memberships.role, createdAt: memberships.createdAt })
          .from(memberships)
          .innerJoin(users, eq(users.id, memberships.userId))
          .where(eq(memberships.organizationId, access.orgId))
          .orderBy(asc(users.fullName)),
      );
      return { items };
    },
  );

  r.put(
    '/v1/organizations/:orgId/members',
    {
      schema: {
        tags: ['organizations'],
        summary: 'Agregar un colaborador o cambiar su rol',
        description: 'El usuario debe tener cuenta en LinTICK. Sólo un owner puede asignar el rol owner.',
        params: OrgId,
        body: z.object({ email: z.string().trim().toLowerCase().email(), role: z.enum(ORG_ROLES) }),
        response: { 200: MemberDto },
      },
    },
    async (req) => {
      const access = await requireOrgPermission(s.db, req, req.params.orgId, 'members.manage');
      if (req.body.role === 'owner' && access.role !== 'owner') throw new AppError(403, 'forbidden', 'Sólo un owner puede designar otro owner.');
      const [user] = await s.db.select().from(users).where(sql`lower(${users.email}) = ${req.body.email}`);
      if (!user) throw notFound('Usuario');
      return inOrg(s.db, access, async (tx) => {
        const [existing] = await tx
          .select({ role: memberships.role })
          .from(memberships)
          .where(and(eq(memberships.organizationId, access.orgId), eq(memberships.userId, user.id)));
        if (existing?.role === 'owner' && access.role !== 'owner') throw new AppError(403, 'forbidden', 'Sólo un owner puede modificar a otro owner.');
        if (existing?.role === 'owner' && req.body.role !== 'owner') {
          const owners = await tx
            .select({ userId: memberships.userId })
            .from(memberships)
            .where(and(eq(memberships.organizationId, access.orgId), eq(memberships.role, 'owner')));
          if (owners.length <= 1) throw conflict('last_owner', 'La organización debe conservar al menos un owner.');
        }
        const [m] = await tx
          .insert(memberships)
          .values({ organizationId: access.orgId, userId: user.id, role: req.body.role })
          .onConflictDoUpdate({ target: [memberships.organizationId, memberships.userId], set: { role: req.body.role } })
          .returning();
        await audit(tx, {
          orgId: access.orgId,
          actorUserId: access.userId,
          action: existing ? 'member.role_changed' : 'member.added',
          entityType: 'user',
          entityId: user.id,
          data: { from: existing?.role ?? null, to: req.body.role },
          ip: req.ip,
        });
        return { userId: user.id, email: user.email, fullName: user.fullName, role: m!.role, createdAt: m!.createdAt };
      });
    },
  );
}
