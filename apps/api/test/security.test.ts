/**
 * Fase 1 de Lintick ID & TICKET SECURITY (docs/security/ID-TICKET-SECURITY.md).
 * Cada bloque prueba la corrección de un hallazgo concreto (H1, H3, H4, H7).
 */
import { randomUUID } from 'node:crypto';
import { auditLogs, eq, sql, tickets, withContext, and, inArray } from '@venti/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, confirmEmail, inDays, publishedEvent, registerUser, setupApp, type TestContext } from './helpers.ts';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await setupApp();
});
afterAll(async () => {
  await ctx.venti.close();
  await ctx.owner.close();
});

const courtesy = (orgId: string, eventId: string, token: string, body: Record<string, unknown>) =>
  call(ctx, 'POST', `/v1/organizations/${orgId}/events/${eventId}/courtesies`, { token, body });

describe('H1 — las entradas emitidas a un email sólo las recibe quien controla ese email', () => {
  it('una cuenta SIN confirmar con ese email no recibe la cortesía; al confirmarla, sí', async () => {
    const owner = await registerUser(ctx);
    const { orgId, eventId, ticketTypeId } = await publishedEvent(ctx, owner.token);
    const email = `invitada-${randomUUID().slice(0, 8)}@venti.test`;
    // Alguien registra el email pero todavía no lo confirmó.
    await call(ctx, 'POST', '/v1/auth/register', { body: { email, password: 'clave-segura-12345', fullName: 'Invitada' } });

    const issued = await courtesy(orgId, eventId, owner.token, { ticketTypeId, quantity: 2, holderName: 'Invitada', holderEmail: email });
    expect(issued.status).toBe(201);
    expect(issued.body.pendingClaim).toBe(true);
    expect(ctx.outbox.last(email, 'tickets_pending_claim')).toBeDefined();

    const verified = await confirmEmail(ctx, email, 'clave-segura-12345');
    expect(verified.claimedTickets).toBe(2);
    const mine = await call(ctx, 'GET', '/v1/me/tickets', { token: verified.token });
    expect(mine.body.items).toHaveLength(2);
    expect(mine.body.items[0].qr).toMatch(/^V1\./);

    // Reclamado: el historial lo registra y no se puede volver a reclamar.
    const detail = await call(ctx, 'GET', `/v1/me/tickets/${mine.body.items[0].id}`, { token: verified.token });
    expect(detail.body.history.map((h: { type: string }) => h.type)).toEqual(['issued', 'claimed']);
  });

  it('a una cuenta YA confirmada le llega directo', async () => {
    const owner = await registerUser(ctx);
    const guest = await registerUser(ctx);
    const { orgId, eventId, ticketTypeId } = await publishedEvent(ctx, owner.token);
    const issued = await courtesy(orgId, eventId, owner.token, { ticketTypeId, quantity: 1, holderName: 'Guest', holderEmail: guest.email.toUpperCase() });
    expect(issued.body.pendingClaim).toBe(false);
    expect((await call(ctx, 'GET', '/v1/me/tickets', { token: guest.token })).body.items).toHaveLength(1);
  });

  it('otra persona confirmada no ve ni puede reclamar entradas de un email ajeno', async () => {
    const owner = await registerUser(ctx);
    const snoop = await registerUser(ctx);
    const { orgId, eventId, ticketTypeId } = await publishedEvent(ctx, owner.token);
    await courtesy(orgId, eventId, owner.token, { ticketTypeId, quantity: 1, holderName: 'Nadie', holderEmail: `nadie-${randomUUID().slice(0, 6)}@venti.test` });
    expect((await call(ctx, 'GET', '/v1/me/tickets', { token: snoop.token })).body.items).toHaveLength(0);
    // Ni siquiera vía base de datos: la política sólo muestra reclamos del email verificado propio.
    const claims = await withContext(ctx.venti.services.db, { userId: snoop.id }, (tx) => tx.execute(sql`select count(*)::int as n from ticket_claims`));
    expect(claims.rows[0]).toEqual({ n: 0 });
  });
});

