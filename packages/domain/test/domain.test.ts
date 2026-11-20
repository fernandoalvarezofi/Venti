import { describe, expect, it } from 'vitest';
import {
  DomainError,
  addMoney,
  base32Decode,
  base32Encode,
  buyerFeeCents,
  generateQrKeyPair,
  hotp,
  loadPrivateKey,
  loadPublicKey,
  money,
  percentOf,
  resolveActiveStage,
  roleHas,
  signTicketQr,
  slugify,
  totp,
  transitionTicket,
  validateStages,
  verifyTicketQr,
  verifyTotp,
  type PriceStage,
} from '../src/index.ts';

describe('money', () => {
  it('rechaza importes no enteros', () => {
    expect(() => money(10.5, 'ARS')).toThrow(DomainError);
  });
  it('no suma monedas distintas', () => {
    expect(() => addMoney(money(1, 'ARS'), money(1, 'USD'))).toThrow(/ARS y USD/);
  });
  it('calcula porcentajes con redondeo bancario', () => {
    expect(percentOf(money(10_000, 'ARS'), 1_000).cents).toBe(1_000); // 10%
    expect(percentOf(money(5, 'ARS'), 5_000).cents).toBe(2); // 2,5 → 2 (par)
    expect(percentOf(money(7, 'ARS'), 5_000).cents).toBe(4); // 3,5 → 4 (par)
  });
});

describe('máquina de estados de tickets', () => {
  it('permite check-in de un ticket válido', () => {
    expect(transitionTicket('valid', 'check_in')).toBe('used');
  });
  it('impide usar un ticket anulado', () => {
    expect(() => transitionTicket('void', 'check_in')).toThrow(/No se puede aplicar/);
  });
  it('impide reemitir un ticket ya usado', () => {
    expect(() => transitionTicket('used', 'reissue')).toThrow(DomainError);
  });
  it('permite reemitir un ticket bloqueado en reventa', () => {
    expect(transitionTicket('locked', 'reissue')).toBe('void');
  });
});

describe('etapas de precio', () => {
  const stage = (p: Partial<PriceStage> & Pick<PriceStage, 'id' | 'position'>): PriceStage => ({
    priceCents: 1000,
    startsAt: null,
    endsAt: null,
    quantityLimit: null,
    soldCount: 0,
    ...p,
  });
  const now = new Date('2027-01-10T12:00:00Z');

  it('usa la primera etapa con cupo', () => {
    const stages = [stage({ id: 'eb', position: 1, quantityLimit: 100, soldCount: 99 }), stage({ id: 'gen', position: 2 })];
    expect(resolveActiveStage(stages, now, 1)?.id).toBe('eb');
    expect(resolveActiveStage(stages, now, 2)?.id).toBe('gen');
  });
  it('respeta las ventanas de tiempo', () => {
    const stages = [
      stage({ id: 'pre', position: 1, endsAt: new Date('2027-01-01T00:00:00Z') }),
      stage({ id: 'gen', position: 2, startsAt: new Date('2027-01-01T00:00:00Z') }),
    ];
    expect(resolveActiveStage(stages, now)?.id).toBe('gen');
  });
  it('devuelve null si no hay etapa vigente', () => {
    expect(resolveActiveStage([stage({ id: 'x', position: 1, startsAt: new Date('2030-01-01') })], now)).toBeNull();
  });
  it('valida posiciones duplicadas y ventanas inválidas', () => {
    expect(() => validateStages([{ position: 1, priceCents: 1, startsAt: null, endsAt: null, quantityLimit: null }, { position: 1, priceCents: 1, startsAt: null, endsAt: null, quantityLimit: null }])).toThrow(/posición 1/);
    expect(() => validateStages([{ position: 1, priceCents: 1, startsAt: new Date(2), endsAt: new Date(1), quantityLimit: null }])).toThrow(DomainError);
  });
});

