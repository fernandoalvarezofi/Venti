import { DomainError } from './errors.ts';

export const TICKET_KINDS = [
  'general',
  'vip',
  'backstage',
  'early_bird',
  'presale',
  'seated',
  'sector',
  'group',
  'season_pass',
  'multiday',
  'courtesy',
  'corporate',
] as const;
export type TicketKind = (typeof TICKET_KINDS)[number];

/**
 * Estados de un ticket.
 * - valid: habilita el ingreso.
 * - locked: publicado en reventa o swap; no se puede transferir ni volver a publicar.
 * - used: ya ingresó (los reingresos se registran en Access, no cambian el estado).
 * - void: anulado por reemisión (transferencia, reventa, swap). Siempre existe un ticket sucesor.
 * - cancelled: anulado por cancelación del evento o decisión administrativa.
 * - refunded: devuelto al comprador.
 */
export const TICKET_STATUSES = ['valid', 'locked', 'used', 'void', 'cancelled', 'refunded'] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export type TicketTransition =
  | 'check_in'
  | 'undo_check_in'
  | 'lock'
  | 'unlock'
  | 'reissue'
  | 'cancel'
  | 'refund';

const TRANSITIONS: Record<TicketTransition, { from: readonly TicketStatus[]; to: TicketStatus }> = {
  check_in: { from: ['valid'], to: 'used' },
  undo_check_in: { from: ['used'], to: 'valid' },
  lock: { from: ['valid'], to: 'locked' },
  unlock: { from: ['locked'], to: 'valid' },
  reissue: { from: ['valid', 'locked'], to: 'void' },
  cancel: { from: ['valid', 'locked'], to: 'cancelled' },
  refund: { from: ['valid', 'locked', 'cancelled'], to: 'refunded' },
};

export function canTransition(from: TicketStatus, transition: TicketTransition): boolean {
  return TRANSITIONS[transition].from.includes(from);
}

/** Devuelve el estado destino o lanza si la transición no está permitida. */
export function transitionTicket(from: TicketStatus, transition: TicketTransition): TicketStatus {
  const rule = TRANSITIONS[transition];
  if (!rule.from.includes(from)) {
    throw new DomainError('ticket.invalid_transition', `No se puede aplicar "${transition}" a un ticket en estado "${from}".`, {
      from,
      transition,
    });
  }
  return rule.to;
}

/** Estados desde los que el ticket ya no puede volver a habilitar un ingreso. */
export function isTerminal(status: TicketStatus): boolean {
  return status === 'void' || status === 'cancelled' || status === 'refunded';
}
