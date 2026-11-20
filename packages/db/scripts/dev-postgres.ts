/**
 * PostgreSQL de desarrollo persistente en ./.pgdata (sin Docker).
 * Crea la base `venti`, aplica migraciones y habilita el rol venti_app.
 * Uso: npm run db:start   (queda corriendo; Ctrl+C para detener)
 */
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { startEmbeddedPostgres } from '../src/embedded.ts';
import { ensureAppRoleLogin, runMigrations } from '../src/migrate.ts';

const port = Number(process.env.VENTI_DEV_PG_PORT ?? 54320);
const ownerPassword = process.env.VENTI_DEV_PG_OWNER_PASSWORD ?? 'venti_dev_owner';
const appPassword = process.env.VENTI_DEV_PG_APP_PASSWORD ?? 'venti_dev_app_password_local';
const dataDir = fileURLToPath(new URL('../../../.pgdata', import.meta.url));

const server = await startEmbeddedPostgres({ dataDir, port, password: ownerPassword, persistent: true });
const admin = new pg.Client({ connectionString: `postgres://postgres:${ownerPassword}@localhost:${port}/postgres` });
await admin.connect();
const exists = await admin.query("select 1 from pg_database where datname = 'venti'");
if (exists.rowCount === 0) await admin.query('create database venti');
await admin.end();

const ownerUrl = `postgres://postgres:${ownerPassword}@localhost:${port}/venti`;
await runMigrations(ownerUrl);
await ensureAppRoleLogin(ownerUrl, appPassword);

console.log(`PostgreSQL listo en el puerto ${port}`);
console.log(`  DATABASE_URL=postgres://venti_app:${appPassword}@localhost:${port}/venti`);
console.log(`  DATABASE_OWNER_URL=${ownerUrl}`);

const shutdown = async () => {
  await server.stop();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
setInterval(() => {}, 1 << 30);