describe('cargo por servicio', () => {
  it('calcula el 10% con redondeo bancario y no cobra en compras gratis', () => {
    expect(buyerFeeCents(3_600_000, 1000)).toBe(360_000);
    expect(buyerFeeCents(5, 1000)).toBe(0); // 0,5 → 0 (par)
    expect(buyerFeeCents(15, 1000)).toBe(2); // 1,5 → 2 (par)
    expect(buyerFeeCents(0, 1000)).toBe(0);
  });
  it('rechaza cargos fuera de rango', () => {
    expect(() => buyerFeeCents(100, 3001)).toThrow(DomainError);
    expect(() => buyerFeeCents(-1, 100)).toThrow(DomainError);
  });
});

describe('QR firmado (Ed25519)', () => {
  const keys = generateQrKeyPair();
  const priv = loadPrivateKey(keys.privateKeyPem);
  const pub = loadPublicKey(keys.publicKeyPem);
  const claims = { ticketId: '7d0b1f5e-1c2a-4b7e-9a51-3f2e8c4d6a10', version: 1, eventId: '0e9a8b7c-6d5e-4f3a-8b2c-1d0e9f8a7b6c' };

  it('verifica un QR firmado', () => {
    const qr = signTicketQr(claims, priv);
    expect(verifyTicketQr(qr, pub)).toEqual({ ok: true, claims });
  });
  it('rechaza un QR con la versión alterada', () => {
    const qr = signTicketQr(claims, priv).replace('.1.', '.2.');
    expect(verifyTicketQr(qr, pub)).toEqual({ ok: false, reason: 'bad_signature' });
  });
  it('rechaza un QR firmado con otra clave', () => {
    const other = loadPrivateKey(generateQrKeyPair().privateKeyPem);
    expect(verifyTicketQr(signTicketQr(claims, other), pub).ok).toBe(false);
  });
  it('rechaza basura', () => {
    expect(verifyTicketQr('hola', pub)).toEqual({ ok: false, reason: 'malformed' });
  });
});

describe('TOTP (RFC 6238 / RFC 4226)', () => {
  const rfcSecret = Buffer.from('12345678901234567890');
  it('cumple los vectores de RFC 4226', () => {
    const expected = ['755224', '287082', '359152', '969429', '338314'];
    expected.forEach((code, i) => expect(hotp(rfcSecret, i)).toBe(code));
  });
  it('cumple los vectores SHA1 de RFC 6238 (8 dígitos)', () => {
    const b32 = base32Encode(rfcSecret);
    expect(totp(b32, new Date(59_000), 8)).toBe('94287082');
    expect(totp(b32, new Date(1_111_111_109_000), 8)).toBe('07081804');
    expect(totp(b32, new Date(2_000_000_000_000), 8)).toBe('69279037');
  });
  it('base32 ida y vuelta', () => {
    expect(base32Decode(base32Encode(rfcSecret)).equals(rfcSecret)).toBe(true);
  });
  it('acepta ±1 paso de desfase y rechaza más', () => {
    const b32 = base32Encode(rfcSecret);
    const t = new Date(1_700_000_000_000);
    const code = totp(b32, t);
    expect(verifyTotp(b32, code, new Date(t.getTime() + 30_000))).not.toBeNull();
    expect(verifyTotp(b32, code, new Date(t.getTime() + 90_000))).toBeNull();
    expect(verifyTotp(b32, 'abc123', t)).toBeNull();
  });
});

describe('roles y slugs', () => {
  it('access_staff puede escanear pero no emitir cortesías', () => {
    expect(roleHas('access_staff', 'access.scan')).toBe(true);
    expect(roleHas('access_staff', 'tickets.courtesy')).toBe(false);
  });
  it('sólo owner administra la organización', () => {
    expect(roleHas('owner', 'org.manage')).toBe(true);
    expect(roleHas('admin', 'org.manage')).toBe(false);
  });
  it('genera slugs sin acentos', () => {
    expect(slugify('Fiesta Nacional del Sol — San Juan 2027!')).toBe('fiesta-nacional-del-sol-san-juan-2027');
  });
});
