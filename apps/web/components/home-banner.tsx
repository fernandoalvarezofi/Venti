import Link from 'next/link';

/**
 * Banner principal (debajo del menú). Dos recortes de la misma pieza:
 * celular más alto (el texto se lee), escritorio ancho y bajo. Es la imagen más grande de la
 * página, así que carga con prioridad y declara sus medidas para que nada salte al cargar.
 */
export function HomeBanner() {
  return (
    <section aria-label="Lintick" className="mx-auto max-w-[1440px] px-4 pt-4 sm:px-6 sm:pt-6">
      <Link href="/eventos" className="banner-frame group block" aria-label="Lintick: tus eventos, en un solo lugar. Entradas, eventos y experiencias. Ver eventos.">
        <picture>
          <source media="(max-width: 640px)" srcSet="/banner/inicio-movil-600.webp 600w, /banner/inicio-movil-900.webp 900w" sizes="100vw" width={1230} height={670} />
          <source srcSet="/banner/inicio-1100.webp 1100w, /banner/inicio-1672.webp 1672w" sizes="(min-width: 1440px) 1392px, 100vw" width={1672} height={588} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/banner/inicio-1672.webp"
            alt=""
            width={1672}
            height={588}
            fetchPriority="high"
            decoding="async"
            className="block h-auto w-full transition-transform duration-[1200ms] ease-[var(--ease-out-quint)] group-hover:scale-[1.015]"
          />
        </picture>
      </Link>
    </section>
  );
}
