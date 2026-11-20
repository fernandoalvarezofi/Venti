import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, inDays, publishedEvent, registerUser, setupApp, type TestContext } from './helpers.ts';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await setupApp();
});
afterAll(async () => {
  await ctx.venti.close();
  await ctx.owner.close();
});

const twoStages = {
  name: 'Campo',
  kind: 'general',
  capacity: 100,
  maxPerOrder: 6,
  stages: [
    { name: 'Preventa', priceCents: 1_000_000, quantityLimit: 3 },
    { name: 'General', priceCents: 1_500_000 },
  ],
};

describe('cotización (fuente única de precio)', () => {
  it('cotiza sin sesión, con cargo por servicio del 10%, y la reserva congela los mismos montos', async () => {
    const owner = await registerUser(ctx);
    const buyer = await registerUser(ctx);
    const { eventId, ticketTypeId } = await publishedEvent(ctx, owner.token, twoStages);

    const q = await call(ctx, 'POST', '/v1/checkout/quote', { body: { eventId, items: [{ ticketTypeId, quantity: 2 }] } });
    expect(q.status).toBe(200);
    expect(q.body).toMatchObject({ subtotalCents: 2_000_000, feeCents: 200_000, feeBps: 1000, totalCents: 2_200_000 });
    expect(q.body.lines[0]).toMatchObject({ stageName: 'Preventa', unitPriceCents: 1_000_000 });

    const hold = await call(ctx, 'POST', '/v1/holds', { token: buyer.token, body: { eventId, items: [{ ticketTypeId, quantity: 2 }] } });
    expect(hold.body).toMatchObject({ subtotalCents: 2_000_000, feeCents: 200_000, totalCents: 2_200_000 });
    const again = await call(ctx, 'GET', `/v1/holds/${hold.body.id}`, { token: buyer.token });
    expect(again.body).toMatchObject({ subtotalCents: 2_000_000, feeCents: 200_000, totalCents: 2_200_000 });

    // Queda 1 de preventa: una cotización por 2 pasa entera a General.
    const q2 = await call(ctx, 'POST', '/v1/checkout/quote', { body: { eventId, items: [{ ticketTypeId, quantity: 2 }] } });
    expect(q2.body.lines[0]).toMatchObject({ stageName: 'General', unitPriceCents: 1_500_000 });
  });

  it('informa cuántas quedan cuando se pide más de lo disponible', async () => {
    const owner = await registerUser(ctx);
    const { eventId, ticketTypeId } = await publishedEvent(ctx, owner.token, { ...twoStages, capacity: 2, stages: [{ name: 'Única', priceCents: 100 }] });
    const q = await call(ctx, 'POST', '/v1/checkout/quote', { body: { eventId, items: [{ ticketTypeId, quantity: 3 }] } });
    expect(q.status).toBe(409);
    expect(q.body.error).toMatchObject({ code: 'hold.insufficient_stock', details: { available: 2 } });
  });
});

