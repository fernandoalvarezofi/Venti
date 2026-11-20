import { runMigrations } from '../src/migrate.ts';

const url = process.env.DATABASE_OWNER_URL;
if (!url) {
  console.error('Falta DATABASE_OWNER_URL (rol dueño con BYPASSRLS).');
  process.exit(1);
}
await runMigrations(url);
console.log('Migraciones aplicadas.');
