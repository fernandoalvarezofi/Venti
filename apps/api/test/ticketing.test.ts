import { randomUUID } from 'node:crypto';
import { holds, sessions, sql, users } from '@venti/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { expireHolds } from '../src/modules/inventory/service.ts';
import { call, inDays, publishedEvent, registerUser, setupApp, type TestContext } from './helpers.ts';
import { sha256 } from '../src/lib/crypto.ts';
import { eq } from '@venti/db';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await setupApp();
});
afterAll(async () => {
  await ctx.venti.close();
  await ctx.owner.close();
});

/** Crea compradores directamente en la base (evita 50 hashes scrypt en el test de concurrencia). */
async function fastBuyers(n: number): Promise<string[]> {
  const tokens: string[] = [];
  for (let i = 0; i < n; i++) {
    const id = randomUUID();
    const token = randomUUID() + randomUUID();
    await ctx.owner.db.insert(users).values({ id, email: `b-${id}@venti.test`, passwordHash: 'x', fullName: `Comprador ${i}` });
    await ctx.owner.db.insert(sessions).values({ id: randomUUID(), userId: id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 3_600_000) });
    tokens.push(token);
  }
  return tokens;
}

async function stock(orgId: string, eventId: string, ownerToken: string, ticketTypeId: string) {
  const res = await call(ctx, 'GET', `/v1/organizations/${orgId}/events/${eventId}`, { token: ownerToken });
  const tt = res.body.ticketTypes.find((t: { id: string }) => t.id === ticketTypeId);
  return { sold: tt.sold as number, held: tt.held as number, available: tt.available as number };
}

describe('catálogo público', () => {
  it('muestra eventos publicados con precio "desde" y oculta borradores', async () => {
    const owner = await registerUser(ctx);
    const { eventId, orgId } = await publishedEvent(ctx, owner.token);
    const draft = await call(ctx, 'POST', `/v1/organizations/${orgId}/events`, {
      token: owner.token,
      body: { title: 'Borrador secreto', category: 'music', startsAt: inDays(10), endsAt: inDays(11) },
    });

    const list = await call(ctx, 'GET', '/v1/public/events?city=córdoba&limit=50');
    expect(list.status).toBe(200);
    const ids = list.body.items.map((e: { id: string }) => e.id);
    expect(ids).toContain(eventId);
    expect(ids).not.toContain(draft.body.id);
    expect(list.body.items.find((e: { id: string }) => e.id === eventId).fromPriceCents).toBe(1_500_000);

    expect((await call(ctx, 'GET', `/v1/public/events/${draft.body.id}`)).status).toBe(404);
    const detail = await call(ctx, 'GET', `/v1/public/events/${eventId}`);
    expect(detail.body.ticketTypes[0]).toMatchObject({ saleState: 'on_sale', available: 100 });
    expect(detail.body.ticketTypes[0]).not.toHaveProperty('sold');
  });

  it('no permite publicar sin tipos de entrada', async () => {
    const owner = await registerUser(ctx);
    const org = await call(ctx, 'POST', '/v1/organizations', { token: owner.token, body: { name: `Vacía ${Date.now()}` } });
    const venue = await call(ctx, 'POST', `/v1/organizations/${org.body.id}/venues`, {
      token: owner.token,
      body: { name: 'Club', address: 'Calle 1', city: 'Rosario', province: 'Santa Fe' },
    });
    const ev = await call(ctx, 'POST', `/v1/organizations/${org.body.id}/events`, {
      token: owner.token,
      body: { title: 'Sin entradas', category: 'music', venueId: venue.body.id, startsAt: inDays(5), endsAt: inDays(6) },
    });
    const pub = await call(ctx, 'POST', `/v1/organizations/${org.body.id}/events/${ev.body.id}/publish`, { token: owner.token });
    expect(pub.status).toBe(409);
    expect(pub.body.error.code).toBe('ticket_types_required');
  });
});

