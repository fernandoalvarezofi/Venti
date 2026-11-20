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
