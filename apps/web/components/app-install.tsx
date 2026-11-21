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

/** Cómo se instala en este teléfono (en iPhone no hay instalación de un toque: Apple no lo permite a ninguna web). */
type Platform = 'android' | 'ios-safari-26' | 'ios-safari' | 'ios-chrome' | 'ios-inapp' | null;

function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  const ios = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (!ios) return null;
  if (/Instagram|FBAN|FBAV|FB_IAB|Line\/|TikTok|musical_ly|Snapchat|Twitter/i.test(ua)) return 'ios-inapp';
  if (/CriOS|EdgiOS/i.test(ua)) return 'ios-chrome';
  if (/FxiOS/i.test(ua)) return 'ios-chrome';
  // Safari de iOS 26 en adelante: "Compartir" está dentro del menú "•••" de la barra de abajo.
  const v = ua.match(/OS (\d+)_/i);
  return v && Number(v[1]) >= 26 ? 'ios-safari-26' : 'ios-safari';
}

const ShareIcon = ({ className = '' }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 3v12M8 7l4-4 4 4" />
    <path d="M7 10H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2h-1" />
  </svg>
);
const AddIcon = ({ className = '' }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden>
    <rect x="4" y="4" width="16" height="16" rx="4" />
    <path d="M12 8.5v7M8.5 12h7" />
  </svg>
);
const DotsIcon = ({ className = '' }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
    <circle cx="5.5" cy="12" r="1.9" /><circle cx="12" cy="12" r="1.9" /><circle cx="18.5" cy="12" r="1.9" />
  </svg>
);

function Step({ n, icon, children }: { n: number; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3 rounded-[14px] bg-surface p-3">
      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-ink text-sm font-bold text-paper">{n}</span>
      <span className="min-w-0 flex-1 text-[15px] leading-snug">{children}</span>
      <span className="grid size-10 shrink-0 place-items-center rounded-[10px] border border-line bg-paper text-[#0a84ff]">{icon}</span>
    </li>
  );
}

/** Guía para agregar Lintick a la pantalla de inicio del iPhone, con una flecha que señala el botón real. */
function IosGuide({ platform, onClose }: { platform: Exclude<Platform, 'android' | null>; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Dónde está el botón a tocar: abajo al centro (Safari clásico), abajo a la derecha (Safari 26), arriba a la derecha (Chrome).
  const arrow = platform === 'ios-safari' ? 'bottom-center' : platform === 'ios-safari-26' ? 'bottom-right' : platform === 'ios-chrome' ? 'top-right' : null;

  return (
    <div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true" aria-labelledby="ios-guide-title">
      <button type="button" aria-label="Cerrar" className="absolute inset-0 bg-ink/55 backdrop-blur-[2px]" onClick={onClose} />
      {arrow === 'top-right' ? (
        <div className="pointer-events-none absolute right-5 top-2 flex flex-col items-center text-paper motion-safe:animate-bounce">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 20V5M6 11l6-6 6 6" /></svg>
          <span className="mt-1 rounded-full bg-paper px-2 py-0.5 text-xs font-bold text-ink">Acá</span>
        </div>
      ) : null}
      <div className="absolute inset-x-0 bottom-0 mx-auto max-w-md rounded-t-[24px] bg-paper px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-4 shadow-2xl">
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line" />
        <div className="flex items-start gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/app/icon-192.png" alt="" width={48} height={48} className="size-12 shrink-0 rounded-[13px]" />
          <div className="min-w-0 flex-1">
            <h2 id="ios-guide-title" className="text-lg font-bold leading-tight">Agregá Lintick a tu iPhone</h2>
            <p className="text-sm text-muted">Queda como una app más: tus entradas a un toque y sin señal.</p>
          </div>
          <button type="button" onClick={onClose} className="-mr-1 grid size-9 place-items-center rounded-full text-muted hover:bg-surface" aria-label="Cerrar">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>

        {platform === 'ios-inapp' ? (
          <div className="mt-4 space-y-3">
            <p className="text-[15px]">Estás dentro de otra app (Instagram, Facebook…). Desde acá el iPhone no deja agregarla: abrí Lintick en <strong>Safari</strong>.</p>
            <ol className="space-y-2">
              <Step n={1} icon={<DotsIcon className="size-6" />}>Tocá <strong>•••</strong> arriba a la derecha</Step>
              <Step n={2} icon={<span className="text-xs font-bold">Safari</span>}>Elegí <strong>Abrir en el navegador</strong></Step>
            </ol>
            <button
              type="button"
              className="btn btn-ink h-11 w-full"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(location.href);
                  setCopied(true);
                } catch {
                  setCopied(false);
                }
              }}
            >
              {copied ? 'Enlace copiado: pegalo en Safari' : 'Copiar el enlace'}
            </button>
          </div>
        ) : (
          <ol className="mt-4 space-y-2">
            {platform === 'ios-safari-26' ? (
              <>
                <Step n={1} icon={<DotsIcon className="size-6" />}>Tocá <strong>•••</strong> abajo a la derecha</Step>
                <Step n={2} icon={<ShareIcon className="size-6" />}>Tocá <strong>Compartir</strong></Step>
                <Step n={3} icon={<AddIcon className="size-6" />}>Elegí <strong>Agregar a inicio</strong> (si no lo ves, deslizá hacia abajo y tocá “Ver más”)</Step>
              </>
            ) : (
              <>
                <Step n={1} icon={<ShareIcon className="size-6" />}>Tocá <strong>Compartir</strong> {platform === 'ios-chrome' ? 'arriba, en la barra de la dirección' : 'en la barra de abajo'}</Step>
                <Step n={2} icon={<AddIcon className="size-6" />}>Elegí <strong>Agregar a inicio</strong> (deslizá hacia abajo si no lo ves)</Step>
              </>
            )}
            <Step n={platform === 'ios-safari-26' ? 4 : 3} icon={<svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}>Confirmá con <strong>Agregar</strong>. ¡Listo!</Step>
          </ol>
        )}
        <p className="mt-3 text-center text-xs text-muted">Apple no permite instalar apps web con un solo toque: son estos pasos una única vez.</p>
      </div>
      {arrow === 'bottom-center' || arrow === 'bottom-right' ? (
        <div className={`pointer-events-none absolute bottom-1 flex flex-col items-center text-paper motion-safe:animate-bounce ${arrow === 'bottom-center' ? 'left-1/2 -translate-x-1/2' : 'right-5'}`}>
          <span className="mb-1 rounded-full bg-accent px-2 py-0.5 text-xs font-bold text-white shadow">Tocá acá abajo</span>
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#d23a1f" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 4v15M6 13l6 6 6-6" /></svg>
        </div>
      ) : null}
    </div>
  );
}

/**
 * "Instalar la app": en Android/Chrome abre el aviso nativo (un toque). En iPhone, Apple no deja que una web se
 * instale sola: se abre una guía visual con los pasos de ese navegador y una flecha al botón. No aparece si ya está instalada.
 */
export function InstallApp({ className = '' }: { className?: string }) {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [platform, setPlatform] = useState<Platform>(null);
  const [installed, setInstalled] = useState(true);
  const [guide, setGuide] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setInstalled(standalone);
    setPlatform(detectPlatform());
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPrompt);
      setPlatform('android');
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (installed || (!prompt && (platform === null || platform === 'android'))) return null;

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
            } else setGuide(true);
          }}
        >
          Instalar
        </button>
      </div>
      {guide && platform && platform !== 'android' ? <IosGuide platform={platform} onClose={() => setGuide(false)} /> : null}
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