describe('reservas de stock', () => {
  it('50 compras concurrentes sobre 10 lugares: exactamente 10 reservas', async () => {
    const owner = await registerUser(ctx);
    const { orgId, eventId, ticketTypeId } = await publishedEvent(ctx, owner.token, {
      name: 'Campo',
      kind: 'general',
      capacity: 10,
      stages: [{ name: 'Única', priceCents: 1_000_000 }],
    });
    const buyers = await fastBuyers(50);
    const results = await Promise.all(
      buyers.map((token) => call(ctx, 'POST', '/v1/holds', { token, body: { eventId, items: [{ ticketTypeId, quantity: 1 }] } })),
    );
    const ok = results.filter((r) => r.status === 201);
    const soldOut = results.filter((r) => r.status === 409 && r.body.error.code === 'hold.insufficient_stock');
    expect(ok).toHaveLength(10);
    expect(soldOut).toHaveLength(40);
    expect(await stock(orgId, eventId, owner.token, ticketTypeId)).toEqual({ sold: 0, held: 10, available: 0 });
  });

  it('las etapas se agotan en orden y una compra no se reparte entre etapas', async () => {
    const owner = await registerUser(ctx);
    const { eventId, ticketTypeId } = await publishedEvent(ctx, owner.token, {
      name: 'General',
      kind: 'general',
      capacity: 100,
      stages: [
        { name: 'Early Bird', priceCents: 1_000_000, quantityLimit: 3 },
        { name: 'General', priceCents: 2_000_000 },
      ],
    });
    const [a, b] = await fastBuyers(2);
    const h1 = await call(ctx, 'POST', '/v1/holds', { token: a, body: { eventId, items: [{ ticketTypeId, quantity: 2 }] } });
    expect(h1.body).toMatchObject({ subtotalCents: 2_000_000, totalCents: 2_000_000, items: [{ stageName: 'Early Bird', unitPriceCents: 1_000_000 }] });
    // Queda 1 early bird; una compra de 2 pasa entera a General.
    const h2 = await call(ctx, 'POST', '/v1/holds', { token: b, body: { eventId, items: [{ ticketTypeId, quantity: 2 }] } });
    expect(h2.body).toMatchObject({ subtotalCents: 4_000_000, totalCents: 4_000_000, items: [{ stageName: 'General' }] });
  });

  it('respeta el máximo por compra y no vende cortesías', async () => {
    const owner = await registerUser(ctx);
    const { eventId, ticketTypeId } = await publishedEvent(ctx, owner.token, {
      name: 'VIP',
      kind: 'vip',
      capacity: 50,
      maxPerOrder: 4,
      stages: [{ name: 'VIP', priceCents: 5_000_000 }],
    });
    const [buyer] = await fastBuyers(1);
    const res = await call(ctx, 'POST', '/v1/holds', { token: buyer, body: { eventId, items: [{ ticketTypeId, quantity: 5 }] } });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('hold.max_per_order');
  });

  it('una reserva nueva reemplaza la anterior; liberar y vencer devuelven el stock', async () => {
    const owner = await registerUser(ctx);
    const { orgId, eventId, ticketTypeId } = await publishedEvent(ctx, owner.token);
    const [buyer, other] = await fastBuyers(2);

    await call(ctx, 'POST', '/v1/holds', { token: buyer, body: { eventId, items: [{ ticketTypeId, quantity: 3 }] } });
    const second = await call(ctx, 'POST', '/v1/holds', { token: buyer, body: { eventId, items: [{ ticketTypeId, quantity: 2 }] } });
    expect((await stock(orgId, eventId, owner.token, ticketTypeId)).held).toBe(2);

    // Otro usuario no puede ver ni liberar la reserva ajena.
    expect((await call(ctx, 'GET', `/v1/holds/${second.body.id}`, { token: other })).status).toBe(404);
    expect((await call(ctx, 'DELETE', `/v1/holds/${second.body.id}`, { token: other })).status).toBe(404);

    expect((await call(ctx, 'DELETE', `/v1/holds/${second.body.id}`, { token: buyer })).status).toBe(204);
    expect((await stock(orgId, eventId, owner.token, ticketTypeId)).held).toBe(0);

    const third = await call(ctx, 'POST', '/v1/holds', { token: buyer, body: { eventId, items: [{ ticketTypeId, quantity: 4 }] } });
    await ctx.owner.db.update(holds).set({ expiresAt: sql`now() - interval '1 minute'` }).where(eq(holds.id, third.body.id));
    expect(await expireHolds(ctx.venti.services.db)).toBeGreaterThanOrEqual(1);
    expect((await stock(orgId, eventId, owner.token, ticketTypeId)).held).toBe(0);
    expect((await call(ctx, 'GET', `/v1/holds/${third.body.id}`, { token: buyer })).body.status).toBe('expired');
  });
});

