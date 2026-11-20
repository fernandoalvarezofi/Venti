import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  customType,
  smallint,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { CURRENCIES, ORG_ROLES, TICKET_KINDS, TICKET_STATUSES } from '@venti/domain';

/*
 * Convenciones:
 * - ids UUID generados por la aplicación (permiten fijar el contexto RLS antes del INSERT).
 * - dinero en centavos (bigint, modo number: los importes reales caben en 2^53).
 * - toda tabla tenant tiene organization_id NOT NULL y RLS forzado (ver migración de RLS).
 */

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const createdAt = () => ts('created_at').notNull().defaultNow();
const updatedAt = () => ts('updated_at').notNull().defaultNow();
const cents = (name: string) => bigint(name, { mode: 'number' });
const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => 'bytea' });

/** Contenido del evento (lo que se muestra al público además de fecha y lugar). */
export type LineupRole = 'headliner' | 'guest' | 'support' | 'resident' | 'dj' | 'host';
export interface LineupItem {
  name: string;
  role: LineupRole;
  /** Hora de presentación (ISO) si se conoce. */
  startsAt: string | null;
  stage: string | null;
}
export interface EventLinks {
  instagram?: string;
  tiktok?: string;
  spotify?: string;
  youtube?: string;
  website?: string;
}

export const orgRole = pgEnum('org_role', ORG_ROLES);
export const ticketKind = pgEnum('ticket_kind', TICKET_KINDS);
export const ticketStatus = pgEnum('ticket_status', TICKET_STATUSES);
export const currency = pgEnum('currency', CURRENCIES);
export const eventStatus = pgEnum('event_status', ['draft', 'published', 'cancelled', 'finished']);
export const holdStatus = pgEnum('hold_status', ['active', 'converted', 'expired', 'released']);
export const orderStatus = pgEnum('order_status', [
  'pending_payment',
  'paid',
  'cancelled',
  'expired',
  'refunded',
  'partially_refunded',
]);
export const userStatus = pgEnum('user_status', ['active', 'suspended']);

// ───────────────────────────── Identidad (global, sin RLS) ─────────────────────────────

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey(),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    fullName: text('full_name').notNull(),
    phone: text('phone'),
    status: userStatus('status').notNull().default('active'),
    emailVerifiedAt: ts('email_verified_at'),
    mfaSecretEnc: text('mfa_secret_enc'),
    mfaEnabledAt: ts('mfa_enabled_at'),
    mfaLastCounter: bigint('mfa_last_counter', { mode: 'number' }),
    failedLoginCount: integer('failed_login_count').notNull().default(0),
    lockedUntil: ts('locked_until'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('users_email_lower_uq').on(sql`lower(${t.email})`),
    check('users_email_format', sql`${t.email} ~ '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$'`),
  ],
);

/** Cuentas externas con las que una persona puede entrar (hoy: Google). Se identifica por el "sub" del proveedor, que nunca cambia. */
export const userIdentities = pgTable(
  'user_identities',
  {
    provider: text('provider').notNull(),
    subject: text('subject').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    createdAt: createdAt(),
    lastUsedAt: ts('last_used_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.provider, t.subject] }), uniqueIndex('user_identities_user_provider_uq').on(t.userId, t.provider)],
);

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    mfaVerified: boolean('mfa_verified').notNull().default(false),
    ip: text('ip'),
    userAgent: text('user_agent'),
    createdAt: createdAt(),
    lastSeenAt: ts('last_seen_at').notNull().defaultNow(),
    expiresAt: ts('expires_at').notNull(),
    revokedAt: ts('revoked_at'),
  },
  (t) => [uniqueIndex('sessions_token_hash_uq').on(t.tokenHash), index('sessions_user_idx').on(t.userId)],
);

// ───────────────────────────── Organizaciones y white label ─────────────────────────────

export const organizations = pgTable(
  'organizations',
  {
    id: uuid('id').primaryKey(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    legalName: text('legal_name'),
    taxId: text('tax_id'), // CUIT
    status: text('status', { enum: ['active', 'suspended'] }).notNull().default('active'),
    settings: jsonb('settings').notNull().default({}),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('organizations_slug_uq').on(t.slug)],
);

export const memberships = pgTable(
  'memberships',
  {
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: orgRole('role').notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.organizationId, t.userId] }), index('memberships_user_idx').on(t.userId)],
);

