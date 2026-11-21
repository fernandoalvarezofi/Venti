/** Transferencia de entradas: bloqueo mientras está pendiente, entrada nueva al aceptar, QR viejo inválido. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, publishedEvent, registerUser, setupApp, type TestContext } from './helpers.ts';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await setupApp();
});
afterAll(async () => {
  await ctx.venti.close();
  await ctx.owner.close();
});

async function setup(quantity = 4) {
  const owner = await registerUser(ctx, 'Productora Dueña');
  const ev = await publishedEvent(ctx, owner.token);
  const ana = await registerUser(ctx, 'Ana Compradora');
  const issued = await call(ctx, 'POST', `/v1/organizations/${ev.orgId}/events/${ev.eventId}/courtesies`, {
    token: owner.token,
    body: { ticketTypeId: ev.ticketTypeId, quantity, holderName: 'Ana Compradora', holderEmail: ana.email },
  });
  expect(issued.status).toBe(201);
  const mine = await call(ctx, 'GET', '/v1/me/tickets', { token: ana.token });
  return { owner, ev, ana, tickets: mine.body.items as { id: string; qr: string | null; status: string }[] };
}
const scan = (ctx2: { owner: { token: string }; ev: { orgId: string; eventId: string } }, qr: string) =>
  call(ctx, 'POST', `/v1/organizations/${ctx2.ev.orgId}/events/${ctx2.ev.eventId}/check-in`, { token: ctx2.owner.token, body: { qr } });

describe('cuatro entradas = cuatro pases independientes', () => {
  it('cada una tiene su QR y se consume por separado', async () => {
    const s = await setup(4);
    expect(s.tickets).toHaveLength(4);
    expect(new Set(s.tickets.map((t) => t.qr)).size).toBe(4);
    expect((await scan(s, s.tickets[0]!.qr!)).body.result).toBe('admitted');
    expect((await scan(s, s.tickets[0]!.qr!)).body.result).toBe('already_used');
    const after = (await call(ctx, 'GET', '/v1/me/tickets', { token: s.ana.token })).body.items as { id: string; status: string }[];
    expect(after.filter((t) => t.status === 'used')).toHaveLength(1);
    expect(after.filter((t) => t.status === 'valid')).toHaveLength(3);
  });
});

describe('transferencias', () => {
  it('enviar → bloqueada; aceptar → la original se anula y el destinatario tiene una nueva que entra', async () => {
    const s = await setup(2);
    const beto = await registerUser(ctx, 'Beto Amigo');
    const t = s.tickets[0]!;
    const sent = await call(ctx, 'POST', `/v1/me/tickets/${t.id}/transfer`, { token: s.ana.token, body: { toEmail: beto.email, toName: 'Beto Amigo' } });
    expect(sent.status).toBe(201);
    expect(ctx.outbox.last(beto.email, 'ticket_transfer_offered')).toBeDefined();

    // Pendiente: la entrada original no entra.
    expect((await scan(s, t.qr!)).body.result).toBe('not_valid');
    const anaView = await call(ctx, 'GET', '/v1/me/transfers', { token: s.ana.token });
    expect(anaView.body.outgoing).toHaveLength(1);
    const betoView = await call(ctx, 'GET', '/v1/me/transfers', { token: beto.token });
    expect(betoView.body.incoming).toHaveLength(1);
    expect(betoView.body.incoming[0].fromName).toBe('Ana Compradora');

    // Un tercero no la puede aceptar.
    const intruso = await registerUser(ctx, 'Intruso');
    expect((await call(ctx, 'POST', `/v1/me/transfers/${sent.body.id}/accept`, { token: intruso.token })).status).toBe(404);

    const acc = await call(ctx, 'POST', `/v1/me/transfers/${sent.body.id}/accept`, { token: beto.token });
    expect(acc.status).toBe(200);
    expect(ctx.outbox.last(s.ana.email, 'ticket_transfer_accepted')).toBeDefined();
    // No se acepta dos veces.
    expect((await call(ctx, 'POST', `/v1/me/transfers/${sent.body.id}/accept`, { token: beto.token })).status).toBe(404);

    const anaTickets = (await call(ctx, 'GET', '/v1/me/tickets', { token: s.ana.token })).body.items as { id: string }[];
    expect(anaTickets.map((x) => x.id)).not.toContain(t.id);
    expect(anaTickets).toHaveLength(1);
    const betoTickets = (await call(ctx, 'GET', '/v1/me/tickets', { token: beto.token })).body.items as { id: string; qr: string; holderName: string }[];
    expect(betoTickets).toHaveLength(1);
    expect(betoTickets[0]!.id).toBe(acc.body.ticketId);
    expect(betoTickets[0]!.holderName).toBe('Beto Amigo');

    // El QR viejo no sirve (aunque lo hayan copiado); el nuevo entra una sola vez.
    expect((await scan(s, t.qr!)).body.result).toBe('not_valid');
    expect((await scan(s, betoTickets[0]!.qr)).body.result).toBe('admitted');
    expect((await scan(s, betoTickets[0]!.qr)).body.result).toBe('already_used');
  });

  it('cancelar devuelve la entrada; rechazar también; no se puede transferir una usada ni a uno mismo', async () => {
    const s = await setup(3);
    const beto = await registerUser(ctx, 'Beto');
    const [a, b, c] = s.tickets;
    const t1 = await call(ctx, 'POST', `/v1/me/tickets/${a!.id}/transfer`, { token: s.ana.token, body: { toEmail: beto.email, toName: 'Beto' } });
    expect((await call(ctx, 'POST', `/v1/me/tickets/${a!.id}/transfer`, { token: s.ana.token, body: { toEmail: beto.email, toName: 'Beto' } })).status).toBe(409);
    expect((await call(ctx, 'POST', `/v1/me/transfers/${t1.body.id}/cancel`, { token: s.ana.token })).status).toBe(204);
    expect((await scan(s, a!.qr!)).body.result).toBe('admitted');

    const t2 = await call(ctx, 'POST', `/v1/me/tickets/${b!.id}/transfer`, { token: s.ana.token, body: { toEmail: beto.email, toName: 'Beto' } });
    expect((await call(ctx, 'POST', `/v1/me/transfers/${t2.body.id}/decline`, { token: beto.token })).status).toBe(204);
    expect((await call(ctx, 'GET', '/v1/me/tickets', { token: s.ana.token })).body.items.find((x: { id: string }) => x.id === b!.id).status).toBe('valid');

    // Usada → no se transfiere.
    expect((await call(ctx, 'POST', `/v1/me/tickets/${a!.id}/transfer`, { token: s.ana.token, body: { toEmail: beto.email, toName: 'Beto' } })).status).toBe(409);
    // A uno mismo → no.
    expect((await call(ctx, 'POST', `/v1/me/tickets/${c!.id}/transfer`, { token: s.ana.token, body: { toEmail: s.ana.email, toName: 'Ana' } })).status).toBe(400);
    // Una entrada ajena → no existe para mí.
    const ajena = await call(ctx, 'POST', `/v1/me/tickets/${c!.id}/transfer`, { token: beto.token, body: { toEmail: 'xavi@venti.test', toName: 'Xavi' } });
    expect(ajena.status).toBe(404);
  });
});

describe('puerta: quién dejó pasar, búsqueda manual, ingreso manual y estadísticas', () => {
  it('ya usada muestra quién y por qué puerta; búsqueda y manual funcionan; el resumen trae ritmo y reparto', async () => {
    const s = await setup(3);
    const base = `/v1/organizations/${s.ev.orgId}/events/${s.ev.eventId}`;
    const first = await call(ctx, 'POST', `${base}/check-in`, { token: s.owner.token, body: { qr: s.tickets[0]!.qr, gate: 'Norte' } });
    expect(first.body.result).toBe('admitted');
    const again = await call(ctx, 'POST', `${base}/check-in`, { token: s.owner.token, body: { qr: s.tickets[0]!.qr } });
    expect(again.body.result).toBe('already_used');
    expect(again.body.ticket.usedByName).toBe('Productora Dueña');
    expect(again.body.ticket.usedGate).toBe('Norte');

    const found = await call(ctx, 'GET', `${base}/check-in/search?q=${encodeURIComponent('Ana Comp')}`, { token: s.owner.token });
    expect(found.status).toBe(200);
    expect(found.body.items).toHaveLength(3);
    expect(found.body.items[0].email).toContain('•');
    const byCode = await call(ctx, 'GET', `${base}/check-in/search?q=${s.tickets[1]!.id.replace(/-/g, '').slice(0, 8).toUpperCase()}`, { token: s.owner.token });
    expect(byCode.body.items.map((x: { id: string }) => x.id)).toContain(s.tickets[1]!.id);

    const manual = await call(ctx, 'POST', `${base}/check-in/manual`, { token: s.owner.token, body: { ticketId: s.tickets[1]!.id, gate: 'Sur' } });
    expect(manual.body.result).toBe('admitted');
    expect((await call(ctx, 'POST', `${base}/check-in/manual`, { token: s.owner.token, body: { ticketId: s.tickets[1]!.id } })).body.result).toBe('already_used');

    // Transferencia pendiente → mensaje específico en la puerta.
    const beto = await registerUser(ctx, 'Beto');
    await call(ctx, 'POST', `/v1/me/tickets/${s.tickets[2]!.id}/transfer`, { token: s.ana.token, body: { toEmail: beto.email, toName: 'Beto' } });
    const locked = await call(ctx, 'POST', `${base}/check-in`, { token: s.owner.token, body: { qr: s.tickets[2]!.qr } });
    expect(locked.body.result).toBe('not_valid');
    expect(locked.body.message).toMatch(/Transferencia en curso/);

    const sum = await call(ctx, 'GET', `${base}/check-in/summary`, { token: s.owner.token });
    expect(sum.body.admitted).toBe(2);
    expect(sum.body.lastMinute).toBe(2);
    expect(sum.body.byGate.map((g: { gate: string }) => g.gate).sort()).toEqual(['Norte', 'Sur']);
    expect(sum.body.byStaff[0]).toMatchObject({ name: 'Productora Dueña', count: 2 });

    // Alguien sin permiso no puede buscar ni dejar pasar.
    const extra = await registerUser(ctx, 'Extraño');
    expect([403, 404]).toContain((await call(ctx, 'GET', `${base}/check-in/search?q=Ana`, { token: extra.token })).status);
    expect([403, 404]).toContain((await call(ctx, 'POST', `${base}/check-in/manual`, { token: extra.token, body: { ticketId: s.tickets[2]!.id } })).status);
  });
});
