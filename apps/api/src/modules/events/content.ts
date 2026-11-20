import { asc, eventMedia, inArray, type Tx } from '@venti/db';
import { z } from 'zod';

/** Catálogo de "Qué hay en la fiesta". Las productoras pueden sumar servicios propios en extraAmenities. */
export const AMENITIES = [
  'bar',
  'food',
  'food_trucks',
  'cloakroom',
  'lockers',
  'parking',
  'bike_parking',
  'vip_area',
  'smoking_area',
  'chill_zone',
  'free_water',
  'atm',
  'card_payments',
  'cashless',
  'merch',
  'camping',
  'showers',
  'accessible',
  'first_aid',
  'security',
  'transport',
] as const;

export const LINEUP_ROLES = ['headliner', 'guest', 'support', 'resident', 'dj', 'host'] as const;

const LINK_HOSTS: Record<string, RegExp> = {
  instagram: /(^|\.)instagram\.com$/,
  tiktok: /(^|\.)tiktok\.com$/,
  spotify: /(^|\.)spotify\.com$/,
  youtube: /(^|\.)(youtube\.com|youtu\.be)$/,
  website: /.+/,
};

/** Enlace https del sitio esperado (evita que un "Instagram" lleve a cualquier lado). */
const linkFor = (kind: keyof typeof LINK_HOSTS) =>
  z
    .string()
    .trim()
    .url()
    .max(300)
    .refine((v) => {
      try {
        const u = new URL(v);
        return u.protocol === 'https:' && LINK_HOSTS[kind]!.test(u.hostname.toLowerCase());
      } catch {
        return false;
      }
    }, `Tiene que ser un enlace https${kind === 'website' ? '' : ` de ${kind}`}.`);

/** Enlace https a cualquier sitio. */
const httpsUrl = z
  .string()
  .trim()
  .url()
  .max(300)
  .refine((v) => v.startsWith('https://'), 'Tiene que empezar con https://');

export const LineupItemSchema = z.object({
  name: z.string().trim().min(1).max(80),
  role: z.enum(LINEUP_ROLES).default('guest'),
  startsAt: z.coerce
    .date()
    .nullable()
    .default(null)
    .transform((d) => (d ? d.toISOString() : null)),
  stage: z.string().trim().max(60).nullable().default(null),
  bio: z.string().trim().max(600).default(''),
  link: httpsUrl.nullable().default(null),
  imageId: z.string().uuid().nullable().default(null),
});

/** Sólo videos de YouTube o Vimeo (se muestran incrustados, sin cookies de seguimiento en el caso de YouTube). */
const VIDEO_HOSTS = /(^|\.)(youtube\.com|youtu\.be|vimeo\.com)$/;
export const VideoSchema = z.object({
  url: httpsUrl.refine((v) => {
    try {
      return VIDEO_HOSTS.test(new URL(v).hostname.toLowerCase());
    } catch {
      return false;
    }
  }, 'Pegá un enlace de YouTube o Vimeo.'),
  title: z.string().trim().max(100).default(''),
});

export const SPONSOR_TIERS = ['sponsor', 'partner', 'brand', 'producer', 'media'] as const;
export const SponsorSchema = z.object({
  name: z.string().trim().min(1).max(80),
  tier: z.enum(SPONSOR_TIERS).default('sponsor'),
  url: httpsUrl.nullable().default(null),
  logoId: z.string().uuid().nullable().default(null),
});

export const FaqSchema = z.object({ q: z.string().trim().min(3).max(200), a: z.string().trim().min(1).max(2000) });

/** Secciones de la página pública que se pueden ordenar u ocultar. */
export const PAGE_SECTIONS = ['about', 'lineup', 'videos', 'gallery', 'amenities', 'sponsors', 'faq', 'policies', 'contact'] as const;

/** Campos de contenido editables (todos opcionales: se usan en crear y en editar). */
export const EventContentFields = {
  doorsOpenAt: z.coerce.date().nullable(),
  minAge: z.number().int().min(0).max(25).nullable(),
  dressCode: z.string().trim().max(120).nullable(),
  lineup: z.array(LineupItemSchema).max(60),
  amenities: z
    .array(z.enum(AMENITIES))
    .max(AMENITIES.length)
    .transform((a) => [...new Set(a)]),
  extraAmenities: z
    .array(z.string().trim().min(2).max(40))
    .max(10)
    .transform((a) => [...new Set(a)]),
  links: z
    .object({ instagram: linkFor('instagram'), tiktok: linkFor('tiktok'), spotify: linkFor('spotify'), youtube: linkFor('youtube'), website: linkFor('website') })
    .partial()
    .strict(),
  policies: z.string().max(5000),
  summary: z.string().trim().max(200),
  videos: z.array(VideoSchema).max(6),
  sponsors: z.array(SponsorSchema).max(30),
  faq: z.array(FaqSchema).max(30),
  contact: z
    .object({
      email: z.string().trim().toLowerCase().email().max(254),
      whatsapp: z.string().trim().regex(/^\+?[0-9 ()-]{6,20}$/, 'WhatsApp: sólo números (con código de área).'),
    })
    .partial()
    .strict(),
  seo: z.object({ title: z.string().trim().max(70), description: z.string().trim().max(170) }).partial().strict(),
  pageSections: z
    .array(z.object({ key: z.enum(PAGE_SECTIONS), visible: z.boolean() }))
    .max(PAGE_SECTIONS.length)
    .refine((a) => new Set(a.map((x) => x.key)).size === a.length, 'Hay secciones repetidas.'),
};

