import type { Metadata, Viewport } from 'next';
import { Bricolage_Grotesque, Caveat, Geist } from 'next/font/google';
import './globals.css';
import { ServiceWorkerRegister } from '@/components/app-install';

const bricolage = Bricolage_Grotesque({ subsets: ['latin'], variable: '--font-bricolage', display: 'swap' });
const geist = Geist({ subsets: ['latin'], variable: '--font-geist', display: 'swap' });
/** Letra manuscrita sólo para las notas al margen de la página de inicio. */
const caveat = Caveat({ subsets: ['latin'], weight: ['600'], variable: '--font-caveat', display: 'swap' });

export const metadata: Metadata = {
  // Base de las URLs absolutas de Open Graph (vista previa al compartir en WhatsApp y redes).
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://lintick.com'),
  title: { default: 'Lintick — Entradas para lo que pasa', template: '%s · Lintick' },
  description: 'Descubrí recitales, fiestas, festivales y obras en Argentina. Comprá tus entradas en Lintick.',
  robots: { index: false, follow: false },
  icons: { icon: [{ url: '/app/favicon-32.png', sizes: '32x32', type: 'image/png' }], apple: '/app/apple-touch-icon.png' },
  appleWebApp: { capable: true, title: 'Lintick', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  themeColor: '#f4efe6',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-AR" className={`${bricolage.variable} ${geist.variable} ${caveat.variable}`}>
      <body className="flex min-h-dvh flex-col">
        <a href="#contenido" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-ink focus:px-4 focus:py-2 focus:text-paper">
          Saltar al contenido
        </a>
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
