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

export const LineupItemSchema = z.object({
  name: z.string().trim().min(1).max(80),
  role: z.enum(LINEUP_ROLES).default('guest'),
  startsAt: z.coerce
    .date()
    .nullable()
    .default(null)
    .transform((d) => (d ? d.toISOString() : null)),
  stage: z.string().trim().max(60).nullable().default(null),
});

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
};

export const MediaDto = z.object({ id: z.string().uuid(), url: z.string(), width: z.number(), height: z.number() });
export type MediaView = z.infer<typeof MediaDto>;

export const EventContentDto = z.object({
  doorsOpenAt: z.date().nullable(),
  minAge: z.number().nullable(),
  dressCode: z.string().nullable(),
  lineup: z.array(z.object({ name: z.string(), role: z.enum(LINEUP_ROLES), startsAt: z.string().nullable(), stage: z.string().nullable() })),
  amenities: z.array(z.string()),
  extraAmenities: z.array(z.string()),
  links: z.record(z.string(), z.string()),
  policies: z.string(),
  coverImage: MediaDto.nullable(),
  gallery: z.array(MediaDto),
});

/** URL de una imagen relativa a la API (la web la sirve bajo /api). */
export const mediaUrl = (id: string) => `/v1/media/${id}`;

/** Portada y galería de varios eventos, en una sola consulta y sin leer los bytes. */
export async function loadEventMedia(tx: Tx, eventIds: string[]) {
  const out = new Map<string, { cover: MediaView | null; gallery: MediaView[] }>();
  for (const id of eventIds) out.set(id, { cover: null, gallery: [] });
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
    else entry.gallery.push(view);
  }
  return out;
}

type EventRow = {
  doorsOpenAt: Date | null;
  minAge: number | null;
  dressCode: string | null;
  lineup: { name: string; role: string; startsAt: string | null; stage: string | null }[];
  amenities: string[];
  extraAmenities: string[];
  links: { [k: string]: string | undefined } | object;
  policies: string;
};

export function contentView(e: EventRow, media: { cover: MediaView | null; gallery: MediaView[] } | undefined): z.infer<typeof EventContentDto> {
  return {
    doorsOpenAt: e.doorsOpenAt,
    minAge: e.minAge,
    dressCode: e.dressCode,
    lineup: e.lineup.map((l) => ({ name: l.name, role: (LINEUP_ROLES as readonly string[]).includes(l.role) ? (l.role as (typeof LINEUP_ROLES)[number]) : 'guest', startsAt: l.startsAt, stage: l.stage })),
    amenities: e.amenities,
    extraAmenities: e.extraAmenities,
    links: Object.fromEntries(Object.entries(e.links as Record<string, unknown>).filter(([, v]) => typeof v === 'string')) as Record<string, string>,
    policies: e.policies,
    coverImage: media?.cover ?? null,
    gallery: media?.gallery ?? [],
  };
}
