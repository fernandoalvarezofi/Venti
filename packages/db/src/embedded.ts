import { existsSync } from 'node:fs';
import EmbeddedPostgres from 'embedded-postgres';

/**
 * PostgreSQL real (binarios oficiales) para desarrollo y tests en máquinas sin Docker.
 * No se usa en producción: allí la base es un PostgreSQL administrado.
 */
export interface EmbeddedOptions {
  readonly dataDir: string;
  readonly port: number;
  readonly password: string;
  readonly persistent: boolean;
}

export async function startEmbeddedPostgres(opts: EmbeddedOptions): Promise<EmbeddedPostgres> {
  const pg = new EmbeddedPostgres({
    databaseDir: opts.dataDir,
    user: 'postgres',
    password: opts.password,
    port: opts.port,
    persistent: opts.persistent,
    authMethod: 'scram-sha-256',
    // UTF8 y locale C explícitos: en Windows initdb toma la codificación del sistema (WIN1252).
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
    onLog: () => {},
  });
  if (!existsSync(`${opts.dataDir}/PG_VERSION`)) {
    await pg.initialise();
  }
  await pg.start();
  return pg;
}
