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
  /**
   * resend: envío real. outbox: buzón en memoria, SÓLO desarrollo y tests (se rechaza en producción).
   * disabled: no hay proveedor; las funciones que necesitan email responden 503 explicando por qué.
   */
  EMAIL_PROVIDER: z.enum(['resend', 'outbox', 'disabled']).default('outbox'),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default('LinTICK <no-reply@lintick.local>'),
  /** Clave HMAC para el DNI (32+ bytes en base64). El DNI nunca se guarda en claro. */
  DOC_HMAC_KEY: z
    .string()
    .min(1)
    .refine((v) => Buffer.from(v, 'base64').length >= 32, 'DOC_HMAC_KEY debe ser al menos 32 bytes en base64.'),
}).superRefine((c, ctx) => {
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
  return parsed.data;
}
