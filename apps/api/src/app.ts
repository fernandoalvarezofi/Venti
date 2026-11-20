import { randomUUID } from 'node:crypto';
import { loadPrivateKey } from '@venti/domain';
import { createDb, type DbHandle } from '@venti/db';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import Fastify, { type FastifyInstance } from 'fastify';
import { jsonSchemaTransform, serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import type { Config } from './config.ts';
import type { Services } from './lib/context.ts';
import { AppError, registerErrorHandler } from './lib/errors.ts';
import { SUPABASE_ROOT_CA_2021 } from './lib/supabase-ca.ts';
import { authRoutes, registerAuthHook } from './modules/auth/routes.ts';
import { eventRoutes } from './modules/events/routes.ts';
import { healthRoutes } from './modules/health/routes.ts';
import { inventoryRoutes } from './modules/inventory/routes.ts';
import { organizationRoutes } from './modules/organizations/routes.ts';
import { ticketRoutes } from './modules/tickets/routes.ts';
import { businessRoutes } from './modules/business/routes.ts';

const VENTI_LOGO_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="32" viewBox="0 0 120 32"><text x="0" y="24" font-family="Inter,Arial,sans-serif" font-size="24" font-weight="800" fill="#ffffff" letter-spacing="2">VENTI</text></svg>';

export interface BuildOptions {
  readonly config: Config;
  /** Inyectable en tests para controlar el tiempo. */
  readonly now?: () => Date;
  readonly db?: DbHandle;
}

export interface VentiApp {
  readonly app: FastifyInstance;
  readonly services: Services;
  close(): Promise<void>;
}

export async function buildApp(opts: BuildOptions): Promise<VentiApp> {
  const { config } = opts;
  const handle =
    opts.db ??
    createDb(config.DATABASE_URL, {
      max: config.DATABASE_POOL_MAX,
      ...(config.DATABASE_TLS === 'supabase' ? { caCert: SUPABASE_ROOT_CA_2021 } : {}),
    });
  const services: Services = {
    config,
    db: handle.db,
    qrPrivateKey: loadPrivateKey(config.QR_SIGNING_PRIVATE_KEY),
    now: opts.now ?? (() => new Date()),
  };

  const app = Fastify({
    logger:
      config.LOG_LEVEL === 'silent'
        ? false
        : { level: config.LOG_LEVEL, redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'] },
    trustProxy: config.TRUST_PROXY,
    bodyLimit: 256 * 1024,
    genReqId: () => randomUUID(),
  });

  // JSON tolerante a cuerpo vacío: acciones como "publicar" no llevan datos, y muchos clientes
  // igual envían `content-type: application/json`. El JSON inválido sigue siendo 400.
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    const text = typeof body === 'string' ? body : body.toString('utf8');
    if (text.trim() === '') return done(null, undefined);
    try {
      done(null, JSON.parse(text));
    } catch {
      done(new AppError(400, 'invalid_json', 'El cuerpo de la solicitud no es JSON válido.'), undefined);
    }
  });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  registerErrorHandler(app);

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cookie);
  await app.register(rateLimit, { global: true, max: 300, timeWindow: '1 minute' });

  await app.register(swagger, {
    openapi: {
      info: { title: 'VENTI API', version: '0.1.0', description: 'Núcleo de VENTI, VENTI BUSINESS, VENTI ACCESS y White Label.' },
      components: {
        securitySchemes: {
          bearer: { type: 'http', scheme: 'bearer' },
          cookie: { type: 'apiKey', in: 'cookie', name: 'venti_session' },
        },
      },
      security: [{ bearer: [] }, { cookie: [] }],
    },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUi, {
    routePrefix: '/docs',
    logo: { type: 'image/svg+xml', content: Buffer.from(VENTI_LOGO_SVG) },
    ...(config.SWAGGER_STATIC_DIR ? { baseDir: config.SWAGGER_STATIC_DIR } : {}),
  });

  registerAuthHook(app, services);

  await healthRoutes(app, services);
  await authRoutes(app, services);
  await organizationRoutes(app, services);
  await eventRoutes(app, services);
  await inventoryRoutes(app, services);
  await ticketRoutes(app, services);
  await businessRoutes(app, services);

  return {
    app,
    services,
    async close() {
      await app.close();
      if (!opts.db) await handle.close();
    },
  };
}
