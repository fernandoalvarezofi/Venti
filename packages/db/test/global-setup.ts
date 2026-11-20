import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TestProject } from 'vitest/node';
import '../src/testing.ts';
import { startEmbeddedPostgres } from '../src/embedded.ts';
import { ensureAppRoleLogin, runMigrations } from '../src/migrate.ts';

/**
 * Levanta un PostgreSQL real y efímero para toda la suite, aplica las migraciones
 * y expone dos URLs: la del rol dueño (sólo para preparar datos) y la del rol de la app (con RLS).
 */
const PORT = 54329;
const OWNER_PASSWORD = 'venti_test_owner_pw';
const APP_PASSWORD = 'venti_test_app_password_123';

export default async function setup(project: TestProject) {
  const dataDir = mkdtempSync(join(tmpdir(), 'venti-pg-'));
  const pg = await startEmbeddedPostgres({ dataDir, port: PORT, password: OWNER_PASSWORD, persistent: false });
  await pg.createDatabase('venti_test');
  const ownerUrl = `postgres://postgres:${OWNER_PASSWORD}@localhost:${PORT}/venti_test`;
  await runMigrations(ownerUrl);
  await ensureAppRoleLogin(ownerUrl, APP_PASSWORD);
  project.provide('ownerDatabaseUrl', ownerUrl);
  project.provide('appDatabaseUrl', `postgres://venti_app:${APP_PASSWORD}@localhost:${PORT}/venti_test`);

  return async () => {
    await pg.stop();
    rmSync(dataDir, { recursive: true, force: true });
  };
}
