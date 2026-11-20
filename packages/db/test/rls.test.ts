import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import '../src/testing.ts';
import { createDb, events, organizations, ticketTypes, withContext, eq, sql, type DbHandle } from '../src/index.ts';

let app: DbHandle;
const orgA = randomUUID();
const orgB = randomUUID();
const eventA = randomUUID();

beforeAll(async () => {
  app = createDb(inject('appDatabaseUrl'));
  for (const [id, slug] of [[orgA, `a-${orgA.slice(0, 8)}`], [orgB, `b-${orgB.slice(0, 8)}`]] as const) {
    await withContext(app.db, { orgId: id }, (tx) => tx.insert(organizations).values({ id, slug, name: slug }));
  }
  await withContext(app.db, { orgId: orgA }, (tx) =>
    tx.insert(events).values({
      id: eventA,
      organizationId: orgA,
      slug: 'borrador',
      title: 'Evento en borrador',
      category: 'music',
      startsAt: new Date('2027-03-01T22:00:00Z'),
      endsAt: new Date('2027-03-02T04:00:00Z'),
    }),
  );
});

afterAll(() => app.close());

describe('aislamiento multi-tenant (RLS)', () => {
  it('la app se conecta con un rol sin BYPASSRLS', async () => {
    const r = await app.pool.query('select rolbypassrls, rolsuper from pg_roles where rolname = current_user');
    expect(r.rows[0]).toEqual({ rolbypassrls: false, rolsuper: false });
  });

  it('otra organización no ve un evento en borrador', async () => {
    const rows = await withContext(app.db, { orgId: orgB }, (tx) => tx.select().from(events).where(eq(events.id, eventA)));
    expect(rows).toHaveLength(0);
  });

  it('sin contexto tampoco se ven borradores', async () => {
    const rows = await withContext(app.db, {}, (tx) => tx.select().from(events).where(eq(events.id, eventA)));
    expect(rows).toHaveLength(0);
  });

  it('otra organización no puede modificar el evento', async () => {
    const updated = await withContext(app.db, { orgId: orgB }, (tx) =>
      tx.update(events).set({ title: 'hackeado' }).where(eq(events.id, eventA)).returning(),
    );
    expect(updated).toHaveLength(0);
  });

  it('no se puede insertar datos con el organization_id de otra organización', async () => {
    await expect(
      withContext(app.db, { orgId: orgB }, (tx) =>
        tx.insert(ticketTypes).values({ id: randomUUID(), organizationId: orgA, eventId: eventA, name: 'x', kind: 'general', capacity: 10 }),
      ),
    ).rejects.toMatchObject({ cause: { code: '42501' } }); // new row violates row-level security policy
  });

  it('una vez publicado, el evento es visible en el catálogo público pero no editable', async () => {
    await withContext(app.db, { orgId: orgA }, (tx) => tx.update(events).set({ status: 'published' }).where(eq(events.id, eventA)));
    const visible = await withContext(app.db, {}, (tx) => tx.select().from(events).where(eq(events.id, eventA)));
    expect(visible).toHaveLength(1);
    const updated = await withContext(app.db, {}, (tx) => tx.update(events).set({ title: 'x' }).where(eq(events.id, eventA)).returning());
    expect(updated).toHaveLength(0);
  });

  it('la base rechaza sobreventa aunque el código falle', async () => {
    const id = randomUUID();
    await withContext(app.db, { orgId: orgA }, (tx) =>
      tx.insert(ticketTypes).values({ id, organizationId: orgA, eventId: eventA, name: 'General', kind: 'general', capacity: 5 }),
    );
    await expect(
      withContext(app.db, { orgId: orgA }, (tx) => tx.update(ticketTypes).set({ sold: 6 }).where(eq(ticketTypes.id, id))),
    ).rejects.toMatchObject({ cause: { code: '23514', constraint: 'ticket_types_stock' } });
  });

  it('todas las tablas de VENTI tienen RLS forzado (incluidas users y sessions)', async () => {
    const r = await app.pool.query(
      `select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r' and not (c.relrowsecurity and c.relforcerowsecurity)`,
    );
    expect(r.rows).toEqual([]);
  });

  it('los historiales son de solo inserción', async () => {
    await expect(withContext(app.db, { orgId: orgA }, (tx) => tx.execute(sql`delete from audit_logs`))).rejects.toMatchObject({ cause: { code: '42501' } });
  });
});