describe('gestión de eventos (Lintick Business)', () => {
  it('edita datos, valida fechas y deja auditoría', async () => {
    const owner = await registerUser(ctx);
    const { orgId, eventId } = await publishedEvent(ctx, owner.token);
    const ok = await call(ctx, 'PATCH', `/v1/organizations/${orgId}/events/${eventId}`, { token: owner.token, body: { title: 'Nuevo título', description: 'Más info' } });
    expect(ok.status).toBe(200);
    expect(ok.body.updated.sort()).toEqual(['description', 'title']);
    const pub = await call(ctx, 'GET', `/v1/public/events/${eventId}`);
    expect(pub.body.title).toBe('Nuevo título');

    const bad = await call(ctx, 'PATCH', `/v1/organizations/${orgId}/events/${eventId}`, { token: owner.token, body: { endsAt: inDays(1) } });
    expect(bad.status).toBe(400);
    const noVenue = await call(ctx, 'PATCH', `/v1/organizations/${orgId}/events/${eventId}`, { token: owner.token, body: { venueId: null } });
    expect(noVenue.body.error.code).toBe('venue_required');
  });

  it('no permite cambiar el precio de una etapa con ventas, pero sí agregar una nueva', async () => {
    const owner = await registerUser(ctx);
    const buyer = await registerUser(ctx);
    const { orgId, eventId, ticketTypeId } = await publishedEvent(ctx, owner.token, twoStages);
    const detail = await call(ctx, 'GET', `/v1/organizations/${orgId}/events/${eventId}`, { token: owner.token });
    const [pre, gen] = detail.body.ticketTypes[0].stages;

    await call(ctx, 'POST', '/v1/holds', { token: buyer.token, body: { eventId, items: [{ ticketTypeId, quantity: 1 }] } });
    const base = `/v1/organizations/${orgId}/events/${eventId}/ticket-types/${ticketTypeId}/stages`;
    const blocked = await call(ctx, 'PATCH', `${base}/${pre.id}`, { token: owner.token, body: { priceCents: 1 } });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('stage_has_sales');

    const okGen = await call(ctx, 'PATCH', `${base}/${gen.id}`, { token: owner.token, body: { priceCents: 1_600_000 } });
    expect(okGen.status).toBe(200);

    const limitBelow = await call(ctx, 'PATCH', `${base}/${pre.id}`, { token: owner.token, body: { quantityLimit: 1 } });
    expect(limitBelow.status).toBe(200); // 1 reservada, cupo 1: válido
    const limitTooLow = await call(ctx, 'PATCH', `${base}/${pre.id}`, { token: owner.token, body: { quantityLimit: 0 } });
    expect(limitTooLow.status).toBe(400);

    const added = await call(ctx, 'POST', base, { token: owner.token, body: { name: 'Puerta', priceCents: 2_000_000 } });
    expect(added.status).toBe(201);
    expect(added.body.position).toBe(3);
  });

  it('edita el tipo de entrada y ocultarlo lo saca de la venta pública', async () => {
    const owner = await registerUser(ctx);
    const { orgId, eventId, ticketTypeId } = await publishedEvent(ctx, owner.token);
    const r = await call(ctx, 'PATCH', `/v1/organizations/${orgId}/events/${eventId}/ticket-types/${ticketTypeId}`, { token: owner.token, body: { hidden: true, maxPerOrder: 2 } });
    expect(r.status).toBe(200);
    const pub = await call(ctx, 'GET', `/v1/public/events/${eventId}`);
    expect(pub.body.ticketTypes).toHaveLength(0);
    const q = await call(ctx, 'POST', '/v1/checkout/quote', { body: { eventId, items: [{ ticketTypeId, quantity: 1 }] } });
    expect(q.status).toBe(404);
  });

  it('cancelar libera reservas, anula entradas, saca de la venta y bloquea cambios', async () => {
    const owner = await registerUser(ctx);
    const buyer = await registerUser(ctx);
    const guest = await registerUser(ctx);
    const { orgId, eventId, ticketTypeId } = await publishedEvent(ctx, owner.token);
    await call(ctx, 'POST', '/v1/holds', { token: buyer.token, body: { eventId, items: [{ ticketTypeId, quantity: 3 }] } });
    await call(ctx, 'POST', `/v1/organizations/${orgId}/events/${eventId}/courtesies`, {
      token: owner.token,
      body: { ticketTypeId, quantity: 2, holderName: 'Invitada', holderEmail: guest.email },
    });

    const short = await call(ctx, 'POST', `/v1/organizations/${orgId}/events/${eventId}/cancel`, { token: owner.token, body: { reason: 'x' } });
    expect(short.status).toBe(400);
    const c = await call(ctx, 'POST', `/v1/organizations/${orgId}/events/${eventId}/cancel`, { token: owner.token, body: { reason: 'Suspensión por lluvia' } });
    expect(c.body).toMatchObject({ ticketsCancelled: 2, holdsReleased: 1 });

    const stats = await call(ctx, 'GET', `/v1/organizations/${orgId}/events/${eventId}/stats`, { token: owner.token });
    expect(stats.body.held).toBe(0);
    const mine = await call(ctx, 'GET', '/v1/me/tickets', { token: guest.token });
    expect(mine.body.items.every((t: { status: string; qr: string | null }) => t.status === 'cancelled' && t.qr === null)).toBe(true);

    const pub = await call(ctx, 'GET', `/v1/public/events/${eventId}`);
    expect(pub.body.status).toBe('cancelled');
    expect((await call(ctx, 'POST', '/v1/holds', { token: buyer.token, body: { eventId, items: [{ ticketTypeId, quantity: 1 }] } })).status).toBe(409);
    expect((await call(ctx, 'PATCH', `/v1/organizations/${orgId}/events/${eventId}`, { token: owner.token, body: { title: 'Otro' } })).body.error.code).toBe('event_closed');
  });

  it('estadísticas, asistentes con búsqueda y resumen de la productora', async () => {
    const owner = await registerUser(ctx);
    const staff = await registerUser(ctx);
    const { orgId, eventId, ticketTypeId } = await publishedEvent(ctx, owner.token);
    await call(ctx, 'POST', `/v1/organizations/${orgId}/events/${eventId}/courtesies`, {
      token: owner.token,
      body: { ticketTypeId, quantity: 2, holderName: 'Lucía Pérez', holderEmail: 'lucia@ejemplo.com', holderDocument: '30111222' },
    });
    await call(ctx, 'POST', `/v1/organizations/${orgId}/events/${eventId}/courtesies`, {
      token: owner.token,
      body: { ticketTypeId, quantity: 1, holderName: 'Tomás Ruiz', holderEmail: 'tomas@ejemplo.com' },
    });

    const stats = await call(ctx, 'GET', `/v1/organizations/${orgId}/events/${eventId}/stats`, { token: owner.token });
    expect(stats.body).toMatchObject({ capacity: 100, sold: 3, courtesies: 3, checkedIn: 0, grossCents: 0, available: 97 });

    const all = await call(ctx, 'GET', `/v1/organizations/${orgId}/events/${eventId}/attendees`, { token: owner.token });
    expect(all.body.total).toBe(3);
    const found = await call(ctx, 'GET', `/v1/organizations/${orgId}/events/${eventId}/attendees?q=30111222`, { token: owner.token });
    expect(found.body.total).toBe(2);
    expect(found.body.items[0]).toMatchObject({ holderName: 'Lucía Pérez', courtesy: true });

    const overview = await call(ctx, 'GET', `/v1/organizations/${orgId}/overview`, { token: owner.token });
    expect(overview.body.totals).toMatchObject({ events: 1, published: 1, ticketsSold: 3, capacity: 100 });

    // Personal de acceso no ve los datos personales de los asistentes.
    await call(ctx, 'PUT', `/v1/organizations/${orgId}/members`, { token: owner.token, body: { email: staff.email, role: 'access_staff' } });
    expect((await call(ctx, 'GET', `/v1/organizations/${orgId}/events/${eventId}/attendees`, { token: staff.token })).status).toBe(403);
  });
});
