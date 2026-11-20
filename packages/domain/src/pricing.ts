import { DomainError } from './errors.ts';

/** Etapa de precio de un tipo de entrada (preventa, early bird, general, puerta…). */
export interface PriceStage {
  readonly id: string;
  readonly position: number;
  readonly priceCents: number;
  readonly startsAt: Date | null;
  readonly endsAt: Date | null;
  /** Cupo máximo vendible en esta etapa; null = sin límite propio. */
  readonly quantityLimit: number | null;
  /** Unidades ya vendidas en esta etapa. */
  readonly soldCount: number;
}

/**
 * Elige la etapa vigente: la de menor `position` cuya ventana incluye `now`
 * y que todavía tiene cupo para `quantity` unidades.
 * Las etapas se agotan en orden: si el early bird se llenó, rige la siguiente.
 * Una compra no se reparte entre dos etapas: si no entra completa, pasa a la siguiente.
 */
export function resolveActiveStage(stages: readonly PriceStage[], now: Date, quantity = 1): PriceStage | null {
  if (!Number.isSafeInteger(quantity) || quantity < 1) {
    throw new DomainError('pricing.invalid_quantity', 'La cantidad debe ser un entero positivo.');
  }
  const ordered = [...stages].sort((a, b) => a.position - b.position);
  for (const stage of ordered) {
    if (stage.startsAt && now < stage.startsAt) continue;
    if (stage.endsAt && now >= stage.endsAt) continue;
    if (stage.quantityLimit !== null && stage.soldCount + quantity > stage.quantityLimit) continue;
    return stage;
  }
  return null;
}

/** Cargo por servicio al comprador por defecto: 10% (1000 puntos básicos). Cada productora puede tener el suyo. */
export const DEFAULT_BUYER_FEE_BPS = 1000;
/** Tope de seguridad: ningún cargo por servicio puede superar el 30%. */
export const MAX_BUYER_FEE_BPS = 3000;

/**
 * Cargo por servicio de una compra. Se calcula sobre el subtotal completo (no por entrada)
 * con redondeo bancario. Las compras gratuitas no pagan cargo.
 */
export function buyerFeeCents(subtotalCents: number, feeBps: number): number {
  if (!Number.isSafeInteger(subtotalCents) || subtotalCents < 0) {
    throw new DomainError('pricing.invalid_subtotal', 'El subtotal debe ser un entero de centavos ≥ 0.');
  }
  if (!Number.isSafeInteger(feeBps) || feeBps < 0 || feeBps > MAX_BUYER_FEE_BPS) {
    throw new DomainError('pricing.invalid_fee', `El cargo por servicio debe estar entre 0 y ${MAX_BUYER_FEE_BPS / 100}%.`);
  }
  if (subtotalCents === 0) return 0;
  const raw = (subtotalCents * feeBps) / 10_000;
  const floor = Math.floor(raw);
  const diff = raw - floor;
  if (diff > 0.5) return floor + 1;
  if (diff < 0.5) return floor;
  return floor % 2 === 0 ? floor : floor + 1;
}

/** Valida que las etapas sean coherentes antes de persistirlas. */
export function validateStages(stages: readonly Omit<PriceStage, 'id' | 'soldCount'>[]): void {
  const positions = new Set<number>();
  for (const s of stages) {
    if (!Number.isSafeInteger(s.priceCents) || s.priceCents < 0) {
      throw new DomainError('pricing.invalid_price', 'El precio debe ser un entero de centavos ≥ 0.');
    }
    if (s.startsAt && s.endsAt && s.endsAt <= s.startsAt) {
      throw new DomainError('pricing.invalid_window', 'La etapa debe terminar después de empezar.');
    }
    if (s.quantityLimit !== null && (!Number.isSafeInteger(s.quantityLimit) || s.quantityLimit < 1)) {
      throw new DomainError('pricing.invalid_limit', 'El cupo de la etapa debe ser un entero positivo.');
    }
    if (positions.has(s.position)) {
      throw new DomainError('pricing.duplicate_position', `Hay dos etapas con la posición ${s.position}.`);
    }
    positions.add(s.position);
  }
}