export const brands = pgTable(
  'brands',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    theme: jsonb('theme').notNull().default({}),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('brands_org_slug_uq').on(t.organizationId, t.slug)],
);

export const domains = pgTable(
  'domains',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    brandId: uuid('brand_id')
      .notNull()
      .references(() => brands.id, { onDelete: 'cascade' }),
    hostname: text('hostname').notNull(),
    verificationToken: text('verification_token').notNull(),
    verifiedAt: ts('verified_at'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('domains_hostname_uq').on(sql`lower(${t.hostname})`)],
);

// ───────────────────────────── Eventos ─────────────────────────────

export const venues = pgTable(
  'venues',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    address: text('address').notNull(),
    city: text('city').notNull(),
    province: text('province').notNull(),
    country: text('country').notNull().default('AR'),
    latitude: text('latitude'),
    longitude: text('longitude'),
    capacity: integer('capacity'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('venues_org_idx').on(t.organizationId)],
);

export const events = pgTable(
  'events',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    brandId: uuid('brand_id').references(() => brands.id, { onDelete: 'set null' }),
    venueId: uuid('venue_id').references(() => venues.id, { onDelete: 'restrict' }),
    slug: text('slug').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    category: text('category').notNull(),
    status: eventStatus('status').notNull().default('draft'),
    startsAt: ts('starts_at').notNull(),
    endsAt: ts('ends_at').notNull(),
    timezone: text('timezone').notNull().default('America/Argentina/Buenos_Aires'),
    coverImageUrl: text('cover_image_url'),
    publishedAt: ts('published_at'),
    cancelledAt: ts('cancelled_at'),
    cancellationReason: text('cancellation_reason'),
    doorsOpenAt: ts('doors_open_at'),
    minAge: smallint('min_age'),
    dressCode: text('dress_code'),
    lineup: jsonb('lineup').$type<LineupItem[]>().notNull().default([]),
    /** Códigos del catálogo de servicios (bar, food, cloakroom…). */
    amenities: jsonb('amenities').$type<string[]>().notNull().default([]),
    /** Servicios propios que no están en el catálogo (texto corto). */
    extraAmenities: jsonb('extra_amenities').$type<string[]>().notNull().default([]),
    links: jsonb('links').$type<EventLinks>().notNull().default({}),
    policies: text('policies').notNull().default(''),
    coverMediaId: uuid('cover_media_id'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('events_org_slug_uq').on(t.organizationId, t.slug),
    index('events_public_idx').on(t.status, t.startsAt),
    check('events_dates', sql`${t.endsAt} > ${t.startsAt}`),
    check('events_min_age', sql`${t.minAge} IS NULL OR ${t.minAge} BETWEEN 0 AND 25`),
  ],
);

export const sectors = pgTable(
  'sectors',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    capacity: integer('capacity').notNull(),
    seated: boolean('seated').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('sectors_event_name_uq').on(t.eventId, t.name), check('sectors_capacity', sql`${t.capacity} > 0`)],
);

export const ticketTypes = pgTable(
  'ticket_types',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    sectorId: uuid('sector_id').references(() => sectors.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    kind: ticketKind('kind').notNull(),
    currency: currency('currency').notNull().default('ARS'),
    capacity: integer('capacity').notNull(),
    sold: integer('sold').notNull().default(0),
    held: integer('held').notNull().default(0),
    maxPerOrder: integer('max_per_order').notNull().default(10),
    salesStartAt: ts('sales_start_at'),
    salesEndAt: ts('sales_end_at'),
    /** Oculto del catálogo: sólo se vende con link o código (preventas exclusivas, corporativas). */
    hidden: boolean('hidden').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('ticket_types_event_idx').on(t.eventId),
    // Invariante de stock garantizada por la base: nunca se vende ni reserva de más.
    check('ticket_types_stock', sql`${t.sold} >= 0 AND ${t.held} >= 0 AND ${t.sold} + ${t.held} <= ${t.capacity}`),
    check('ticket_types_max_per_order', sql`${t.maxPerOrder} BETWEEN 1 AND 100`),
  ],
);