describe('H3 — el DNI nunca se guarda en claro', () => {
  it('guarda HMAC + últimos 3; busca sólo por DNI completo; distinto HMAC por productora', async () => {
    const owner = await registerUser(ctx);
    const a = await publishedEvent(ctx, owner.token);
    const b = await publishedEvent(ctx, owner.token);
    await courtesy(a.orgId, a.eventId, owner.token, { ticketTypeId: a.ticketTypeId, quantity: 1, holderName: 'Lucía', holderEmail: 'lucia@ejemplo.com', holderDocument: '30.111.222' });
    await courtesy(b.orgId, b.eventId, owner.token, { ticketTypeId: b.ticketTypeId, quantity: 1, holderName: 'Lucía', holderEmail: 'lucia@ejemplo.com', holderDocument: '30111222' });

    const cols = await ctx.owner.pool.query(`select column_name from information_schema.columns where table_name = 'tickets' and column_name like 'holder_doc%'`);
    expect(cols.rows.map((r) => r.column_name).sort()).toEqual(['holder_doc_hmac', 'holder_doc_last3']);
    const rows = await ctx.owner.db.select({ hmac: tickets.holderDocHmac, last3: tickets.holderDocLast3, org: tickets.organizationId }).from(tickets).where(and(eq(tickets.holderEmail, 'lucia@ejemplo.com'), inArray(tickets.organizationId, [a.orgId, b.orgId])));
    expect(rows).toHaveLength(2);
    for (const r of rows) {
      expect(r.hmac).toMatch(/^[0-9a-f]{64}$/);
      expect(r.hmac).not.toContain('30111222');
      expect(r.last3).toBe('222');
    }
    expect(rows[0]!.hmac).not.toBe(rows[1]!.hmac);

    const base = `/v1/organizations/${a.orgId}/events/${a.eventId}/attendees`;
    expect((await call(ctx, 'GET', `${base}?q=30111222`, { token: owner.token })).body.total).toBe(1);
    expect((await call(ctx, 'GET', `${base}?q=30.111.222`, { token: owner.token })).body.total).toBe(1);
    expect((await call(ctx, 'GET', `${base}?q=30111`, { token: owner.token })).body.total).toBe(0); // no hay búsqueda parcial
    expect((await call(ctx, 'POST', `/v1/organizations/${a.orgId}/events/${a.eventId}/courtesies`, { token: owner.token, body: { ticketTypeId: a.ticketTypeId, quantity: 1, holderName: 'X Y', holderEmail: 'x@ejemplo.com', holderDocument: '12' } })).status).toBe(400);
  });

  it('el rol Ventas ve los emails enmascarados', async () => {
    const owner = await registerUser(ctx);
    const seller = await registerUser(ctx);
    const { orgId, eventId, ticketTypeId } = await publishedEvent(ctx, owner.token);
    await call(ctx, 'PUT', `/v1/organizations/${orgId}/members`, { token: owner.token, body: { email: seller.email, role: 'sales' } });
    await courtesy(orgId, eventId, owner.token, { ticketTypeId, quantity: 1, holderName: 'Lucía', holderEmail: 'lucia.perez@ejemplo.com' });
    const asOwner = await call(ctx, 'GET', `/v1/organizations/${orgId}/events/${eventId}/attendees`, { token: owner.token });
    const asSales = await call(ctx, 'GET', `/v1/organizations/${orgId}/events/${eventId}/attendees`, { token: seller.token });
    expect(asOwner.body.items[0].holderEmail).toBe('lucia.perez@ejemplo.com');
    expect(asSales.body.items[0].holderEmail).toMatch(/^lu\*+@ejemplo\.com$/);
  });
});

