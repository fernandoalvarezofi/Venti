import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Sin conexión' };
export const dynamic = 'force-static';

/** Se muestra cuando no hay internet y esa página todavía no se había abierto en este teléfono. */
export default function OfflinePage() {
  return (
    <main id="contenido" className="mx-auto grid min-h-dvh max-w-md place-content-center px-6 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/mascota/lintick-320.webp" alt="" width={140} height={140} className="mx-auto" />
      <h1 className="mt-6 font-display text-3xl font-extrabold tracking-[-0.03em]">Estás sin conexión</h1>
      <p className="mt-3 text-muted">Esta página todavía no estaba guardada en tu teléfono. Tus entradas sí: abrí “Mis entradas” y mostrá el QR en la puerta, funciona sin señal.</p>
      <div className="mt-6 flex flex-col gap-2">
        <Link href="/mis-entradas" className="btn btn-ink">
          Mis entradas
        </Link>
        <Link href="/acceso" className="btn btn-ghost">
          Control de ingreso
        </Link>
      </div>
    </main>
  );
}
