/**
 * Prueba de carga de la puerta (no corre con el resto: `LOAD=1 npx vitest run apps/api/test/load.test.ts`).
 * Miles de entradas, varios escáneres a la vez, duplicados, QRs falsos y compras de varias entradas.
 * Mide cuánto tarda el servidor + base en responder cada escaneo y verifica que nadie entre dos veces.
 */
import { randomUUID } from 'node:crypto';
import { signTicketQr } from '@venti/domain';
import { eq, tickets } from '@venti/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, publishedEvent, registerUser, setupApp, type TestContext } from './helpers.ts';

const N = Number(process.env.LOAD_TICKETS ?? 5000);
const SCANNERS = Number(process.env.LOAD_SCANNERS ?? 8);
const DUP_RATE = 0.1;
const FAKE_RATE = 0.03;

let ctx: TestContext;
beforeAll(async () => {
  if (!process.env.LOAD) return;
  ctx = await setupApp();
});
afterAll(async () => {
  if (!process.env.LOAD) return;
  await ctx.venti.close();
  await ctx.owner.close();
});

const pct = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]!;
};

describe.skipIf(!process.env.LOAD)('carga de la puerta', () => {
  it(`${N} entradas, ${SCANNERS} escáneres simultáneos, duplicados y QRs falsos`, async () => {
    const owner = await registerUser(ctx, 'Jefe de Puerta');
    const ev = await publishedEvent(ctx, owner.token, { name: 'General', kind: 'general', capacity: N + 100, maxPerOrder: 10, stages: [{ name: 'General', priceCents: 1_000_000 }] });

    // Entradas emitidas directo en la base (compras de 1 a 6 entradas por persona).
    const rows: (typeof tickets.$inferInsert)[] = [];
    let holder = 0;
    while (rows.length < N) {
      holder++;
      const size = Math.min(N - rows.length, 1 + (holder % 6));
      for (let i = 0; i < size; i++) {
        rows.push({ id: randomUUID(), organizationId: ev.orgId, eventId: ev.eventId, ticketTypeId: ev.ticketTypeId, holderName: `Persona ${holder}`, holderEmail: `p${holder}@carga.test`, priceCents: 1_000_000, currency: 'ARS' });
      }
    }
    for (let i = 0; i < rows.length; i += 1000) await ctx.owner.db.insert(tickets).values(rows.slice(i, i + 1000));
    const key = ctx.venti.services.qrPrivateKey;
    const qrs = rows.map((r) => signTicketQr({ ticketId: r.id!, version: 1, eventId: ev.eventId }, key));

    // Plan: cada QR una vez + 10% re-escaneados (otro celular, poco después) + 3% falsos/alterados.
    type Job = { qr: string; kind: 'first' | 'dup' | 'fake' };
    const jobs: Job[] = qrs.map((qr) => ({ qr, kind: 'first' as const }));
    const dups = Math.round(N * DUP_RATE);
    for (let i = 0; i < dups; i++) {
      const idx = Math.floor(Math.random() * jobs.length);
      jobs.splice(Math.min(jobs.length, idx + 1 + Math.floor(Math.random() * 40)), 0, { qr: qrs[i * 7 % N]!, kind: 'dup' });
    }
    const fakes = Math.round(N * FAKE_RATE);
    for (let i = 0; i < fakes; i++) {
      const base = qrs[(i * 13) % N]!;
      const tampered = i % 2 ? base.slice(0, -4) + 'AAAA' : `V1.${randomUUID()}.1.${ev.eventId}.firma-falsa`;
      jobs.splice(Math.floor(Math.random() * jobs.length), 0, { qr: tampered, kind: 'fake' });
    }

    // Cada celular con su propia sesión (como en un evento real: cada persona de puerta entra con su cuenta).
    const sessions: string[] = [];
    for (let i = 0; i < SCANNERS; i++) sessions.push((await call(ctx, 'POST', '/v1/auth/login', { body: { email: owner.email, password: owner.password } })).body.token as string);

    // Escáneres: cada uno procesa de a un QR (como un celular real), todos en paralelo y con la MISMA IP (WiFi del lugar).
    const lat: number[] = [];
    const results: Record<string, number> = {};
    let next = 0;
    const t0 = performance.now();
    await Promise.all(
      Array.from({ length: SCANNERS }, async (_, sIdx) => {
        const ip = '10.9.0.1';
        while (next < jobs.length) {
          const job = jobs[next++]!;
          const a = performance.now();
          const res = await ctx.venti.app.inject({
            method: 'POST',
            url: `/v1/organizations/${ev.orgId}/events/${ev.eventId}/check-in`,
            remoteAddress: ip,
            headers: { authorization: `Bearer ${sessions[sIdx]}`, 'content-type': 'application/json' },
            payload: { qr: job.qr, gate: `Puerta ${sIdx + 1}`, deviceId: `cel-${sIdx + 1}` },
          });
          lat.push(performance.now() - a);
          const body = res.json() as { result: string };
          const k = res.statusCode === 200 ? body.result : `http_${res.statusCode}`;
          results[k] = (results[k] ?? 0) + 1;
        }
      }),
    );
    const totalMs = performance.now() - t0;

    // Verificación: cada entrada usada exactamente una vez; duplicados y falsos rechazados.
    const used = (await ctx.owner.pool.query("select count(*)::int as used from tickets where event_id = $1 and status = 'used'", [ev.eventId])).rows[0].used as number;
    const checkins = (await ctx.owner.pool.query("select count(*)::int as checkins from ticket_events te join tickets t on t.id = te.ticket_id where t.event_id = $1 and te.type = 'checked_in'", [ev.eventId])).rows[0].checkins as number;

    const report = {
      entradas: N,
      escaneres: SCANNERS,
      escaneosTotales: jobs.length,
      resultados: results,
      latenciaMs: { p50: +pct(lat, 50).toFixed(1), p95: +pct(lat, 95).toFixed(1), p99: +pct(lat, 99).toFixed(1), max: +Math.max(...lat).toFixed(1) },
      duracionTotalSeg: +(totalMs / 1000).toFixed(1),
      escaneosPorSegundo: +((jobs.length / totalMs) * 1000).toFixed(0),
      enBase: { usadas: used, ingresosRegistrados: checkins },
    };
    console.log('\nREPORTE_CARGA ' + JSON.stringify(report, null, 2));

    expect(results.admitted).toBe(N);
    expect(results.already_used).toBe(dups);
    expect((results.invalid_signature ?? 0) + (results.malformed ?? 0) + (results.not_found ?? 0)).toBe(fakes);
    expect(used).toBe(N);
    expect(checkins).toBe(N);
    expect(Object.keys(results).some((k) => k.startsWith('http_'))).toBe(false);

    // Dos celulares sin señal que dejaron pasar la MISMA entrada: al volver la señal, uno queda como ingreso y el otro como duplicado.
    const extra = { id: randomUUID(), organizationId: ev.orgId, eventId: ev.eventId, ticketTypeId: ev.ticketTypeId, holderName: 'Sin Señal', holderEmail: 's@carga.test', priceCents: 0, currency: 'ARS' as const };
    await ctx.owner.db.insert(tickets).values(extra);
    const entry = (at: number) => ({ ticketId: extra.id, version: 1, scannedAt: new Date(Date.now() - at).toISOString(), gate: null });
    const syncA = await call(ctx, 'POST', `/v1/organizations/${ev.orgId}/events/${ev.eventId}/check-in/sync`, { token: owner.token, body: { deviceId: 'celular-A-sin-senal', entries: [entry(60_000)] } });
    const syncB = await call(ctx, 'POST', `/v1/organizations/${ev.orgId}/events/${ev.eventId}/check-in/sync`, { token: owner.token, body: { deviceId: 'celular-B-sin-senal', entries: [entry(30_000)] } });
    expect(syncA.body.results[0].result).toBe('admitted');
    expect(syncB.body.results[0].result).toBe('duplicate');
    const [t] = await ctx.owner.db.select().from(tickets).where(eq(tickets.id, extra.id));
    expect(t!.status).toBe('used');
  }, 600_000);
});
