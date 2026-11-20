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
  subtotalCents: number;
  feeCents: number;
  totalCents: number;
  items: { ticketTypeId: string; ticketTypeName: string; stageName: string | null; quantity: number; unitPriceCents: number }[];
}

export interface Quote {
  eventId: string;
  currency: string;
  lines: { ticketTypeId: string; ticketTypeName: string; stageId: string; stageName: string; quantity: number; unitPriceCents: number; lineTotalCents: number }[];
  subtotalCents: number;
  feeCents: number;
  feeBps: number;
  totalCents: number;
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

// ─── VENTI BUSINESS ───

export type OrgRole = 'owner' | 'admin' | 'manager' | 'finance' | 'sales' | 'access_staff' | 'viewer';
export type EventStatus = 'draft' | 'published' | 'cancelled' | 'finished';

export interface Org {
  id: string;
  slug: string;
  name: string;
  legalName: string | null;
  taxId: string | null;
  role: OrgRole;
}

export interface OverviewEvent {
  id: string;
  title: string;
  status: EventStatus;
  startsAt: string;
  endsAt: string;
  venueName: string | null;
  city: string | null;
  capacity: number;
  sold: number;
  held: number;
}

export interface Overview {
  totals: { events: number; published: number; drafts: number; ticketsSold: number; capacity: number };
  events: OverviewEvent[];
}

export interface Stage {
  id: string;
  name: string;
  position: number;
  priceCents: number;
  startsAt: string | null;
  endsAt: string | null;
  quantityLimit: number | null;
  soldCount: number;
  heldCount: number;
}

export interface AdminTicketType {
  id: string;
  name: string;
  description: string;
  kind: string;
  currency: string;
  capacity: number;
  sold: number;
  held: number;
  available: number;
  maxPerOrder: number;
  salesStartAt: string | null;
  salesEndAt: string | null;
  hidden: boolean;
  saleState: SaleState;
  currentStage: Stage | null;
  stages: Stage[];
}

export interface AdminEvent {
  id: string;
  organizationId: string;
  slug: string;
  title: string;
  description: string;
  category: string;
  status: EventStatus;
  startsAt: string;
  endsAt: string;
  timezone: string;
  coverImageUrl: string | null;
  venueId: string | null;
  publishedAt: string | null;
  venue: Venue | null;
  ticketTypes: AdminTicketType[];
}

export interface EventStats {
  capacity: number;
  sold: number;
  held: number;
  available: number;
  courtesies: number;
  checkedIn: number;
  grossCents: number;
  activeHolds: number;
  byType: { id: string; name: string; kind: string; capacity: number; sold: number; held: number; courtesies: number; checkedIn: number }[];
}

export interface Attendee {
  id: string;
  holderName: string;
  holderEmail: string;
  ticketTypeName: string;
  status: Ticket['status'];
  priceCents: number;
  courtesy: boolean;
  issuedAt: string;
  usedAt: string | null;
}

export interface Member {
  userId: string;
  email: string;
  fullName: string;
  role: OrgRole;
  createdAt: string;
}
