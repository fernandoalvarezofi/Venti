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
import { registerErrorHandler } from './lib/errors.ts';
import { authRoutes, registerAuthHook } from './modules/auth/routes.ts';
import { eventRoutes } from './modules/events/routes.ts';
import { healthRoutes } from './modules/health/routes.ts';
import { inventoryRoutes } from './modules/inventory/routes.ts';
import { organizationRoutes } from './modules/organizations/routes.ts';
import { ticketRoutes } from './modules/tickets/routes.ts';

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
  const handle = opts.db ?? createDb(config.DATABASE_URL, { max: config.DATABASE_POOL_MAX });
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
  await app.register(swaggerUi, { routePrefix: '/docs' });

  registerAuthHook(app, services);

  await healthRoutes(app, services);
  await authRoutes(app, services);
  await organizationRoutes(app, services);
  await eventRoutes(app, services);
  await inventoryRoutes(app, services);
  await ticketRoutes(app, services);

  return {
    app,
    services,
    async close() {
      await app.close();
      if (!opts.db) await handle.close();
    },
  };
}