export const priceStages = pgTable(
  'price_stages',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    ticketTypeId: uuid('ticket_type_id')
      .notNull()
      .references(() => ticketTypes.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    position: integer('position').notNull(),
    priceCents: cents('price_cents').notNull(),
    startsAt: ts('starts_at'),
    endsAt: ts('ends_at'),
    quantityLimit: integer('quantity_limit'),
    soldCount: integer('sold_count').notNull().default(0),
    heldCount: integer('held_count').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('price_stages_position_uq').on(t.ticketTypeId, t.position),
    check('price_stages_price', sql`${t.priceCents} >= 0`),
    check(
      'price_stages_limit',
      sql`${t.soldCount} >= 0 AND ${t.heldCount} >= 0 AND (${t.quantityLimit} IS NULL OR ${t.soldCount} + ${t.heldCount} <= ${t.quantityLimit})`,
    ),
  ],
);

// ───────────────────────────── Reservas, órdenes, tickets ─────────────────────────────

export const holds = pgTable(
  'holds',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: holdStatus('status').notNull().default('active'),
    currency: currency('currency').notNull().default('ARS'),
    /** Montos congelados al reservar: el precio no cambia mientras dura la reserva. */
    subtotalCents: cents('subtotal_cents').notNull().default(0),
    /** Cargo al comprador: Lintick no cobra cargos al comprador, queda en 0. */
    feeCents: cents('fee_cents').notNull().default(0),
    /** Comisión de Lintick (se descuenta a la productora), congelada al reservar. */
    commissionBps: integer('commission_bps').notNull().default(0),
    commissionCents: cents('commission_cents').notNull().default(0),
    expiresAt: ts('expires_at').notNull(),
    createdAt: createdAt(),
    closedAt: ts('closed_at'),
  },
  (t) => [
    check('holds_commission', sql`${t.commissionCents} >= 0 AND ${t.commissionCents} <= ${t.subtotalCents} AND ${t.commissionBps} BETWEEN 0 AND 3000`),
    index('holds_expiry_idx').on(t.expiresAt).where(sql`${t.status} = 'active'`),
    index('holds_user_idx').on(t.userId),
  ],
);

export const holdItems = pgTable(
  'hold_items',
  {
    holdId: uuid('hold_id')
      .notNull()
      .references(() => holds.id, { onDelete: 'cascade' }),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    ticketTypeId: uuid('ticket_type_id')
      .notNull()
      .references(() => ticketTypes.id, { onDelete: 'restrict' }),
    priceStageId: uuid('price_stage_id').references(() => priceStages.id, { onDelete: 'restrict' }),
    quantity: integer('quantity').notNull(),
    unitPriceCents: cents('unit_price_cents').notNull(),
  },
  (t) => [primaryKey({ columns: [t.holdId, t.ticketTypeId] }), check('hold_items_qty', sql`${t.quantity} > 0`)],
);

export const orders = pgTable(
  'orders',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'restrict' }),
    buyerUserId: uuid('buyer_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    holdId: uuid('hold_id').references(() => holds.id, { onDelete: 'set null' }),
    status: orderStatus('status').notNull().default('pending_payment'),
    currency: currency('currency').notNull(),
    subtotalCents: cents('subtotal_cents').notNull(),
    feeCents: cents('fee_cents').notNull().default(0),
    totalCents: cents('total_cents').notNull(),
    /** Comisión de Lintick sobre esta venta; la productora cobra subtotal − comisión. */
    commissionBps: integer('commission_bps').notNull().default(0),
    commissionCents: cents('commission_cents').notNull().default(0),
    idempotencyKey: text('idempotency_key').notNull(),
    /** Preferencia de Checkout Pro creada para esta orden. */
    providerPreferenceId: text('provider_preference_id'),
    paidAt: ts('paid_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('orders_idempotency_uq').on(t.buyerUserId, t.idempotencyKey),
    index('orders_org_idx').on(t.organizationId, t.createdAt),
    check('orders_total', sql`${t.totalCents} = ${t.subtotalCents} + ${t.feeCents} AND ${t.totalCents} >= 0`),
    check('orders_commission', sql`${t.commissionCents} >= 0 AND ${t.commissionCents} <= ${t.subtotalCents} AND ${t.commissionBps} BETWEEN 0 AND 3000`),
  ],
);

