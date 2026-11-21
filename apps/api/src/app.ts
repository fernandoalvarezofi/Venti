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
import { createEmailSender, type EmailSender } from './lib/email.ts';
import { AppError, registerErrorHandler } from './lib/errors.ts';
import { SUPABASE_ROOT_CA_2021 } from './lib/supabase-ca.ts';
import { authRoutes, registerAuthHook } from './modules/auth/routes.ts';
import { mediaRoutes } from './modules/events/media-routes.ts';
import { eventRoutes } from './modules/events/routes.ts';
import { healthRoutes } from './modules/health/routes.ts';
import { inventoryRoutes } from './modules/inventory/routes.ts';
import { organizationRoutes } from './modules/organizations/routes.ts';
import { ticketRoutes } from './modules/tickets/routes.ts';
import { accessRoutes } from './modules/access/routes.ts';
import { businessRoutes } from './modules/business/routes.ts';
import { paymentRoutes } from './modules/payments/routes.ts';
import { HttpMercadoPago, HttpMercadoPagoOrders, type MercadoPagoClient } from './lib/mercadopago.ts';
import { SecretBox } from './lib/secret-box.ts';
import { HttpGoogle, type GoogleClient } from './lib/google.ts';

const LOGO_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="32" viewBox="0 0 120 32"><text x="0" y="24" font-family="Inter,Arial,sans-serif" font-size="24" font-weight="800" fill="#ffffff" letter-spacing="0.5">Lintick</text></svg>';

export interface BuildOptions {
  readonly config: Config;
  /** Inyectable en tests para controlar el tiempo. */
  readonly now?: () => Date;
  readonly db?: DbHandle;
  /** Inyectable en tests (buzón en memoria). */
  readonly email?: EmailSender;
  /** Inyectable en tests: cliente de Mercado Pago de prueba. En producción se usa el real. */
  readonly mercadopago?: MercadoPagoClient;
  /** Inyectable en tests: Google de prueba. En producción se usa el real. */
  readonly google?: GoogleClient;
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
    email: opts.email ?? createEmailSender(config),
    docKey: Buffer.from(config.DOC_HMAC_KEY, 'base64'),
    now: opts.now ?? (() => new Date()),
    mp:
      opts.mercadopago ??
      (config.MP_CLIENT_ID && config.MP_CLIENT_SECRET
        ? new (config.MP_INTEGRATION === 'orders' ? HttpMercadoPagoOrders : HttpMercadoPago)(config.MP_CLIENT_ID, config.MP_CLIENT_SECRET, config.MP_TEST_MODE)
        : null),
    secretBox: config.PAYMENTS_ENC_KEY ? new SecretBox(config.PAYMENTS_ENC_KEY) : null,
    google: opts.google ?? (config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET ? new HttpGoogle(config.GOOGLE_CLIENT_ID, config.GOOGLE_CLIENT_SECRET) : null),
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
      info: { title: 'Lintick API', version: '0.1.0', description: 'Núcleo de Lintick, Lintick Business, Lintick Access y White Label.' },
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
    logo: { type: 'image/svg+xml', content: Buffer.from(LOGO_SVG) },
    ...(config.SWAGGER_STATIC_DIR ? { baseDir: config.SWAGGER_STATIC_DIR } : {}),
  });

  registerAuthHook(app, services);

  await healthRoutes(app, services);
  await authRoutes(app, services);
  await organizationRoutes(app, services);
  await eventRoutes(app, services);
  await mediaRoutes(app, services);
  await inventoryRoutes(app, services);
  await ticketRoutes(app, services);
  await accessRoutes(app, services);
  await businessRoutes(app, services);
  await paymentRoutes(app, services);

  return {
    app,
    services,
    async close() {
      await app.close();
      if (!opts.db) await handle.close();
    },
  };
}
