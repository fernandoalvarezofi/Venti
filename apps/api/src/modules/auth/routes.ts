import { randomUUID } from 'node:crypto';
import { and, emailVerifications, eq, gt, isNull, passwordResets, sessions, sql, users } from '@venti/db';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { bindPendingClaims } from '../../lib/claims.ts';
import { dummyPasswordHash, hashPassword, randomToken, sha256, verifyPassword } from '../../lib/crypto.ts';
import { AppError, unauthorized } from '../../lib/errors.ts';
import { requireAuth, type Services } from '../../lib/context.ts';

export const SESSION_COOKIE = 'venti_session';
const MAX_FAILED_LOGINS = 10;
const LOCK_MINUTES = 15;
/** Evita escribir en la base en cada request: last_seen se actualiza como mucho cada 5 minutos. */
const TOUCH_INTERVAL_MS = 5 * 60_000;
const VERIFY_TTL_MS = 24 * 3_600_000;
const RESET_TTL_MS = 30 * 60_000;

const Email = z.string().trim().toLowerCase().email().max(254);
const Password = z.string().min(10, 'La contraseña debe tener al menos 10 caracteres.').max(128);
const Token = z.string().regex(/^[A-Za-z0-9_-]{40,64}$/, 'Enlace inválido.');

export const UserDto = z.object({
  id: z.string().uuid(),
  email: z.string(),
  fullName: z.string(),
  emailVerified: z.boolean(),
  mfaEnabled: z.boolean(),
  createdAt: z.date(),
});

const SessionResponse = z.object({ user: UserDto, token: z.string(), expiresAt: z.date() });
/** Respuesta idéntica exista o no la cuenta: no se puede usar para averiguar qué emails están registrados (H5). */
const Accepted = z.object({ status: z.literal('check_email'), message: z.string() });
const CHECK_EMAIL = { status: 'check_email' as const, message: 'Si el email es correcto, te llega un mensaje en unos minutos. Revisá también spam.' };

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
  reply.setCookie(SESSION_COOKIE, token, { httpOnly: true, secure: s.config.COOKIE_SECURE, sameSite: 'lax', path: '/', expires: expiresAt });
  return { token, expiresAt };
}

function link(s: Services, path: string, token: string) {
  return `${s.config.PUBLIC_WEB_URL.replace(/\/+$/, '')}${path}?token=${token}`;
}

/**
 * El enlace de confirmación lleva asociada la contraseña elegida en ESE registro, y para confirmar hay que
 * escribirla. Aunque alguien registre antes un email ajeno no puede quedarse con la cuenta: le falta el buzón,
 * y al dueño del buzón le falta la contraseña del atacante.
 */
async function sendVerification(s: Services, user: Pick<UserRow, 'id' | 'email'>, pending: { passwordHash: string; fullName: string }) {
  const token = randomToken(32);
  await s.db.insert(emailVerifications).values({
    id: randomUUID(),
    userId: user.id,
    tokenHash: sha256(token),
    pendingPasswordHash: pending.passwordHash,
    pendingFullName: pending.fullName,
    expiresAt: new Date(s.now().getTime() + VERIFY_TTL_MS),
  });
  const url = link(s, '/verificar', token);
  await s.email.send({
    to: user.email.toLowerCase(),
    kind: 'verify_email',
    subject: 'Confirmá tu email en Lintick',
    text: `Hola ${pending.fullName.split(' ')[0]}:\n\nConfirmá tu email para activar tu cuenta y recibir tus entradas:\n${url}\n\nVas a necesitar la contraseña que elegiste al registrarte. El enlace vence en 24 horas.\nSi no creaste una cuenta en Lintick, ignorá este mensaje.`,
    meta: { url, token },
  });
}

