import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, randomIp, registerUser, setupApp, validCuit, type TestContext } from './helpers.ts';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await setupApp();
});
afterAll(async () => {
  await ctx.venti.close();
  await ctx.owner.close();
});

describe('autenticación', () => {
  it('registrar no inicia sesión: pide confirmar el email, y confirmar sí (cookie HttpOnly)', async () => {
    const res = await call(ctx, 'POST', '/v1/auth/register', { body: { email: 'Ana.Test@Venti.test', password: 'una-clave-larga-1', fullName: 'Ana' } });
    expect(res.status).toBe(202);
    expect(res.headers['set-cookie']).toBeUndefined();
    const msg = ctx.outbox.last('ana.test@venti.test', 'verify_email');
    expect(msg?.meta?.url).toMatch(/^https:\/\/venti\.test\/verificar\?token=/);

    // Sin confirmar no se puede entrar (ni siquiera con la contraseña correcta).
    const early = await call(ctx, 'POST', '/v1/auth/login', { body: { email: 'ana.test@venti.test', password: 'una-clave-larga-1' } });
    expect(early.body.error.code).toBe('email_not_verified');

    const v = await call(ctx, 'POST', '/v1/auth/verify-email', { body: { token: msg!.meta!.token, password: 'una-clave-larga-1' } });
    expect(v.status).toBe(200);
    expect(v.body.user).toMatchObject({ email: 'ana.test@venti.test', emailVerified: true });
    expect(v.body).not.toHaveProperty('user.passwordHash');
    expect(String(v.headers['set-cookie'])).toMatch(/venti_session=.+HttpOnly/i);
    // El enlace es de un solo uso.
    expect((await call(ctx, 'POST', '/v1/auth/verify-email', { body: { token: msg!.meta!.token, password: 'una-clave-larga-1' } })).status).toBe(400);
  });

  it('H5: registrar un email existente responde exactamente igual que uno nuevo', async () => {
    const nuevo = await call(ctx, 'POST', '/v1/auth/register', { body: { email: 'nuevo-h5@venti.test', password: 'una-clave-larga-1', fullName: 'Nuevo' } });
    const repetido = await call(ctx, 'POST', '/v1/auth/register', { body: { email: 'ANA.TEST@venti.test', password: 'otra-clave-larga-2', fullName: 'Otra' } });
    expect(repetido.status).toBe(nuevo.status);
    expect(repetido.body).toEqual(nuevo.body);
    // El dueño real recibe un aviso, no un enlace de activación.
    expect(ctx.outbox.last('ana.test@venti.test', 'account_exists')).toBeDefined();
    // Y la contraseña del intento NO reemplazó la del dueño.
    expect((await call(ctx, 'POST', '/v1/auth/login', { body: { email: 'ana.test@venti.test', password: 'una-clave-larga-1' } })).status).toBe(200);
  });

  it('nadie puede apropiarse de un email ajeno registrándolo primero', async () => {
    const victim = 'victima-squat@venti.test';
    // El atacante registra el email de la víctima (no controla ese buzón).
    await call(ctx, 'POST', '/v1/auth/register', { body: { email: victim, password: 'clave-del-atacante-1', fullName: 'Atacante' } });
    const attackerLink = ctx.outbox.last(victim, 'verify_email')!.meta!.token!;
    // La víctima se registra con su propia contraseña.
    await call(ctx, 'POST', '/v1/auth/register', { body: { email: victim, password: 'clave-de-la-victima-2', fullName: 'Víctima' } });
    const victimLink = ctx.outbox.last(victim, 'verify_email')!.meta!.token!;
    expect(victimLink).not.toBe(attackerLink);

    // Si la víctima toca por error el enlace del atacante, no puede activarlo con SU contraseña…
    const wrong = await call(ctx, 'POST', '/v1/auth/verify-email', { body: { token: attackerLink, password: 'clave-de-la-victima-2' } });
    expect(wrong.status).toBe(401);
    // …y con el suyo, la cuenta queda con SU contraseña y el enlace del atacante muere.
    const ok = await call(ctx, 'POST', '/v1/auth/verify-email', { body: { token: victimLink, password: 'clave-de-la-victima-2' } });
    expect(ok.body.user.fullName).toBe('Víctima');
    expect((await call(ctx, 'POST', '/v1/auth/verify-email', { body: { token: attackerLink, password: 'clave-del-atacante-1' } })).status).toBe(400);
    expect((await call(ctx, 'POST', '/v1/auth/login', { body: { email: victim, password: 'clave-del-atacante-1' } })).status).toBe(401);
  });

  it('recuperar contraseña: respuesta uniforme, enlace de un solo uso y cierra todas las sesiones', async () => {
    const u = await registerUser(ctx);
    const ghost = await call(ctx, 'POST', '/v1/auth/password/forgot', { body: { email: 'nadie-aca@venti.test' } });
    const real = await call(ctx, 'POST', '/v1/auth/password/forgot', { body: { email: u.email } });
    expect(real.status).toBe(202);
    expect(real.body).toEqual(ghost.body);
    const token = ctx.outbox.last(u.email, 'password_reset')!.meta!.token!;
    const reset = await call(ctx, 'POST', '/v1/auth/password/reset', { body: { token, password: 'nueva-clave-segura-9' } });
    expect(reset.status).toBe(204);
    expect((await call(ctx, 'GET', '/v1/me', { token: u.token })).status).toBe(401); // sesión vieja cerrada
    expect((await call(ctx, 'POST', '/v1/auth/password/reset', { body: { token, password: 'otra-clave-segura-9' } })).status).toBe(400);
    expect((await call(ctx, 'POST', '/v1/auth/login', { body: { email: u.email, password: 'nueva-clave-segura-9' } })).status).toBe(200);
  });

  it('rechaza contraseñas cortas', async () => {
    const res = await call(ctx, 'POST', '/v1/auth/register', { body: { email: 'corta@venti.test', password: 'corta', fullName: 'X' } });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation_error');
  });

  it('login correcto, /me y logout revoca la sesión', async () => {
    const u = await registerUser(ctx);
    const login = await call(ctx, 'POST', '/v1/auth/login', { body: { email: u.email, password: u.password } });
    expect(login.status).toBe(200);
    const token = login.body.token;
    expect((await call(ctx, 'GET', '/v1/me', { token })).body.user.id).toBe(u.id);
    expect((await call(ctx, 'POST', '/v1/auth/logout', { token })).status).toBe(204);
    expect((await call(ctx, 'GET', '/v1/me', { token })).status).toBe(401);
    // La otra sesión (la del registro) sigue viva.
    expect((await call(ctx, 'GET', '/v1/me', { token: u.token })).status).toBe(200);
  });

  it('misma respuesta para email inexistente y contraseña incorrecta', async () => {
    const u = await registerUser(ctx);
    const a = await call(ctx, 'POST', '/v1/auth/login', { body: { email: u.email, password: 'incorrecta-123' } });
    const b = await call(ctx, 'POST', '/v1/auth/login', { body: { email: 'nadie@venti.test', password: 'incorrecta-123' } });
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.body).toEqual(b.body);
  });

  it('bloquea la cuenta tras 10 intentos fallidos, aun con la contraseña correcta', async () => {
    const u = await registerUser(ctx);
    for (let i = 0; i < 10; i++) {
      expect((await call(ctx, 'POST', '/v1/auth/login', { body: { email: u.email, password: 'mala-clave-xx' } })).status).toBe(401);
    }
    const ok = await call(ctx, 'POST', '/v1/auth/login', { body: { email: u.email, password: u.password } });
    expect(ok.status).toBe(401);
  });

  it('limita la tasa de intentos por IP', async () => {
    const ip = randomIp();
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      statuses.push((await call(ctx, 'POST', '/v1/auth/login', { ip, body: { email: 'x@venti.test', password: 'abcdefghijk' } })).status);
    }
    expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
    expect(statuses.slice(10)).toEqual([429, 429]);
  });
});

