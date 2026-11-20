import Link from 'next/link';

/**
 * Posición de cada ícono dibujado en el banner, en % de cada recorte (medida sobre la imagen):
 * d = escritorio (0,112 · 1672×588), m = celular (30,105 · 1230×670). Así la zona táctil queda
 * exactamente sobre el ícono en los dos tamaños.
 */
const HOTSPOTS = [
  { href: '/mis-entradas', label: 'Entradas: ver mis entradas', d: [5.08, 77.04, 7.48, 19.56], m: [4.47, 68.66, 10.16, 17.16] },
  { href: '/eventos', label: 'Eventos: ver todos los eventos', d: [15.67, 77.04, 7.48, 19.56], m: [18.86, 68.66, 10.16, 17.16] },
  { href: '/eventos?category=festival', label: 'Experiencias: ver festivales', d: [26.32, 77.04, 10.17, 19.56], m: [33.33, 68.66, 13.82, 17.16] },
] as const;

const vars = (p: readonly number[], k: 'd' | 'm') =>
  ({ [`--${k}-l`]: `${p[0]}%`, [`--${k}-t`]: `${p[1]}%`, [`--${k}-w`]: `${p[2]}%`, [`--${k}-h`]: `${p[3]}%` }) as Record<string, string>;

/**
 * Banner principal (debajo del menú). Dos recortes de la misma pieza: celular más alto (el texto
 * se lee), escritorio ancho y bajo. Todo el banner lleva a los eventos; los tres íconos dibujados
 * son enlaces propios, con zona táctil exacta sobre cada uno.
 */
export function HomeBanner() {
  return (
    <section aria-label="Lintick: tus eventos, en un solo lugar" className="mx-auto max-w-[1440px] px-4 pt-4 sm:px-6 sm:pt-6">
      <div className="banner-frame group">
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
        {/* Enlace general (todo el banner): queda debajo de los íconos. */}
        <Link href="/eventos" className="banner-cover" aria-label="Ver eventos" />
        <nav aria-label="Accesos del banner">
          {HOTSPOTS.map((h) => (
            <Link key={h.href} href={h.href} aria-label={h.label} className="banner-hotspot" style={{ ...vars(h.d, 'd'), ...vars(h.m, 'm') }} />
          ))}
        </nav>
      </div>
    </section>
  );
}
