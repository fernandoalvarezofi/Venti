import { DomainError } from '@venti/domain';
import type { FastifyError, FastifyInstance } from 'fastify';
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod';

/** Error HTTP con código estable para los clientes. */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details: Record<string, unknown> | undefined;

  constructor(statusCode: number, code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export const notFound = (what = 'Recurso') => new AppError(404, 'not_found', `${what} no encontrado.`);
export const forbidden = () => new AppError(403, 'forbidden', 'No tenés permisos para esta acción.');
export const unauthorized = () => new AppError(401, 'unauthorized', 'Necesitás iniciar sesión.');
export const conflict = (code: string, message: string, details?: Record<string, unknown>) => new AppError(409, code, message, details);

interface PgLikeError {
  code?: string;
  constraint?: string;
}

function pgCause(err: unknown): PgLikeError | undefined {
  let current: unknown = err;
  for (let i = 0; i < 3 && current; i++) {
    const c = current as PgLikeError & { cause?: unknown };
    if (typeof c.code === 'string' && /^[0-9A-Z]{5}$/.test(c.code)) return c;
    current = c.cause;
  }
  return undefined;
}

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((err: FastifyError, req, reply) => {
    if (hasZodFastifySchemaValidationErrors(err)) {
      return reply.status(400).send({
        error: { code: 'validation_error', message: 'Datos inválidos.', details: { issues: err.validation.map((v) => ({ path: v.instancePath, message: v.message })) } },
      });
    }
    if (err instanceof AppError) {
      return reply.status(err.statusCode).send({ error: { code: err.code, message: err.message, details: err.details } });
    }
    if (err instanceof DomainError) {
      return reply.status(422).send({ error: { code: err.code, message: err.message, details: err.details } });
    }
    if (err.statusCode === 429) {
      return reply.status(429).send({ error: { code: 'rate_limited', message: 'Demasiadas solicitudes. Probá de nuevo en un momento.' } });
    }
    const pg = pgCause(err);
    if (pg?.code === '23505') {
      return reply.status(409).send({ error: { code: 'already_exists', message: 'Ya existe un registro con esos datos.', details: { constraint: pg.constraint } } });
    }
    if (pg?.code === '23514' || pg?.code === '23503') {
      return reply.status(409).send({ error: { code: 'constraint_violation', message: 'La operación viola una regla de integridad.', details: { constraint: pg.constraint } } });
    }
    if (err.statusCode && err.statusCode < 500) {
      return reply.status(err.statusCode).send({ error: { code: err.code ?? 'bad_request', message: err.message } });
    }
    req.log.error({ err }, 'Error no controlado');
    return reply.status(500).send({ error: { code: 'internal_error', message: 'Error interno. Ya quedó registrado.' } });
  });

  app.setNotFoundHandler((_req, reply) => reply.status(404).send({ error: { code: 'route_not_found', message: 'Ruta inexistente.' } }));
}
