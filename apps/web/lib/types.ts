/** Tipos de las respuestas de la API (ver /docs en la API). */

export interface Venue {
  id: string;
  name: string;
  address: string;
  city: string;
  province: string;
  capacity: number | null;
}

export interface PublicEvent {
  id: string;
  organizationId: string;
  slug: string;
  title: string;
  description: string;
  category: string;
  status: 'published' | 'cancelled' | 'finished';
  startsAt: string;
  endsAt: string;
  timezone: string;
  coverImageUrl: string | null;
  organization: { id: string; slug: string; name: string };
  venue: Venue | null;
  fromPriceCents?: number | null;
}

export type SaleState = 'on_sale' | 'sold_out' | 'not_started' | 'ended' | 'unavailable';

export interface PublicTicketType {
  id: string;
  name: string;
  description: string;
  kind: string;
  currency: string;
  available: number;
  maxPerOrder: number;
  salesStartAt: string | null;
  salesEndAt: string | null;
  saleState: SaleState;
  currentStage: { id: string; name: string; priceCents: number; endsAt: string | null } | null;
}

export interface PublicEventDetail extends PublicEvent {
  ticketTypes: PublicTicketType[];
}

export interface User {
  id: string;
  email: string;
  fullName: string;
  emailVerified: boolean;
  mfaEnabled: boolean;
}

export interface Hold {
  id: string;
  eventId: string;
  status: 'active' | 'converted' | 'expired' | 'released';
  expiresAt: string;
  currency: string;
  totalCents: number;
  items: { ticketTypeId: string; ticketTypeName: string; stageName: string | null; quantity: number; unitPriceCents: number }[];
}

export interface Ticket {
  id: string;
  status: 'valid' | 'locked' | 'used' | 'void' | 'cancelled' | 'refunded';
  holderName: string;
  ticketType: { id: string; name: string; kind: string };
  event: { id: string; title: string; startsAt: string; endsAt: string; venueName: string | null; city: string | null };
  priceCents: number;
  currency: string;
  issuedAt: string;
  usedAt: string | null;
  qr: string | null;
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: Record<string, unknown> };
}
