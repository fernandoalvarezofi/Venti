import type { MetadataRoute } from 'next';

const SITE = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://lintick.com').replace(/\/+$/, '');

/** Buscadores: sí a la parte pública (eventos, ayuda); no al panel, al control de ingreso ni a las cuentas. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/business', '/acceso', '/mis-entradas', '/compra', '/reserva', '/verificar', '/restablecer', '/api/'] }],
    sitemap: `${SITE}/sitemap.xml`,
  };
}
