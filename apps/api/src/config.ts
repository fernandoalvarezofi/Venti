import { z } from 'zod';

const base64Pem = z
  .string()
  .min(1)
  .transform((v) => (v.includes('BEGIN') ? v : Buffer.from(v, 'base64').toString('utf8')))
  .refine((v) => v.includes('BEGIN PRIVATE KEY'), 'Debe ser una clave privada PKCS#8 (PEM o PEM en base64).');

const ConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /** Conexión con el rol venti_app (sujeto a RLS). Nunca usar aquí el rol dueño. */
  DATABASE_URL: z.string().url(),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(20),
  /** `supabase`: TLS verificado contra la CA pública de Supabase. `off`: sin TLS (sólo desarrollo local). */
  DATABASE_TLS: z.enum(['off', 'supabase']).default('off'),
  /** Carpeta con los archivos estáticos de Swagger UI cuando la API corre empaquetada (Vercel). */
  SWAGGER_STATIC_DIR: z.string().optional(),
  /** Firma de QR (Ed25519). Generar con: npm run keys -w @venti/api */
  QR_SIGNING_PRIVATE_KEY: base64Pem,
  SESSION_TTL_HOURS: z.coerce.number().int().positive().default(24 * 30),
  HOLD_TTL_MINUTES: z.coerce.number().int().min(1).max(60).default(10),
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  /** Orígenes permitidos para CORS, separados por coma. */
  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((v) =>
      v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  TRUST_PROXY: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  /** URL pública de la web (para los enlaces de los emails). */
  PUBLIC_WEB_URL: z.string().url().default('http://localhost:3000'),
  /** Dominio propio de la web (ej. https://lintick.com). Si está, reemplaza a PUBLIC_WEB_URL. */
  SITE_URL: z.string().url().optional(),
  /**
   * Dirección base que Mercado Pago tiene registrada para volver después de conectar la cuenta.
   * Si la web cambió de dominio y el viejo redirige al nuevo, se puede seguir usando la registrada.
   */
  MP_REDIRECT_BASE_URL: z.string().url().optional(),
  /**
   * resend: envío real. outbox: buzón en memoria, SÓLO desarrollo y tests (se rechaza en producción).
   * disabled: no hay proveedor; las funciones que necesitan email responden 503 explicando por qué.
   */
  EMAIL_PROVIDER: z.enum(['resend', 'outbox', 'disabled']).default('outbox'),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default('Lintick <no-reply@lintick.local>'),
  /** Clave HMAC para el DNI (32+ bytes en base64). El DNI nunca se guarda en claro. */
  DOC_HMAC_KEY: z
    .string()
    .min(1)
    .refine((v) => Buffer.from(v, 'base64').length >= 32, 'DOC_HMAC_KEY debe ser al menos 32 bytes en base64.'),
  /** URL pública de esta API (para las notificaciones y la vuelta de Mercado Pago). */
  PUBLIC_API_URL: z.string().url().default('http://localhost:4000'),
  /**
   * Mercado Pago (modelo marketplace). Si falta MP_CLIENT_ID, los cobros quedan apagados:
   * la API responde 503 explicándolo, nunca simula un pago.
   */
  MP_CLIENT_ID: z.string().trim().optional(),
  MP_CLIENT_SECRET: z.string().trim().optional(),
  /** Clave secreta de la sección Webhooks de la aplicación (para verificar la firma x-signature). */
  MP_WEBHOOK_SECRET: z.string().trim().optional(),
  /** true = pedir credenciales de prueba al conectar (cuentas de test de Mercado Pago). En producción: false (cobros reales). */
  MP_TEST_MODE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  /**
   * Qué API de Checkout Pro usar: "preferences" (la de siempre, probada) u "orders" (la nueva que recomienda Mercado Pago).
   * Se pasa a "orders" recién después de una compra real de prueba.
   */
  MP_INTEGRATION: z.enum(['preferences', 'orders']).default('preferences'),
  /** Clave para cifrar los tokens de las productoras (32 bytes en base64). */
  PAYMENTS_ENC_KEY: z.string().optional(),
  /**
   * Ingreso con Google (OAuth "ID de cliente web" de Google Cloud). Si falta, el botón no aparece.
   * URI de redirección autorizada: {PUBLIC_WEB_URL}/api/v1/auth/google/callback
   * Se cargan en Vercel (proyecto de la API); los cambios se aplican al volver a publicar (dominio: SITE_URL).
   */
  GOOGLE_CLIENT_ID: z.string().trim().optional(),
  GOOGLE_CLIENT_SECRET: z.string().trim().optional(),
}).superRefine((c, ctx) => {
  if (c.GOOGLE_CLIENT_ID && !c.GOOGLE_CLIENT_SECRET) {
    ctx.addIssue({ code: 'custom', path: ['GOOGLE_CLIENT_SECRET'], message: 'Falta GOOGLE_CLIENT_SECRET.' });
  }
  if (c.MP_CLIENT_ID) {
    if (!c.MP_CLIENT_SECRET) ctx.addIssue({ code: 'custom', path: ['MP_CLIENT_SECRET'], message: 'Falta MP_CLIENT_SECRET.' });
    if (!c.PAYMENTS_ENC_KEY || Buffer.from(c.PAYMENTS_ENC_KEY, 'base64').length !== 32) {
      ctx.addIssue({ code: 'custom', path: ['PAYMENTS_ENC_KEY'], message: 'PAYMENTS_ENC_KEY debe ser exactamente 32 bytes en base64.' });
    }
  }
  if (c.NODE_ENV === 'production' && c.EMAIL_PROVIDER === 'outbox') {
    ctx.addIssue({ code: 'custom', path: ['EMAIL_PROVIDER'], message: 'En producción no se permite el buzón en memoria: usá resend o disabled.' });
  }
  if (c.EMAIL_PROVIDER === 'resend' && !c.RESEND_API_KEY) {
    ctx.addIssue({ code: 'custom', path: ['RESEND_API_KEY'], message: 'Falta RESEND_API_KEY para enviar emails.' });
  }
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = ConfigSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Configuración inválida:\n${issues}`);
  }
  const c = parsed.data;
  // SITE_URL manda: así se cambia el dominio de la web sin tocar la variable original.
  return c.SITE_URL ? { ...c, PUBLIC_WEB_URL: c.SITE_URL.replace(/\/+$/, '') } : c;
}
