'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
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

/**
 * Detalles de app: aviso de "sin conexión", páginas clave guardadas de antemano y
 * barra de pestañas abajo cuando Lintick está instalada en el celular.
 */
export function AppChrome() {
  const [offline, setOffline] = useState(false);
  const path = usePathname() ?? '';

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    // Con conexión: guardar Mis entradas y Control de ingreso para tenerlas aunque nunca se hayan abierto.
    const warm = () => {
      try {
        if (sessionStorage.getItem('lintick:warm')) return;
        sessionStorage.setItem('lintick:warm', '1');
      } catch {
        /* sin almacenamiento: igual se intenta */
      }
      navigator.serviceWorker?.controller?.postMessage({ type: 'lintick:warm', urls: ['/mis-entradas', '/acceso'] });
    };
    if (navigator.onLine && 'serviceWorker' in navigator) navigator.serviceWorker.ready.then(() => setTimeout(warm, 2500)).catch(() => {});
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  return (
    <>
      {offline ? (
        <div role="status" className="fixed inset-x-0 top-0 z-[60] flex justify-center px-3 pt-[max(0.5rem,env(safe-area-inset-top))]">
          <p className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-paper shadow-lg">Sin conexión · estás viendo lo guardado en tu teléfono</p>
        </div>
      ) : null}
      {!path.startsWith('/business') ? <AppTabBar /> : null}
    </>
  );
}

const TABS = [
  { href: '/', label: 'Inicio', d: 'M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z' },
  { href: '/eventos', label: 'Explorar', d: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zm9 2-4-4' },
  { href: '/mis-entradas', label: 'Entradas', d: 'M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2 2 2 0 0 0 0 4 2 2 0 0 0 0 4 2 2 0 0 1-2 2H6a2 2 0 0 1-2-2 2 2 0 0 0 0-4 2 2 0 0 0 0-4z' },
  { href: '/acceso', label: 'Puerta', d: 'M4 8V5a1 1 0 0 1 1-1h3m8 0h3a1 1 0 0 1 1 1v3m0 8v3a1 1 0 0 1-1 1h-3m-8 0H5a1 1 0 0 1-1-1v-3M4 12h16' },
];

/** Barra de pestañas (sólo con la app instalada, en pantallas de celular; en el navegador no aparece). */
function AppTabBar() {
  const path = usePathname() ?? '';
  return (
    <nav aria-label="Secciones de la app" className="app-tabbar">
      {TABS.map((t) => {
        const active = t.href === '/' ? path === '/' : path === t.href || path.startsWith(`${t.href}/`);
        return (
          <Link key={t.href} href={t.href} aria-current={active ? 'page' : undefined} className={active ? 'is-active' : ''}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d={t.d} />
            </svg>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
