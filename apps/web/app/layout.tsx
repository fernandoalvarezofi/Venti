import type { Metadata, Viewport } from 'next';
import { Bricolage_Grotesque, Geist } from 'next/font/google';
import './globals.css';

const bricolage = Bricolage_Grotesque({ subsets: ['latin'], variable: '--font-bricolage', display: 'swap' });
const geist = Geist({ subsets: ['latin'], variable: '--font-geist', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'Lintick — Entradas para lo que pasa', template: '%s · Lintick' },
  description: 'Descubrí recitales, fiestas, festivales y obras en Argentina. Comprá tus entradas en Lintick.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#f4efe6',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-AR" className={`${bricolage.variable} ${geist.variable}`}>
      <body className="flex min-h-dvh flex-col">
        <a href="#contenido" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-ink focus:px-4 focus:py-2 focus:text-paper">
          Saltar al contenido
        </a>
        {children}
      </body>
    </html>
  );
}