describe('organizaciones y permisos', () => {
  it('crea una productora con CUIT válido y el creador queda owner', async () => {
    const u = await registerUser(ctx);
    const res = await call(ctx, 'POST', '/v1/organizations', { token: u.token, body: { name: 'Producciones Del Sol', taxId: validCuit() } });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ slug: 'producciones-del-sol', role: 'owner' });
    const mine = await call(ctx, 'GET', '/v1/organizations', { token: u.token });
    expect(mine.body.items.map((o: { id: string }) => o.id)).toContain(res.body.id);
  });

  it('rechaza un CUIT con dígito verificador incorrecto', async () => {
    const u = await registerUser(ctx);
    const good = validCuit('2098765432');
    const bad = good.slice(0, 10) + ((Number(good[10]) + 1) % 10);
    const res = await call(ctx, 'POST', '/v1/organizations', { token: u.token, body: { name: 'Mala', taxId: bad } });
    expect(res.status).toBe(400);
  });

  it('un no-miembro recibe 404 y un miembro sin permiso recibe 403', async () => {
    const owner = await registerUser(ctx);
    const staff = await registerUser(ctx);
    const stranger = await registerUser(ctx);
    const org = await call(ctx, 'POST', '/v1/organizations', { token: owner.token, body: { name: `Org ${Date.now()}` } });
    const orgId = org.body.id;

    expect((await call(ctx, 'GET', `/v1/organizations/${orgId}/events`, { token: stranger.token })).status).toBe(404);

    const add = await call(ctx, 'PUT', `/v1/organizations/${orgId}/members`, { token: owner.token, body: { email: staff.email, role: 'access_staff' } });
    expect(add.status).toBe(200);
    expect((await call(ctx, 'GET', `/v1/organizations/${orgId}/events`, { token: staff.token })).status).toBe(200);
    const create = await call(ctx, 'POST', `/v1/organizations/${orgId}/events`, {
      token: staff.token,
      body: { title: 'No debería', category: 'music', startsAt: '2030-01-01T20:00:00Z', endsAt: '2030-01-02T02:00:00Z' },
    });
    expect(create.status).toBe(403);
  });

  it('no permite dejar a la organización sin owner', async () => {
    const owner = await registerUser(ctx);
    const org = await call(ctx, 'POST', '/v1/organizations', { token: owner.token, body: { name: `Solo ${Date.now()}` } });
    const res = await call(ctx, 'PUT', `/v1/organizations/${org.body.id}/members`, { token: owner.token, body: { email: owner.email, role: 'admin' } });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('last_owner');
  });
});