export const tickets = pgTable(
  'tickets',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'restrict' }),
    ticketTypeId: uuid('ticket_type_id')
      .notNull()
      .references(() => ticketTypes.id, { onDelete: 'restrict' }),
    orderId: uuid('order_id').references(() => orders.id, { onDelete: 'restrict' }),
    ownerUserId: uuid('owner_user_id').references(() => users.id, { onDelete: 'restrict' }),
    /** Titular nominal (puede no tener cuenta todavía, p. ej. cortesía enviada por email). */
    holderName: text('holder_name').notNull(),
    holderEmail: text('holder_email').notNull(),
    /** DNI del titular: nunca en claro. HMAC-SHA256 con clave del servidor y pimienta por organización. */
    holderDocHmac: text('holder_doc_hmac'),
    /** Últimos 3 dígitos, para la verificación visual en la puerta. */
    holderDocLast3: text('holder_doc_last3'),
    /** assigned: tiene cuenta titular; pending_claim: emitido a un email que todavía no lo reclamó. */
    assignmentStatus: text('assignment_status', { enum: ['assigned', 'pending_claim'] }).notNull().default('assigned'),
    status: ticketStatus('status').notNull().default('valid'),
    /** Versión del QR: se incrementa al regenerar el QR; el anterior deja de validar. */
    qrVersion: integer('qr_version').notNull().default(1),
    previousTicketId: uuid('previous_ticket_id'),
    priceCents: cents('price_cents').notNull(),
    currency: currency('currency').notNull(),
    issuedAt: ts('issued_at').notNull().defaultNow(),
    usedAt: ts('used_at'),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('tickets_owner_idx').on(t.ownerUserId),
    index('tickets_event_idx').on(t.eventId, t.status),
    index('tickets_holder_email_idx').on(sql`lower(${t.holderEmail})`),
    // Un ticket anulado tiene, como mucho, un sucesor.
    uniqueIndex('tickets_previous_uq').on(t.previousTicketId),
    index('tickets_holder_doc_idx').on(t.eventId, t.holderDocHmac),
    check('tickets_doc_last3', sql`${t.holderDocLast3} IS NULL OR ${t.holderDocLast3} ~ '^[0-9]{3}$'`),
    check('tickets_claim_owner', sql`${t.assignmentStatus} <> 'pending_claim' OR ${t.ownerUserId} IS NULL`),
  ],
);

/** Historial inmutable de cada ticket (emisión, check-in, transferencia, anulación…). */
export const ticketEvents = pgTable(
  'ticket_events',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    ticketId: uuid('ticket_id')
      .notNull()
      .references(() => tickets.id, { onDelete: 'restrict' }),
    type: text('type').notNull(),
    actorUserId: uuid('actor_user_id'),
    data: jsonb('data').notNull().default({}),
    occurredAt: ts('occurred_at').notNull().defaultNow(),
    /** Cadena de hashes por organización: la completa un trigger de la base, nunca la app. */
    seq: bigint('seq', { mode: 'number' }),
    prevHash: text('prev_hash'),
    hash: text('hash'),
  },
  (t) => [index('ticket_events_ticket_idx').on(t.ticketId, t.occurredAt), uniqueIndex('ticket_events_chain_uq').on(t.organizationId, t.seq)],
);

/** Auditoría de acciones administrativas y financieras. Solo inserción. */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    actorUserId: uuid('actor_user_id'),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    data: jsonb('data').notNull().default({}),
    ip: text('ip'),
    occurredAt: ts('occurred_at').notNull().defaultNow(),
    seq: bigint('seq', { mode: 'number' }),
    prevHash: text('prev_hash'),
    hash: text('hash'),
  },
  (t) => [index('audit_logs_org_idx').on(t.organizationId, t.occurredAt), uniqueIndex('audit_logs_chain_uq').on(t.organizationId, t.seq)],
);

// ───────────────────────────── Identidad: verificación y recuperación (global) ─────────────────────────────

/** Tokens de un solo uso. Sólo se guarda el SHA-256 del token. */
export const emailVerifications = pgTable(
  'email_verifications',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    /** Contraseña elegida en ESE registro: se aplica sólo al confirmar, y la confirmación exige conocerla. */
    pendingPasswordHash: text('pending_password_hash').notNull(),
    pendingFullName: text('pending_full_name').notNull(),
    expiresAt: ts('expires_at').notNull(),
    usedAt: ts('used_at'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('email_verifications_token_uq').on(t.tokenHash), index('email_verifications_user_idx').on(t.userId)],
);

export const passwordResets = pgTable(
  'password_resets',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: ts('expires_at').notNull(),
    usedAt: ts('used_at'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('password_resets_token_uq').on(t.tokenHash), index('password_resets_user_idx').on(t.userId)],
);

// ───────────────────────────── Reclamo de entradas emitidas a un email ─────────────────────────────

