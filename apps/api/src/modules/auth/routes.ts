import { randomUUID } from 'node:crypto';
import { and, eq, gt, isNull, sessions, sql, users } from '@venti/db';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { dummyPasswordHash, hashPassword, randomToken, sha256, verifyPassword } from '../../lib/crypto.ts';
import { AppError, unauthorized } from '../../lib/errors.ts';
import { requireAuth, type Services } from '../../lib/context.ts';

export const SESSION_COOKIE = 'venti_session';
const MAX_FAILED_LOGINS = 10;
const LOCK_MINUTES = 15;
/** Evita escribir en la base en cada request: last_seen se actualiza como mucho cada 5 minutos. */
const TOUCH_INTERVAL_MS = 5 * 60_000;

const Email = z.string().trim().toLowerCase().email().max(254);
const Password = z.string().min(10, 'La contraseña debe tener al menos 10 caracteres.').max(128);

export const UserDto = z.object({
  id: z.string().uuid(),
  email: z.string(),
  fullName: z.string(),
  emailVerified: z.boolean(),
  mfaEnabled: z.boolean(),
  createdAt: z.date(),
});

const SessionResponse = z.object({ user: UserDto, token: z.string(), expiresAt: z.date() });

type UserRow = typeof users.$inferSelect;
function toUserDto(u: UserRow): z.infer<typeof UserDto> {
  return { id: u.id, email: u.email, fullName: u.fullName, emailVerified: !!u.emailVerifiedAt, mfaEnabled: !!u.mfaEnabledAt, createdAt: u.createdAt };
}

function extractToken(req: FastifyRequest): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7).trim() || null;
  return req.cookies[SESSION_COOKIE] ?? null;
}

/** Resuelve la sesión de cada request (cookie HttpOnly para web, Bearer para apps). */
export function registerAuthHook(app: FastifyInstance, s: Services): void {
  app.decorateRequest('auth', null);
  app.addHook('onRequest', async (req) => {
    const token = extractToken(req);
    if (!token) return;
    const now = s.now();
    const [row] = await s.db
      .select({ id: sessions.id, userId: sessions.userId, mfaVerified: sessions.mfaVerified, lastSeenAt: sessions.lastSeenAt, status: users.status })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(and(eq(sessions.tokenHash, sha256(token)), isNull(sessions.revokedAt), gt(sessions.expiresAt, now)));
    if (!row || row.status !== 'active') return;
    req.auth = { userId: row.userId, sessionId: row.id, mfaVerified: row.mfaVerified };
    if (now.getTime() - row.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
      await s.db.update(sessions).set({ lastSeenAt: now }).where(eq(sessions.id, row.id));
    }
  });
}

async function createSession(s: Services, req: FastifyRequest, reply: FastifyReply, userId: string) {
  const token = randomToken();
  const expiresAt = new Date(s.now().getTime() + s.config.SESSION_TTL_HOURS * 3_600_000);
  await s.db.insert(sessions).values({
    id: randomUUID(),
    userId,
    tokenHash: sha256(token),
    ip: req.ip,
    userAgent: req.headers['user-agent']?.slice(0, 512) ?? null,
    expiresAt,
  });
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: s.config.COOKIE_SECURE,
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
  return { token, expiresAt };
}

export async function authRoutes(app: FastifyInstance, s: Services): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const authRateLimit = { rateLimit: { max: 10, timeWindow: '1 minute' } };

  r.post(
    '/v1/auth/register',
    {
      config: authRateLimit,
      schema: {
        tags: ['auth'],
        summary: 'Crear una cuenta de comprador',
        body: z.object({ email: Email, password: Password, fullName: z.string().trim().min(2).max(120) }),
        response: { 201: SessionResponse },
      },
    },
    async (req, reply) => {
      const { email, password, fullName } = req.body;
      const id = randomUUID();
      const passwordHash = await hashPassword(password);
      const inserted = await s.db
        .insert(users)
        .values({ id, email, passwordHash, fullName })
        .onConflictDoNothing()
        .returning();
      const user = inserted[0];
      if (!user) throw new AppError(409, 'email_taken', 'Ya existe una cuenta con ese email.');
      const session = await createSession(s, req, reply, user.id);
      return reply.status(201).send({ user: toUserDto(user), ...session });
    },
  );

  r.post(
    '/v1/auth/login',
    {
      config: authRateLimit,
      schema: {
        tags: ['auth'],
        summary: 'Iniciar sesión',
        body: z.object({ email: Email, password: z.string().min(1).max(128) }),
        response: { 200: SessionResponse },
      },
    },
    async (req, reply) => {
      const { email, password } = req.body;
      const invalid = new AppError(401, 'invalid_credentials', 'Email o contraseña incorrectos.');
      const [user] = await s.db.select().from(users).where(sql`lower(${users.email}) = ${email}`);
      const now = s.now();
      if (!user) {
        await verifyPassword(password, await dummyPasswordHash()); // mismo tiempo de respuesta
        throw invalid;
      }
      if (user.status !== 'active' || (user.lockedUntil && user.lockedUntil > now)) throw invalid;
      if (!(await verifyPassword(password, user.passwordHash))) {
        const failed = user.failedLoginCount + 1;
        await s.db
          .update(users)
          .set(
            failed >= MAX_FAILED_LOGINS
              ? { failedLoginCount: 0, lockedUntil: new Date(now.getTime() + LOCK_MINUTES * 60_000) }
              : { failedLoginCount: failed },
          )
          .where(eq(users.id, user.id));
        throw invalid;
      }
      if (user.failedLoginCount > 0 || user.lockedUntil) {
        await s.db.update(users).set({ failedLoginCount: 0, lockedUntil: null }).where(eq(users.id, user.id));
      }
      const session = await createSession(s, req, reply, user.id);
      return { user: toUserDto(user), ...session };
    },
  );

  r.post('/v1/auth/logout', { schema: { tags: ['auth'], summary: 'Cerrar la sesión actual', response: { 204: z.null() } } }, async (req, reply) => {
    const auth = requireAuth(req);
    await s.db.update(sessions).set({ revokedAt: s.now() }).where(eq(sessions.id, auth.sessionId));
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return reply.status(204).send(null);
  });

  r.post(
    '/v1/auth/logout-all',
    { schema: { tags: ['auth'], summary: 'Cerrar todas las sesiones del usuario', response: { 204: z.null() } } },
    async (req, reply) => {
      const auth = requireAuth(req);
      await s.db
        .update(sessions)
        .set({ revokedAt: s.now() })
        .where(and(eq(sessions.userId, auth.userId), isNull(sessions.revokedAt)));
      reply.clearCookie(SESSION_COOKIE, { path: '/' });
      return reply.status(204).send(null);
    },
  );

  r.get('/v1/me', { schema: { tags: ['auth'], summary: 'Usuario actual', response: { 200: z.object({ user: UserDto }) } } }, async (req) => {
    const auth = requireAuth(req);
    const [user] = await s.db.select().from(users).where(eq(users.id, auth.userId));
    if (!user) throw unauthorized();
    return { user: toUserDto(user) };
  });
}
