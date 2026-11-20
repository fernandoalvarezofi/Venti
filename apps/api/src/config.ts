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