export const ticketClaims = pgTable(
  'ticket_claims',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    ticketId: uuid('ticket_id')
      .notNull()
      .references(() => tickets.id, { onDelete: 'cascade' }),
    emailLower: text('email_lower').notNull(),
    expiresAt: ts('expires_at').notNull(),
    claimedBy: uuid('claimed_by').references(() => users.id, { onDelete: 'set null' }),
    claimedAt: ts('claimed_at'),
    createdAt: createdAt(),
  },
  (t) => [
    // Un reclamo abierto por ticket.
    uniqueIndex('ticket_claims_open_uq').on(t.ticketId).where(sql`${t.claimedAt} IS NULL`),
    index('ticket_claims_email_idx').on(t.emailLower),
  ],
);

// ───────────────────────────── Personal de acceso asignado por evento y turno ─────────────────────────────

export const staffAssignments = pgTable(
  'staff_assignments',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    validFrom: ts('valid_from').notNull(),
    validUntil: ts('valid_until').notNull(),
    createdBy: uuid('created_by'),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('staff_assignments_uq').on(t.eventId, t.userId),
    index('staff_assignments_user_idx').on(t.userId),
    check('staff_assignments_window', sql`${t.validUntil} > ${t.validFrom}`),
  ],
);

// ───────────────────────────── Imágenes de eventos ─────────────────────────────

/**
 * Imágenes del evento guardadas en la base (re-codificadas en el navegador, sin metadatos).
 * Se sirven con caché larga e inmutable: una imagen nunca cambia; reemplazarla crea otra fila.
 */
export const eventMedia = pgTable(
  'event_media',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['cover', 'gallery'] }).notNull(),
    position: integer('position').notNull().default(0),
    contentType: text('content_type', { enum: ['image/jpeg', 'image/png', 'image/webp'] }).notNull(),
    bytes: bytea('bytes').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    sha256: text('sha256').notNull(),
    createdBy: uuid('created_by'),
    createdAt: createdAt(),
  },
  (t) => [
    index('event_media_event_idx').on(t.eventId, t.kind, t.position),
    check('event_media_size', sql`${t.sizeBytes} > 0 AND ${t.sizeBytes} <= 3145728`),
  ],
);

/**
 * Cuenta de cobro de la productora (Mercado Pago, conectada con OAuth).
 * Los tokens se guardan CIFRADOS (AES-256-GCM, clave fuera de la base): una copia de la base no alcanza para cobrar.
 */
export const paymentAccounts = pgTable(
  'payment_accounts',
  {
    organizationId: uuid('organization_id')
      .primaryKey()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    provider: text('provider', { enum: ['mercadopago'] }).notNull().default('mercadopago'),
    status: text('status', { enum: ['connected', 'revoked', 'error'] }).notNull().default('connected'),
    /** user_id de Mercado Pago del vendedor (para reconocer sus notificaciones). */
    providerUserId: text('provider_user_id').notNull(),
    accessTokenEnc: text('access_token_enc').notNull(),
    refreshTokenEnc: text('refresh_token_enc'),
    publicKey: text('public_key'),
    scope: text('scope'),
    /** false = credenciales de prueba (cuentas de test de Mercado Pago). */
    liveMode: boolean('live_mode').notNull().default(true),
    expiresAt: ts('expires_at'),
    connectedBy: uuid('connected_by').references(() => users.id, { onDelete: 'set null' }),
    lastError: text('last_error'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('payment_accounts_provider_user_uq').on(t.provider, t.providerUserId)],
);

/** Intentos de conexión OAuth en curso (el "state" viaja a Mercado Pago y vuelve). Vencen en 15 minutos. */
export const paymentOauthStates = pgTable('payment_oauth_states', {
  stateHash: text('state_hash').primaryKey(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: ts('expires_at').notNull(),
  createdAt: createdAt(),
});

/** Cada pago informado por el proveedor, tal como lo confirmó su API (nunca lo que dice la notificación). */
export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'restrict' }),
    provider: text('provider', { enum: ['mercadopago'] }).notNull().default('mercadopago'),
    providerPaymentId: text('provider_payment_id').notNull(),
    status: text('status').notNull(),
    statusDetail: text('status_detail'),
    amountCents: cents('amount_cents').notNull(),
    currency: currency('currency').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('payments_provider_uq').on(t.provider, t.providerPaymentId), index('payments_order_idx').on(t.orderId)],
);