/** Antes de crear o tocar cuentas, confirmamos que se pueda avisar por email (sin emails, no hay verificación). */
function requireEmail(s: Services) {
  if (!s.email.enabled) throw new AppError(503, 'email_unavailable', 'El envío de emails todavía no está configurado en Lintick, así que no podemos crear cuentas nuevas. Probá más tarde.');
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
        summary: 'Crear una cuenta',
        description: 'Responde siempre lo mismo, exista o no el email. La cuenta se activa con el enlace que llega por email.',
        body: z.object({ email: Email, password: Password, fullName: z.string().trim().min(2).max(120) }),
        response: { 202: Accepted },
      },
    },
    async (req, reply) => {
      requireEmail(s);
      const { email, password, fullName } = req.body;
      const passwordHash = await hashPassword(password); // siempre: mismo tiempo exista o no la cuenta
      const inserted = await s.db.insert(users).values({ id: randomUUID(), email, passwordHash, fullName }).onConflictDoNothing().returning();
      const created = inserted[0];
      if (created) {
        await sendVerification(s, created, { passwordHash, fullName });
      } else {
        const [existing] = await s.db.select().from(users).where(sql`lower(${users.email}) = ${email}`);
        if (existing && !existing.emailVerifiedAt) {
          // Cuenta sin confirmar: no se toca; la nueva contraseña sólo se aplica si se confirma con ella.
          await sendVerification(s, existing, { passwordHash, fullName });
        } else if (existing) {
          await s.email.send({
            to: email,
            kind: 'account_exists',
            subject: 'Ya tenés una cuenta en Lintick',
            text: `Alguien (quizás vos) intentó crear una cuenta con este email, pero ya existe.\n\nIngresá: ${s.config.PUBLIC_WEB_URL}/ingresar\n¿No recordás la contraseña? ${s.config.PUBLIC_WEB_URL}/recuperar\n\nSi no fuiste vos, no tenés que hacer nada.`,
          });
        }
      }
      return reply.status(202).send(CHECK_EMAIL);
    },
  );

  r.post(
    '/v1/auth/verify-email',
    {
      config: authRateLimit,
      schema: {
        tags: ['auth'],
        summary: 'Confirmar el email con el enlace recibido',
        description: 'Exige la contraseña elegida al registrarse. Activa la cuenta, inicia sesión y entrega las entradas que esperaban a este email.',
        body: z.object({ token: Token, password: z.string().min(1).max(128) }),
        response: { 200: SessionResponse.extend({ claimedTickets: z.number() }) },
      },
    },
    async (req, reply) => {
      const now = s.now();
      const invalidLink = new AppError(400, 'invalid_token', 'El enlace no es válido o ya venció. Registrate de nuevo para recibir otro.');
      const [pending] = await s.db
        .select()
        .from(emailVerifications)
        .where(and(eq(emailVerifications.tokenHash, sha256(req.body.token)), isNull(emailVerifications.usedAt), gt(emailVerifications.expiresAt, now)));
      if (!pending) throw invalidLink;
      if (!(await verifyPassword(req.body.password, pending.pendingPasswordHash))) {
        throw new AppError(401, 'invalid_credentials', 'La contraseña no coincide con la que elegiste al registrarte.');
      }
      const user = await s.db.transaction(async (tx) => {
        // Consumo atómico: si dos pestañas confirman a la vez, sólo una gana.
        const [used] = await tx
          .update(emailVerifications)
          .set({ usedAt: now })
          .where(and(eq(emailVerifications.id, pending.id), isNull(emailVerifications.usedAt)))
          .returning({ id: emailVerifications.id });
        if (!used) return null;
        // Cualquier otro enlace pendiente (por ejemplo, uno pedido por un tercero) queda anulado.
        await tx.update(emailVerifications).set({ usedAt: now }).where(and(eq(emailVerifications.userId, pending.userId), isNull(emailVerifications.usedAt)));
        await tx.update(sessions).set({ revokedAt: now }).where(and(eq(sessions.userId, pending.userId), isNull(sessions.revokedAt)));
        const [u] = await tx
          .update(users)
          .set({
            passwordHash: pending.pendingPasswordHash,
            fullName: pending.pendingFullName,
            emailVerifiedAt: sql`coalesce(${users.emailVerifiedAt}, ${now})`,
            failedLoginCount: 0,
            lockedUntil: null,
            updatedAt: now,
          })
          .where(and(eq(users.id, pending.userId), eq(users.status, 'active')))
          .returning();
        return u ?? null;
      });
      if (!user) throw invalidLink;
      const claimedTickets = await bindPendingClaims(s.db, user.id, now);
      const session = await createSession(s, req, reply, user.id);
      return { user: toUserDto(user), ...session, claimedTickets };
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
          .set(failed >= MAX_FAILED_LOGINS ? { failedLoginCount: 0, lockedUntil: new Date(now.getTime() + LOCK_MINUTES * 60_000) } : { failedLoginCount: failed })
          .where(eq(users.id, user.id));
        throw invalid;
      }
      if (user.failedLoginCount > 0 || user.lockedUntil) {
        await s.db.update(users).set({ failedLoginCount: 0, lockedUntil: null }).where(eq(users.id, user.id));
      }
      // Sólo después de una contraseña correcta: no revela nada que el que la escribió no sepa.
      if (!user.emailVerifiedAt) {
        throw new AppError(403, 'email_not_verified', 'Confirmá tu email para entrar: buscá el enlace que te mandamos o registrate de nuevo para recibir otro.');
      }
      const session = await createSession(s, req, reply, user.id);
      return { user: toUserDto(user), ...session };
    },
  );

  r.post(
    '/v1/auth/password/forgot',
    { config: authRateLimit, schema: { tags: ['auth'], summary: 'Pedir un enlace para cambiar la contraseña', body: z.object({ email: Email }), response: { 202: Accepted } } },
    async (req, reply) => {
      requireEmail(s);
      const [u] = await s.db.select().from(users).where(sql`lower(${users.email}) = ${req.body.email}`);
      if (u && u.status === 'active') {
        const token = randomToken(32);
        await s.db.insert(passwordResets).values({ id: randomUUID(), userId: u.id, tokenHash: sha256(token), expiresAt: new Date(s.now().getTime() + RESET_TTL_MS) });
        const url = link(s, '/restablecer', token);
        await s.email.send({
          to: u.email.toLowerCase(),
          kind: 'password_reset',
          subject: 'Cambiá tu contraseña de Lintick',
          text: `Para elegir una contraseña nueva entrá acá:\n${url}\n\nEl enlace vence en 30 minutos y sirve una sola vez. Si no lo pediste, ignorá este mensaje: tu contraseña sigue igual.`,
          meta: { url, token },
        });
      }
      return reply.status(202).send(CHECK_EMAIL);
    },
  );

  r.post(
    '/v1/auth/password/reset',
    {
      config: authRateLimit,
      schema: {
        tags: ['auth'],
        summary: 'Elegir una contraseña nueva con el enlace recibido',
        description: 'Cierra todas las sesiones abiertas. Como prueba el control del email, también lo confirma.',
        body: z.object({ token: Token, password: Password }),
        response: { 204: z.null() },
      },
    },
    async (req, reply) => {
      const now = s.now();
      const [pr] = await s.db
        .update(passwordResets)
        .set({ usedAt: now })
        .where(and(eq(passwordResets.tokenHash, sha256(req.body.token)), isNull(passwordResets.usedAt), gt(passwordResets.expiresAt, now)))
        .returning({ userId: passwordResets.userId });
      if (!pr) throw new AppError(400, 'invalid_token', 'El enlace no es válido o ya venció. Pedí uno nuevo.');
      const passwordHash = await hashPassword(req.body.password);
      await s.db
        .update(users)
        .set({ passwordHash, failedLoginCount: 0, lockedUntil: null, emailVerifiedAt: sql`coalesce(${users.emailVerifiedAt}, ${now})`, updatedAt: now })
        .where(eq(users.id, pr.userId));
      await s.db.update(sessions).set({ revokedAt: now }).where(and(eq(sessions.userId, pr.userId), isNull(sessions.revokedAt)));
      // Invalida otros enlaces de recuperación pendientes.
      await s.db.update(passwordResets).set({ usedAt: now }).where(and(eq(passwordResets.userId, pr.userId), isNull(passwordResets.usedAt)));
      await bindPendingClaims(s.db, pr.userId, now);
      return reply.status(204).send(null);
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
