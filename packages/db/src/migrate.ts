import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

export const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));

/** Aplica las migraciones pendientes. Debe ejecutarse con el rol dueño (no con venti_app). */
export async function runMigrations(ownerConnectionString: string): Promise<void> {
  const client = new pg.Client({ connectionString: ownerConnectionString });
  await client.connect();
  try {
    await migrate(drizzle({ client }), { migrationsFolder: MIGRATIONS_DIR });
  } finally {
    await client.end();
  }
}

/**
 * Habilita el login del rol de aplicación con la contraseña dada.
 * En producción esto lo hace la operación de infraestructura (secret manager), no la app.
 */
export async function ensureAppRoleLogin(ownerConnectionString: string, password: string): Promise<void> {
  if (!/^[A-Za-z0-9_\-]{16,}$/.test(password)) {
    throw new Error('La contraseña de venti_app debe tener al menos 16 caracteres [A-Za-z0-9_-].');
  }
  const client = new pg.Client({ connectionString: ownerConnectionString });
  await client.connect();
  try {
    // ALTER ROLE no admite parámetros; la contraseña ya fue validada con una lista blanca de caracteres.
    await client.query(`ALTER ROLE venti_app LOGIN PASSWORD '${password}'`);
  } finally {
    await client.end();
  }
}