describe('H4 — el personal de acceso sólo escanea con turno asignado', () => {
  it('sin turno: 403; con turno vigente: admite; turno de otro evento: 403; sólo rol Acceso recibe turnos', async () => {
    const owner = await registerUser(ctx);
    const staff = await registerUser(ctx);
    const guest = await registerUser(ctx);
    const ev = await publishedEvent(ctx, owner.token);
    const other = await call(ctx, 'POST', `/v1/organizations/${ev.orgId}/events`, {
      token: owner.token,
      body: { title: `Otro ${randomUUID().slice(0, 4)}`, category: 'music', startsAt: inDays(30), endsAt: inDays(31) },
    });
    await call(ctx, 'PUT', `/v1/organizations/${ev.orgId}/members`, { token: owner.token, body: { email: staff.email, role: 'access_staff' } });
    await courtesy(ev.orgId, ev.eventId, owner.token, { ticketTypeId: ev.ticketTypeId, quantity: 1, holderName: 'Guest', holderEmail: guest.email });
    const qr = (await call(ctx, 'GET', '/v1/me/tickets', { token: guest.token })).body.items[0].qr;
    const scan = (token: string) => call(ctx, 'POST', `/v1/organizations/${ev.orgId}/events/${ev.eventId}/check-in`, { token, body: { qr } });

    const before = await scan(staff.token);
    expect(before.status).toBe(403);
    expect(before.body.error.code).toBe('not_assigned');

    // Turno en OTRO evento: no sirve para este.
    const now = Date.now();
    await call(ctx, 'PUT', `/v1/organizations/${ev.orgId}/events/${other.body.id}/staff`, {
      token: owner.token,
      body: { userId: staff.id, validFrom: inDays(30), validUntil: new Date(now + 30 * 86_400_000 + 3_600_000).toISOString() },
    });
    expect((await scan(staff.token)).status).toBe(403);

    // El turno tiene que cruzarse con el evento: uno de "ahora" para un evento en 30 días se rechaza.
    const far = await call(ctx, 'PUT', `/v1/organizations/${ev.orgId}/events/${ev.eventId}/staff`, {
      token: owner.token,
      body: { userId: staff.id, validFrom: new Date(now - 60_000).toISOString(), validUntil: new Date(now + 3_600_000).toISOString() },
    });
    expect(far.body.error.code).toBe('outside_event');

    // Sólo el rol Acceso recibe turnos.
    const notStaff = await call(ctx, 'PUT', `/v1/organizations/${ev.orgId}/events/${ev.eventId}/staff`, {
      token: owner.token,
      body: { userId: guest.id, validFrom: inDays(30), validUntil: inDays(30.5) },
    });
    expect(notStaff.status).toBe(404); // ni siquiera es miembro

    // Un dueño o productor puede escanear sin turno (administran el evento).
    expect((await scan(owner.token)).body.result).toBe('admitted');
  });

  it('con turno vigente el personal escanea, y el escáner ve los últimos 3 del DNI', async () => {
    const owner = await registerUser(ctx);
    const staff = await registerUser(ctx);
    const guest = await registerUser(ctx);
    // Evento que ya empezó hace 1 hora: el turno de ahora se cruza con él.
    const org = await call(ctx, 'POST', '/v1/organizations', { token: owner.token, body: { name: `Org ${randomUUID().slice(0, 6)}` } });
    const venue = await call(ctx, 'POST', `/v1/organizations/${org.body.id}/venues`, { token: owner.token, body: { name: 'Sala', address: 'Calle 1', city: 'Salta', province: 'Salta' } });
    const ev = await call(ctx, 'POST', `/v1/organizations/${org.body.id}/events`, {
      token: owner.token,
      body: { title: 'En curso', category: 'music', venueId: venue.body.id, startsAt: new Date(Date.now() + 60_000).toISOString(), endsAt: inDays(1) },
    });
    const tt = await call(ctx, 'POST', `/v1/organizations/${org.body.id}/events/${ev.body.id}/ticket-types`, {
      token: owner.token,
      body: { name: 'General', kind: 'general', capacity: 10, stages: [{ name: 'Única', priceCents: 100 }] },
    });
    await call(ctx, 'POST', `/v1/organizations/${org.body.id}/events/${ev.body.id}/publish`, { token: owner.token });
    await call(ctx, 'PUT', `/v1/organizations/${org.body.id}/members`, { token: owner.token, body: { email: staff.email, role: 'access_staff' } });
    await courtesy(org.body.id, ev.body.id, owner.token, { ticketTypeId: tt.body.id, quantity: 1, holderName: 'Guest', holderEmail: guest.email, holderDocument: '28999456' });
    const assign = await call(ctx, 'PUT', `/v1/organizations/${org.body.id}/events/${ev.body.id}/staff`, {
      token: owner.token,
      body: { userId: staff.id, validFrom: new Date(Date.now() - 60_000).toISOString(), validUntil: new Date(Date.now() + 4 * 3_600_000).toISOString() },
    });
    expect(assign.status).toBe(200);
    const qr = (await call(ctx, 'GET', '/v1/me/tickets', { token: guest.token })).body.items[0].qr;
    const r = await call(ctx, 'POST', `/v1/organizations/${org.body.id}/events/${ev.body.id}/check-in`, { token: staff.token, body: { qr } });
    expect(r.body.result).toBe('admitted');
    expect(r.body.ticket.holderDocLast3).toBe('456');

    // Al quitar el turno, deja de poder escanear.
    expect((await call(ctx, 'DELETE', `/v1/organizations/${org.body.id}/events/${ev.body.id}/staff/${staff.id}`, { token: owner.token })).status).toBe(204);
    expect((await call(ctx, 'POST', `/v1/organizations/${org.body.id}/events/${ev.body.id}/check-in`, { token: staff.token, body: { qr } })).status).toBe(403);
  });
});

