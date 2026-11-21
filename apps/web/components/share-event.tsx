'use client';

import { useState } from 'react';

/**
 * Compartir el evento: en el celular abre el menú nativo (WhatsApp, Instagram, Telegram…);
 * en la computadora muestra WhatsApp, Facebook, X y "Copiar enlace".
 */
export function ShareEvent({ url, title, text, className = '' }: { url: string; title: string; text?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const msg = text ?? `${title} — entradas en Lintick`;

  async function share() {
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
    if (nav.share && /android|iphone|ipad|mobile/i.test(navigator.userAgent)) {
      try {
        await nav.share({ title, text: msg, url });
        return;
      } catch {
        /* cancelado: no pasa nada */
        return;
      }
    }
    setOpen((v) => !v);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  const enc = encodeURIComponent;
  const links = [
    { label: 'WhatsApp', href: `https://wa.me/?text=${enc(`${msg} ${url}`)}` },
    { label: 'Facebook', href: `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}` },
    { label: 'X (Twitter)', href: `https://twitter.com/intent/tweet?text=${enc(msg)}&url=${enc(url)}` },
  ];
  return (
    <div className={`relative ${className}`}>
      <button type="button" onClick={share} aria-expanded={open} className="btn btn-ghost h-10 gap-2 px-4 text-sm">
        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 3v12M8 7l4-4 4 4" />
          <path d="M7 10H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2h-1" />
        </svg>
        Compartir
      </button>
      {open ? (
        <div className="absolute right-0 z-30 mt-2 w-60 rounded-xl bg-paper p-1.5 shadow-[0_12px_32px_-12px_rgb(23_20_17/0.4)]">
          {links.map((l) => (
            <a key={l.label} href={l.href} target="_blank" rel="noreferrer" className="block rounded-lg px-3 py-2 text-sm hover:bg-ink/5" onClick={() => setOpen(false)}>
              {l.label}
            </a>
          ))}
          <button type="button" onClick={copy} className="block w-full rounded-lg px-3 py-2 text-left text-sm font-semibold hover:bg-ink/5">
            {copied ? '¡Enlace copiado!' : 'Copiar enlace'}
          </button>
          <p className="px-3 pb-1 pt-1 text-xs text-muted">Para Instagram: copiá el enlace y pegalo en la historia (sticker "Enlace") o en tu bio.</p>
        </div>
      ) : null}
    </div>
  );
}
