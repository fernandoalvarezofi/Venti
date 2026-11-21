'use client';

import { useEffect, useState } from 'react';

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

/** Registra el modo sin internet (sólo en producción: en desarrollo cachear confunde). */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
      /* sin soporte o bloqueado: Lintick funciona igual con conexión */
    });
  }, []);
  return null;
}

/** Al cerrar sesión: borra del teléfono las páginas guardadas (tienen datos personales). */
export function forgetOfflinePages() {
  try {
    navigator.serviceWorker?.controller?.postMessage('lintick:logout');
  } catch {
    /* nada que borrar */
  }
}

/**
 * "Instalar la app": en Android/Chrome usa el aviso nativo; en iPhone explica cómo agregarla
 * (Safari no tiene botón para instalar). No aparece si ya está instalada.
 */
export function InstallApp({ className = '' }: { className?: string }) {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [ios, setIos] = useState(false);
  const [installed, setInstalled] = useState(true);
  const [help, setHelp] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setInstalled(standalone);
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent));
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPrompt);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (installed || (!prompt && !ios)) return null;

  return (
    <div className={`rounded-[16px] bg-surface p-4 ${className}`}>
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/app/icon-192.png" alt="" width={44} height={44} className="size-11 shrink-0 rounded-[12px]" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold leading-tight">Instalá Lintick en tu celular</p>
          <p className="text-sm text-muted">Tus entradas a un toque, aunque no tengas señal.</p>
        </div>
        <button
          type="button"
          className="btn btn-ink h-10 shrink-0 px-4 text-sm"
          onClick={async () => {
            if (prompt) {
              await prompt.prompt();
              const choice = await prompt.userChoice.catch(() => null);
              if (choice?.outcome === 'accepted') setInstalled(true);
              setPrompt(null);
            } else setHelp((h) => !h);
          }}
        >
          Instalar
        </button>
      </div>
      {help && ios ? (
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-ink-soft">
          <li>
            Tocá el botón <strong>Compartir</strong> (el cuadrado con la flecha) abajo en Safari.
          </li>
          <li>
            Elegí <strong>Agregar a inicio</strong> y confirmá con <strong>Agregar</strong>.
          </li>
        </ol>
      ) : null}
    </div>
  );
}