describe('cortesías, mis entradas y control de acceso', () => {
  it('flujo completo: emitir, ver QR, escanear, detectar duplicado, falsificación y QR rotado', async () => {
    const owner = await registerUser(ctx, 'Owner');
    const staff = await registerUser(ctx, 'Puerta 1');
    const guest = await registerUser(ctx, 'Invitada');
    const { orgId, eventId, ticketTypeId } = await publishedEvent(ctx, owner.token);
    await call(ctx, 'PUT', `/v1/organizations/${orgId}/members`, { token: owner.token, body: { email: staff.email, role: 'access_staff' } });

    // access_staff no puede emitir cortesías.
    const denied = await call(ctx, 'POST', `/v1/organizations/${orgId}/events/${eventId}/courtesies`, {
      token: staff.token,
      body: { ticketTypeId, quantity: 1, holderName: 'Xavier', holderEmail: guest.email },
    });
    expect(denied.status).toBe(403);

    const issued = await call(ctx, 'POST', `/v1/organizations/${orgId}/events/${eventId}/courtesies`, {
      token: owner.token,
      body: { ticketTypeId, quantity: 2, holderName: 'Invitada Especial', holderEmail: guest.email.toUpperCase(), holderDocument: '30123456' },
    });
    expect(issued.status).toBe(201);
    expect(issued.body.ticketIds).toHaveLength(2);
    expect(await stock(orgId, eventId, owner.token, ticketTypeId)).toMatchObject({ sold: 2 });

    const mine = await call(ctx, 'GET', '/v1/me/tickets', { token: guest.token });
    expect(mine.body.items).toHaveLength(2);
    const [t1, t2] = mine.body.items;
    expect(t1.qr).toMatch(/^V1\./);
    expect(t1.priceCents).toBe(0);

    // Escanea la productora: el personal de acceso necesita un turno vigente (ver security.test.ts, H4).
    const scan = (qr: string, token = owner.token) => call(ctx, 'POST', `/v1/organizations/${orgId}/events/${eventId}/check-in`, { token, body: { qr, gate: 'Puerta 1' } });

    expect((await scan(t1.qr)).body.result).toBe('admitted');
    expect((await scan(t1.qr)).body.result).toBe('already_used');

    const tampered = t2.qr.slice(0, -4) + (t2.qr.endsWith('AAAA') ? 'BBBB' : 'AAAA');
    expect((await scan(tampered)).body.result).toBe('invalid_signature');
    expect((await scan('https://phishing.example/qr')).body.result).toBe('malformed');

    const rotated = await call(ctx, 'POST', `/v1/me/tickets/${t2.id}/rotate-qr`, { token: guest.token });
    expect(rotated.status).toBe(200);
    expect((await scan(t2.qr)).body.result).toBe('outdated_qr');
    expect((await scan(rotated.body.qr)).body.result).toBe('admitted');

    // Un usuario sin rol en la organización no puede escanear.
    expect((await scan(rotated.body.qr, guest.token)).status).toBe(404);

    // Otro evento: el QR no sirve.
    const other = await publishedEvent(ctx, owner.token);
    const wrong = await call(ctx, 'POST', `/v1/organizations/${other.orgId}/events/${other.eventId}/check-in`, { token: owner.token, body: { qr: t1.qr } });
    expect(wrong.body.result).toBe('wrong_event');

    const detail = await call(ctx, 'GET', `/v1/me/tickets/${t2.id}`, { token: guest.token });
    expect(detail.body.history.map((h: { type: string }) => h.type)).toEqual(['issued', 'qr_rotated', 'checked_in']);
    expect(detail.body.qr).toBeNull(); // ya usada: no expone QR
  });

  it('nadie más ve las entradas de otro comprador', async () => {
    const owner = await registerUser(ctx);
    const guest = await registerUser(ctx);
    const snoop = await registerUser(ctx);
    const { orgId, eventId, ticketTypeId } = await publishedEvent(ctx, owner.token);
    const issued = await call(ctx, 'POST', `/v1/organizations/${orgId}/events/${eventId}/courtesies`, {
      token: owner.token,
      body: { ticketTypeId, quantity: 1, holderName: 'Gabriela', holderEmail: guest.email },
    });
    expect((await call(ctx, 'GET', `/v1/me/tickets/${issued.body.ticketIds[0]}`, { token: snoop.token })).status).toBe(404);
    expect((await call(ctx, 'GET', '/v1/me/tickets', { token: snoop.token })).body.items).toHaveLength(0);
  });

  it('no permite bajar la capacidad por debajo de lo comprometido', async () => {
    const owner = await registerUser(ctx);
    const { orgId, eventId, ticketTypeId } = await publishedEvent(ctx, owner.token);
    await call(ctx, 'POST', `/v1/organizations/${orgId}/events/${eventId}/courtesies`, {
      token: owner.token,
      body: { ticketTypeId, quantity: 5, holderName: 'Gabriela', holderEmail: 'g@venti.test' },
    });
    const res = await call(ctx, 'PATCH', `/v1/organizations/${orgId}/events/${eventId}/ticket-types/${ticketTypeId}/capacity`, {
      token: owner.token,
      body: { capacity: 4 },
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('capacity_below_committed');
  });
});

describe('cuerpo JSON', () => {
  it('acepta acciones sin cuerpo aunque declaren content-type JSON, y rechaza JSON roto', async () => {
    const owner = await registerUser(ctx);
    const { orgId } = await publishedEvent(ctx, owner.token);
    const venue = await call(ctx, 'POST', `/v1/organizations/${orgId}/venues`, {
      token: owner.token,
      body: { name: 'Sala', address: 'Calle 1', city: 'Salta', province: 'Salta' },
    });
    const ev = await call(ctx, 'POST', `/v1/organizations/${orgId}/events`, {
      token: owner.token,
      body: { title: 'Evento sin cuerpo', category: 'music', venueId: venue.body.id, startsAt: inDays(40), endsAt: inDays(41) },
    });
    await call(ctx, 'POST', `/v1/organizations/${orgId}/events/${ev.body.id}/ticket-types`, {
      token: owner.token,
      body: { name: 'General', kind: 'general', capacity: 10, stages: [{ name: 'Única', priceCents: 100000 }] },
    });
    const publish = await ctx.venti.app.inject({
      method: 'POST',
      url: `/v1/organizations/${orgId}/events/${ev.body.id}/publish`,
      headers: { authorization: `Bearer ${owner.token}`, 'content-type': 'application/json' },
      remoteAddress: '10.9.9.9',
    });
    expect(publish.statusCode).toBe(200);
    const broken = await ctx.venti.app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      headers: { 'content-type': 'application/json' },
      payload: '{"email": ',
      remoteAddress: '10.9.9.8',
    });
    expect(broken.statusCode).toBe(400);
    expect(broken.json().error.code).toBe('invalid_json');
  });
});

describe('salud y documentación', () => {
  it('readiness verifica la base y la documentación OpenAPI está publicada', async () => {
    expect((await call(ctx, 'GET', '/health/ready')).body).toEqual({ status: 'ok', database: 'ok' });
    const spec = await ctx.venti.app.inject({ method: 'GET', url: '/docs/json' });
    expect(spec.statusCode).toBe(200);
    expect(Object.keys(spec.json().paths)).toContain('/v1/holds');
  });
});
