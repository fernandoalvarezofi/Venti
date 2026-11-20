import { DomainError } from './errors.ts';

/** Monedas soportadas. Los importes siempre se expresan en centavos enteros. */
export const CURRENCIES = ['ARS', 'USD'] as const;
export type Currency = (typeof CURRENCIES)[number];

export interface Money {
  readonly cents: number;
  readonly currency: Currency;
}

function assertCents(cents: number): void {
  if (!Number.isSafeInteger(cents)) {
    throw new DomainError('money.invalid_amount', `Importe inválido: ${cents}. Debe ser un entero de centavos.`);
  }
}

export function money(cents: number, currency: Currency): Money {
  assertCents(cents);
  return { cents, currency };
}

export function addMoney(a: Money, b: Money): Money {
  if (a.currency !== b.currency) {
    throw new DomainError('money.currency_mismatch', `No se pueden sumar ${a.currency} y ${b.currency}.`);
  }
  return money(a.cents + b.cents, a.currency);
}

export function multiplyMoney(a: Money, factor: number): Money {
  if (!Number.isSafeInteger(factor)) {
    throw new DomainError('money.invalid_factor', 'El multiplicador debe ser entero.');
  }
  return money(a.cents * factor, a.currency);
}

/**
 * Porcentaje expresado en puntos básicos (1 bp = 0,01%) para evitar decimales.
 * Redondeo bancario (mitad al par) para que la suma de muchas comisiones no tenga sesgo.
 */
export function percentOf(a: Money, basisPoints: number): Money {
  if (!Number.isSafeInteger(basisPoints) || basisPoints < 0) {
    throw new DomainError('money.invalid_rate', 'La tasa debe ser un entero de puntos básicos ≥ 0.');
  }
  const raw = (a.cents * basisPoints) / 10_000;
  const floor = Math.floor(raw);
  const diff = raw - floor;
  let rounded: number;
  if (diff > 0.5) rounded = floor + 1;
  else if (diff < 0.5) rounded = floor;
  else rounded = floor % 2 === 0 ? floor : floor + 1;
  return money(rounded, a.currency);
}

export function formatMoney(m: Money, locale = 'es-AR'): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency: m.currency }).format(m.cents / 100);
}
