import type { MetadataRoute } from 'next';

/** Lintick instalable: se agrega a la pantalla de inicio y abre como app, sin barra del navegador. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Lintick — Entradas para lo que pasa',
    short_name: 'Lintick',
    description: 'Tus entradas con QR, aunque no tengas señal. Y el control de ingreso para productoras.',
    lang: 'es-AR',
    start_url: '/mis-entradas?app=1',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#f4efe6',
    theme_color: '#f4efe6',
    categories: ['entertainment', 'lifestyle', 'music'],
    icons: [
      { src: '/app/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/app/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/app/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Mis entradas', url: '/mis-entradas', icons: [{ src: '/app/icon-192.png', sizes: '192x192' }] },
      { name: 'Control de ingreso', url: '/acceso', icons: [{ src: '/app/icon-192.png', sizes: '192x192' }] },
    ],
  };
}