describe('H7 — auditoría encadenada por la base', () => {
  it('la cadena verifica; el autor lo fija la base; un cambio con acceso de administrador se detecta', async () => {
    const owner = await registerUser(ctx);
    const { orgId, eventId, ticketTypeId } = await publishedEvent(ctx, owner.token);
    // 15 emisiones concurrentes: la cadena queda sin huecos ni bifurcaciones.
    await Promise.all(
      Array.from({ length: 15 }, (_, i) => courtesy(orgId, eventId, owner.token, { ticketTypeId, quantity: 1, holderName: `Invitado ${i}`, holderEmail: `i${i}-${randomUUID().slice(0, 4)}@ejemplo.com` })),
    );
    const verify = await call(ctx, 'GET', `/v1/organizations/${orgId}/audit/verify`, { token: owner.token });
    expect(verify.body.auditLogs).toMatchObject({ ok: true });
    expect(verify.body.ticketEvents).toMatchObject({ ok: true, checked: 15 });
    expect(verify.body.auditLogs.checked).toBeGreaterThanOrEqual(19); // organización, evento, tipo, publicación + 15

    // Aunque la app intente atribuir una acción a otro usuario, la base pone al usuario real.
    const impostor = randomUUID();
    await withContext(ctx.venti.services.db, { orgId, userId: owner.id }, (tx) =>
      tx.insert(auditLogs).values({ id: randomUUID(), organizationId: orgId, actorUserId: impostor, action: 'test.impersonation', entityType: 'x', entityId: 'x' }),
    );
    const [row] = await ctx.owner.db.select({ actor: auditLogs.actorUserId }).from(auditLogs).where(eq(auditLogs.action, 'test.impersonation'));
    expect(row?.actor).toBe(owner.id);

    // Alguien con acceso de administrador a la base modifica una fila: la verificación lo detecta.
    await ctx.owner.pool.query(`update audit_logs set data = '{"quantity": 999}'::jsonb where organization_id = $1 and seq = 5`, [orgId]);
    const tampered = await call(ctx, 'GET', `/v1/organizations/${orgId}/audit/verify`, { token: owner.token });
    expect(tampered.body.auditLogs).toMatchObject({ ok: false, firstBrokenSeq: 5, reason: 'el contenido de la fila fue modificado' });

    // La app no puede verificar otra organización ni modificar la auditoría.
    const other = await registerUser(ctx);
    const otherOrg = await call(ctx, 'POST', '/v1/organizations', { token: other.token, body: { name: `Ajena ${randomUUID().slice(0, 6)}` } });
    await expect(
      withContext(ctx.venti.services.db, { orgId: otherOrg.body.id, userId: other.id }, (tx) => tx.execute(sql`select * from venti_verify_chain('audit_logs', ${orgId}::uuid)`)),
    ).rejects.toMatchObject({ cause: { code: '42501' } });
    await expect(
      withContext(ctx.venti.services.db, { orgId, userId: owner.id }, (tx) => tx.execute(sql`update audit_logs set data = '{}'::jsonb where organization_id = ${orgId}::uuid`)),
    ).rejects.toMatchObject({ cause: { code: '42501' } });
  });
});

describe('CSRF — un cambio pedido desde otra web se rechaza', () => {
  it('Origin ajeno → 403; Origin de Lintick o sin Origin → pasa', async () => {
    const u = await registerUser(ctx);
    const cookie = `venti_session=${u.token}`;
    const evil = await ctx.venti.app.inject({ method: 'POST', url: '/v1/organizations', headers: { origin: 'https://evil.example', cookie, 'content-type': 'application/json' }, payload: { name: 'Ataque CSRF' } });
    expect(evil.statusCode).toBe(403);
    expect(evil.json().error.code).toBe('cross_site_request');
    const own = await ctx.venti.app.inject({ method: 'POST', url: '/v1/organizations', headers: { origin: new URL(ctx.venti.services.config.PUBLIC_WEB_URL).origin, cookie, 'content-type': 'application/json' }, payload: { name: 'Productora propia' } });
    expect(own.statusCode).toBe(201);
    const noOrigin = await ctx.venti.app.inject({ method: 'POST', url: '/v1/organizations', headers: { cookie, 'content-type': 'application/json' }, payload: { name: 'Sin origin' } });
    expect(noOrigin.statusCode).toBe(201);
  });
});

describe('Vista previa del mail de compra', () => {
  it('la productora puede mandarse un ejemplo; alguien de afuera no', async () => {
    const owner = await registerUser(ctx);
    const { orgId, eventId } = await publishedEvent(ctx, owner.token);
    const res = await call(ctx, 'POST', `/v1/organizations/${orgId}/events/${eventId}/email-preview`, { token: owner.token, body: { to: owner.email, name: 'Ana' } });
    expect(res.status).toBe(202);
    const mail = ctx.outbox.last(owner.email, 'purchase_preview');
    expect(mail?.subject).toMatch(/^\[Vista previa\] Tus entradas para /);
    expect(mail?.html).toContain('Vista previa:');
    expect(mail?.html).toContain('Resumen del pago');
    const intruder = await registerUser(ctx);
    const bad = await call(ctx, 'POST', `/v1/organizations/${orgId}/events/${eventId}/email-preview`, { token: intruder.token, body: { to: intruder.email } });
    expect([403, 404]).toContain(bad.status);
  });
});
