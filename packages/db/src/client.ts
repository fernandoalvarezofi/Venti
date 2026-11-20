import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.ts';

export type Schema = typeof schema;
export type Db = NodePgDatabase<Schema>;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export interface DbHandle {
  readonly db: Db;
  readonly pool: pg.Pool;
  close(): Promise<void>;
}

export function createDb(connectionString: string, opts: { max?: number } = {}): DbHandle {
  const pool = new pg.Pool({ connectionString, max: opts.max ?? 10, application_name: 'venti' });
  const db = drizzle({ client: pool, schema, casing: 'snake_case' });
  return { db, pool, close: () => pool.end() };
}

/**
 * Contexto de seguridad de una transacción (ADR 0002).
 * - orgId: organización cuyos datos se pueden escribir. Lo decide el servidor, nunca el cliente.
 * - userId: usuario autenticado (habilita leer sus propios tickets/órdenes en cualquier organización).
 */
export interface SecurityContext {
  readonly orgId?: string | null;
  readonly userId?: string | null;
}

export interface TxOptions {
  readonly isolationLevel?: 'read committed' | 'repeatable read' | 'serializable';
}

/** Ejecuta `fn` dentro de una transacción con el contexto RLS fijado (alcance: sólo esta transacción). */
export async function withContext<T>(db: Db, ctx: SecurityContext, fn: (tx: Tx) => Promise<T>, opts: TxOptions = {}): Promise<T> {
  return db.transaction(
    async (tx) => {
      await tx.execute(
        sql`select set_config('app.org_id', ${ctx.orgId ?? ''}, true), set_config('app.user_id', ${ctx.userId ?? ''}, true)`,
      );
      return fn(tx);
    },
    opts.isolationLevel ? { isolationLevel: opts.isolationLevel } : undefined,
  );
}