/** Ids de imágenes (logos de patrocinadores, fotos de artistas) que usa un cambio de contenido. */
export function referencedAssetIds(b: { lineup?: { imageId?: string | null }[]; sponsors?: { logoId?: string | null }[] }): string[] {
  const ids = [...(b.lineup ?? []).map((l) => l.imageId), ...(b.sponsors ?? []).map((s) => s.logoId)].filter((x): x is string => typeof x === 'string');
  return [...new Set(ids)];
}

export const MediaDto = z.object({ id: z.string().uuid(), url: z.string(), width: z.number(), height: z.number() });
export type MediaView = z.infer<typeof MediaDto>;

export const EventContentDto = z.object({
  doorsOpenAt: z.date().nullable(),
  minAge: z.number().nullable(),
  dressCode: z.string().nullable(),
  lineup: z.array(
    z.object({ name: z.string(), role: z.enum(LINEUP_ROLES), startsAt: z.string().nullable(), stage: z.string().nullable(), bio: z.string(), link: z.string().nullable(), imageId: z.string().nullable() }),
  ),
  amenities: z.array(z.string()),
  extraAmenities: z.array(z.string()),
  links: z.record(z.string(), z.string()),
  policies: z.string(),
  summary: z.string(),
  videos: z.array(z.object({ url: z.string(), title: z.string() })),
  sponsors: z.array(z.object({ name: z.string(), tier: z.enum(SPONSOR_TIERS), url: z.string().nullable(), logoId: z.string().nullable() })),
  faq: z.array(z.object({ q: z.string(), a: z.string() })),
  contact: z.object({ email: z.string().optional(), whatsapp: z.string().optional() }),
  seo: z.object({ title: z.string().optional(), description: z.string().optional() }),
  pageSections: z.array(z.object({ key: z.string(), visible: z.boolean() })),
  coverImage: MediaDto.nullable(),
  gallery: z.array(MediaDto),
});

/** URL de una imagen relativa a la API (la web la sirve bajo /api). */
export const mediaUrl = (id: string) => `/v1/media/${id}`;

/** Portada y galería de varios eventos, en una sola consulta y sin leer los bytes. */
export async function loadEventMedia(tx: Tx, eventIds: string[]) {
  const out = new Map<string, { cover: MediaView | null; gallery: MediaView[]; assets: Set<string> }>();
  for (const id of eventIds) out.set(id, { cover: null, gallery: [], assets: new Set() });
  if (eventIds.length === 0) return out;
  const rows = await tx
    .select({ id: eventMedia.id, eventId: eventMedia.eventId, kind: eventMedia.kind, width: eventMedia.width, height: eventMedia.height })
    .from(eventMedia)
    .where(inArray(eventMedia.eventId, eventIds))
    .orderBy(asc(eventMedia.position), asc(eventMedia.createdAt));
  for (const r of rows) {
    const view = { id: r.id, url: mediaUrl(r.id), width: r.width, height: r.height };
    const entry = out.get(r.eventId)!;
    if (r.kind === 'cover') entry.cover = view;
    else if (r.kind === 'asset') entry.assets.add(r.id);
    else entry.gallery.push(view);
  }
  return out;
}

type EventRow = {
  doorsOpenAt: Date | null;
  minAge: number | null;
  dressCode: string | null;
  lineup: { name: string; role: string; startsAt: string | null; stage: string | null; bio?: string; link?: string | null; imageId?: string | null }[];
  amenities: string[];
  extraAmenities: string[];
  links: { [k: string]: string | undefined } | object;
  policies: string;
  summary: string;
  videos: { url: string; title: string }[];
  sponsors: { name: string; tier: string; url: string | null; logoId: string | null }[];
  faq: { q: string; a: string }[];
  contact: { email?: string; whatsapp?: string } | object;
  seo: { title?: string; description?: string } | object;
  pageSections: { key: string; visible: boolean }[];
};

export function contentView(e: EventRow, media: { cover: MediaView | null; gallery: MediaView[]; assets?: Set<string> } | undefined): z.infer<typeof EventContentDto> {
  // Una imagen borrada no deja un logo o foto rota: la referencia se ignora.
  const asset = (id: string | null | undefined) => (id && media?.assets?.has(id) ? id : null);
  return {
    doorsOpenAt: e.doorsOpenAt,
    minAge: e.minAge,
    dressCode: e.dressCode,
    lineup: e.lineup.map((l) => ({ name: l.name, role: (LINEUP_ROLES as readonly string[]).includes(l.role) ? (l.role as (typeof LINEUP_ROLES)[number]) : 'guest', startsAt: l.startsAt, stage: l.stage, bio: l.bio ?? '', link: l.link ?? null, imageId: asset(l.imageId) })),
    amenities: e.amenities,
    extraAmenities: e.extraAmenities,
    links: Object.fromEntries(Object.entries(e.links as Record<string, unknown>).filter(([, v]) => typeof v === 'string')) as Record<string, string>,
    policies: e.policies,
    summary: e.summary,
    videos: e.videos,
    sponsors: e.sponsors.map((s) => ({ ...s, logoId: asset(s.logoId), tier: (SPONSOR_TIERS as readonly string[]).includes(s.tier) ? (s.tier as (typeof SPONSOR_TIERS)[number]) : 'sponsor' })),
    faq: e.faq,
    contact: e.contact,
    seo: e.seo,
    pageSections: e.pageSections,
    coverImage: media?.cover ?? null,
    gallery: media?.gallery ?? [],
  };
}
