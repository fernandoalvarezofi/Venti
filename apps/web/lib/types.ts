/** Tipos de las respuestas de la API (ver /docs en la API). */

export interface Venue {
  id: string;
  name: string;
  address: string;
  city: string;
  province: string;
  capacity: number | null;
}

export interface Media {
  id: string;
  /** Relativa a la API: la web la sirve bajo /api (ver mediaSrc). */
  url: string;
  width: number;
  height: number;
}

export type LineupRole = 'headliner' | 'guest' | 'support' | 'resident' | 'dj' | 'host';

export interface LineupItem {
  name: string;
  role: LineupRole;
  startsAt: string | null;
  stage: string | null;
  bio: string;
  link: string | null;
  /** Foto subida al evento (id de imagen). */
  imageId: string | null;
}

export type SponsorTier = 'sponsor' | 'partner' | 'brand' | 'producer' | 'media';
export interface Sponsor {
  name: string;
  tier: SponsorTier;
  url: string | null;
  logoId: string | null;
}
export type PageSectionKey = 'about' | 'lineup' | 'videos' | 'gallery' | 'amenities' | 'sponsors' | 'faq' | 'policies' | 'contact';

/** Contenido del evento además de fecha y lugar. */
export interface EventContent {
  doorsOpenAt: string | null;
  minAge: number | null;
  dressCode: string | null;
  lineup: LineupItem[];
  amenities: string[];
  extraAmenities: string[];
  links: Partial<Record<'instagram' | 'tiktok' | 'spotify' | 'youtube' | 'website', string>>;
  policies: string;
  summary: string;
  videos: { url: string; title: string }[];
  sponsors: Sponsor[];
  faq: { q: string; a: string }[];
  contact: { email?: string; whatsapp?: string };
  seo: { title?: string; description?: string };
  pageSections: { key: PageSectionKey; visible: boolean }[];
  coverImage: Media | null;
  gallery: Media[];
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
  coverImage?: Media | null;
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

export interface PublicEventDetail extends Omit<PublicEvent, 'coverImage'>, EventContent {
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
  /** Cargo por servicio de Lintick que paga el comprador. */
  feeCents: number;
  totalCents: number;
  items: { ticketTypeId: string; ticketTypeName: string; stageName: string | null; quantity: number; unitPriceCents: number }[];
}

export interface Quote {
  eventId: string;
  currency: string;
  lines: { ticketTypeId: string; ticketTypeName: string; stageId: string; stageName: string; quantity: number; unitPriceCents: number; lineTotalCents: number }[];
  subtotalCents: number;
  feeBps: number;
  feeCents: number;
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

// ─── Lintick Business ───

export type OrgRole = 'owner' | 'admin' | 'manager' | 'finance' | 'sales' | 'access_staff' | 'viewer';
export type EventStatus = 'draft' | 'published' | 'cancelled' | 'finished';

export type Permission = 'org.manage' | 'members.manage' | 'events.read' | 'events.write' | 'events.publish' | 'inventory.write' | 'tickets.courtesy' | 'tickets.read' | 'finance.read' | 'finance.write' | 'access.scan' | 'audit.read';

export interface Org {
  id: string;
  slug: string;
  name: string;
  legalName: string | null;
  taxId: string | null;
  role: OrgRole;
  /** Permisos del rol (vienen de la API). */
  permissions: Permission[];
}

export interface OverviewEvent {
  id: string;
  title: string;
  category: string;
  /** Ruta de la API (/v1/media/…) o URL externa. */
  coverUrl: string | null;
  status: EventStatus;
  startsAt: string;
  endsAt: string;
  venueName: string | null;
  city: string | null;
  capacity: number;
  sold: number;
  held: number;
  checkedIn: number;
  grossCents: number;
}

export interface Overview {
  totals: {
    events: number;
    published: number;
    drafts: number;
    ticketsSold: number;
    capacity: number;
    checkedIn: number;
    grossCents: number;
    commissionCents: number;
    netCents: number;
    commissionBps: number;
    buyers: number;
  };
  monthly: { month: string; grossCents: number; tickets: number }[];
  recent: { orderId: string; eventId: string; eventTitle: string; buyerFirstName: string; tickets: number; subtotalCents: number; paidAt: string }[];
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

export interface AdminEvent extends EventContent {
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
  commissionCents: number;
  netCents: number;
  commissionBps: number;
  activeHolds: number;
  byType: { id: string; name: string; kind: string; capacity: number; sold: number; held: number; courtesies: number; checkedIn: number; grossCents: number }[];
  daily: { date: string; sold: number; courtesies: number }[];
}

export interface Attendee {
  id: string;
  holderName: string;
  holderEmail: string;
  holderDocLast3: string | null;
  pendingClaim: boolean;
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

export interface StaffShift {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  validFrom: string;
  validUntil: string;
}

export interface AccessEvent {
  orgId: string;
  orgName: string;
  eventId: string;
  title: string;
  startsAt: string;
  endsAt: string;
  venueName: string | null;
  shift: { from: string; until: string } | null;
}

export interface CheckinSummary {
  admitted: number;
  expected: number;
  recent: { ticketId: string; holderName: string; ticketTypeName: string; at: string; gate: string | null }[];
}

export type ScanResultCode = 'admitted' | 'already_used' | 'invalid_signature' | 'malformed' | 'wrong_event' | 'not_found' | 'outdated_qr' | 'not_valid';

export interface ScanResponse {
  result: ScanResultCode;
  message: string;
  ticket: { id: string; holderName: string; holderDocLast3: string | null; ticketTypeName: string; status: string; usedAt: string | null } | null;
}

export interface PaymentAccountStatus {
  available: boolean;
  connected: boolean;
  liveMode: boolean | null;
  sellerId: string | null;
  connectedAt: string | null;
  expiresAt: string | null;
  lastError: string | null;
  commissionBps: number;
}
