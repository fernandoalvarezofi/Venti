# Despliegue

## Producción (staging inicial)

| Pieza | Dónde |
|---|---|
| Código | GitHub `venti` (privado). Cada push a `main` publica en Vercel. |
| API | Vercel, equipo `fernandoalvarezofi-4479s-projects`. Una sola Vercel Function (`api`) empaquetada con `npm run build:vercel` (Build Output API v3). |
| Base de datos | Supabase, proyecto `venti` (`ghzxgsmwegthuyntpxbb`, sa-east-1, PostgreSQL 17). |
| Expiración de reservas | `pg_cron` en Supabase: job `venti-expire-holds`, cada minuto, ejecuta `venti_expire_holds(500)`. No hace falta correr el worker. |

### Configuración del proyecto en Vercel
- Root Directory en Vercel: `apps/api` (lo eligió la importación). `apps/api/vercel.json` instala y construye desde la raíz del monorepo y deja la salida en `apps/api/.vercel/output`. Si el Root Directory se cambia a la raíz, `vercel.json` de la raíz también funciona.
- Node.js: 22.18 o superior (TypeScript nativo de Node). Desarrollo con Node 24; la función corre en `nodejs22.x`, ya empaquetada.
- Región de funciones: `gru1` (São Paulo), al lado de la base.

### Variables de entorno (Production)
`NODE_ENV`, `LOG_LEVEL`, `DATABASE_URL` (rol `venti_app` vía pooler de Supabase en modo transacción, puerto 6543),
`DATABASE_TLS=supabase` (TLS verificado contra la CA pública de Supabase), `DATABASE_POOL_MAX=3`,
`QR_SIGNING_PRIVATE_KEY`, `COOKIE_SECURE=true`, `TRUST_PROXY=true`, `HOLD_TTL_MINUTES`.

Los valores reales viven sólo en `.env.produccion` y `.secrets/` (ignorados por git) y en Vercel.

### Migraciones
Las migraciones `0000`–`0002` ya están aplicadas, y quedan registradas en `drizzle.__drizzle_migrations`.
Las siguientes se aplican **antes** del push que las necesita:
`DATABASE_OWNER_URL=<postgres del proyecto> npm run db:migrate`, o con el conector de Supabase.

### Seguridad específica de Supabase
La migración `0002_hardening` quita todo privilegio a `anon` y `authenticated`, porque Lintick no usa la API REST de Supabase.
También fuerza RLS en `users` y `sessions`. Verificación: `information_schema.role_table_grants` sin filas para esos roles.

### Limitaciones conocidas
- El rate limiting es en memoria, por instancia de función: en serverless es parcial. Para producción con tráfico real
  hay que pasarlo a un almacén compartido (Redis/Upstash o Postgres) y sumar el WAF de Vercel.
