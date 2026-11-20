import Link from 'next/link';

/**
 * Banner principal (debajo del menú). Dos recortes de la misma pieza, sin la fila de íconos:
 * escritorio ancho y bajo (0,96 · 1672×470), celular más cerrado sobre el texto (30,96 · 1230×470).
 * Es la imagen más grande de la página: carga con prioridad y declara sus medidas.
 */
export function HomeBanner() {
  return (
    <section aria-label="Lintick: tus eventos, en un solo lugar" className="mx-auto max-w-[1440px] px-4 pt-4 sm:px-6 sm:pt-6">
      <Link href="/eventos" className="banner-frame block" aria-label="Lintick: tus eventos, en un solo lugar. Ver eventos.">
        <picture>
          <source media="(max-width: 640px)" srcSet="/banner/inicio-movil-600.webp 600w, /banner/inicio-movil-900.webp 900w" sizes="100vw" width={1230} height={470} />
          <source srcSet="/banner/inicio-1100.webp 1100w, /banner/inicio-1672.webp 1672w" sizes="(min-width: 1440px) 1392px, 100vw" width={1672} height={470} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/banner/inicio-1672.webp" alt="" width={1672} height={470} fetchPriority="high" decoding="async" className="block h-auto w-full" />
        </picture>
      </Link>
    </section>
  );
}
