'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type Img = { id: string; src: string; width?: number | null; height?: number | null };

/**
 * Galería como en las redes: grilla de miniaturas cuadradas y, al tocar, visor a pantalla completa
 * (fondo negro, foto entera, deslizar o flechas, contador, cerrar con ✕, Escape o deslizando hacia abajo).
 */
export function GalleryViewer({ images, title }: { images: Img[]; title: string }) {
  const [open, setOpen] = useState<number | null>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const n = images.length;
  const go = useCallback((d: number) => setOpen((i) => (i === null ? i : (i + d + n) % n)), [n]);

  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null);
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, go]);

  return (
    <>
      <ul className="grid grid-cols-3 gap-1 sm:gap-2">
        {images.map((img, i) => (
          <li key={img.id} className={i === 0 && n > 2 ? 'col-span-2 row-span-2' : ''}>
            <button type="button" onClick={() => setOpen(i)} className="block aspect-square h-full w-full overflow-hidden rounded-lg bg-ink/5" aria-label={`Ver foto ${i + 1} de ${n}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.src} alt={`Foto ${i + 1} de ${title}`} width={img.width ?? undefined} height={img.height ?? undefined} loading="lazy" decoding="async" className="h-full w-full object-cover transition-transform duration-500 hover:scale-[1.03]" />
            </button>
          </li>
        ))}
      </ul>

      {open !== null ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Foto ${open + 1} de ${n}`}
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black"
          onTouchStart={(e) => (touch.current = { x: e.touches[0]!.clientX, y: e.touches[0]!.clientY })}
          onTouchEnd={(e) => {
            const t = touch.current;
            touch.current = null;
            if (!t) return;
            const dx = e.changedTouches[0]!.clientX - t.x;
            const dy = e.changedTouches[0]!.clientY - t.y;
            if (Math.abs(dy) > 90 && Math.abs(dy) > Math.abs(dx)) setOpen(null);
            else if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img key={images[open]!.id} src={images[open]!.src} alt={`Foto ${open + 1} de ${title}`} className="max-h-[100dvh] max-w-full select-none object-contain" draggable={false} />
          <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/70 to-transparent px-4 pb-8 pt-[max(1rem,env(safe-area-inset-top))] text-white">
            <span className="text-sm font-semibold tabular-nums">{open + 1} / {n}</span>
          </div>
          <button type="button" onClick={() => setOpen(null)} aria-label="Cerrar" className="absolute right-3 top-[max(0.75rem,env(safe-area-inset-top))] grid size-11 place-items-center rounded-full bg-white/15 text-xl text-white backdrop-blur hover:bg-white/25">
            ✕
          </button>
          {n > 1 ? (
            <>
              <button type="button" onClick={() => go(-1)} aria-label="Foto anterior" className="absolute left-3 top-1/2 hidden size-12 -translate-y-1/2 place-items-center rounded-full bg-white/15 text-2xl text-white backdrop-blur hover:bg-white/25 sm:grid">‹</button>
              <button type="button" onClick={() => go(1)} aria-label="Foto siguiente" className="absolute right-3 top-1/2 hidden size-12 -translate-y-1/2 place-items-center rounded-full bg-white/15 text-2xl text-white backdrop-blur hover:bg-white/25 sm:grid">›</button>
              <div className="absolute inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] flex justify-center gap-1.5">
                {images.map((img, i) => (
                  <span key={img.id} className={`h-1.5 rounded-full transition-all ${i === open ? 'w-5 bg-white' : 'w-1.5 bg-white/40'}`} />
                ))}
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
