'use client';

import { useEffect } from 'react';

/**
 * Marca con data-in="true" cada elemento [data-reveal] cuando entra en pantalla (una sola vez).
 * Las animaciones de las demostraciones (barrido del escáner, gráfico que se dibuja, números) arrancan ahí:
 * se ven cuando la persona llega a la sección, no en bucle infinito.
 */
export function RevealObserver() {
  useEffect(() => {
    // Recién ahora (con JavaScript andando) se esconden las piezas que esperan su entrada.
    document.documentElement.dataset.anim = '1';
    const els = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'));
    if (!('IntersectionObserver' in window)) {
      els.forEach((el) => (el.dataset.in = 'true'));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          (e.target as HTMLElement).dataset.in = 'true';
          io.unobserve(e.target);
        }
      },
      { threshold: 0.35, rootMargin: '0px 0px -8% 0px' },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  return null;
}
