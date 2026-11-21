import type { MetadataRoute } from 'next';
import { searchEvents } from '@/lib/api';

const SITE = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://lintick.com').replace(/\/+$/, '');
export const revalidate = 3600;

/** Mapa del sitio: páginas públicas + eventos publicados (para que aparezcan en Google). */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pages: MetadataRoute.Sitemap = ['', '/eventos', '/ayuda', '/terminos', '/privacidad'].map((p) => ({ url: `${SITE}${p}`, changeFrequency: 'daily', priority: p === '' ? 1 : 0.6 }));
  const res = await searchEvents({});
  const events = res.ok ? res.data.items : [];
  return [...pages, ...events.map((e) => ({ url: `${SITE}/eventos/${e.id}`, changeFrequency: 'daily' as const, priority: 0.8 }))];
}
