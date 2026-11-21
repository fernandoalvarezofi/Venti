'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { dateParts, ticketCode } from '@/lib/format';
import {
  downloadPack,
  fetchWithTimeout,
  loadPack,
  loadQueue,
  purgeExpired,
  savePack,
  saveQueue,
  validateOffline,
  wipeEvent,
  type AccessPack,
  type QueuedEntry,
} from '@/lib/offline-access';
import type { CheckinSummary, ScanResponse } from '@/lib/types';

/* Tipos mínimos de BarcodeDetector (Chrome/Android lo traen; Safari no: usamos jsQR). */
interface DetectedBarcode {
  rawValue: string;
}
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}
declare global {
  interface Window {
    BarcodeDetector?: { new (opts: { formats: string[] }): BarcodeDetectorLike; getSupportedFormats?: () => Promise<string[]> };
  }
}

type Outcome =
  | { kind: 'result'; data: ScanResponse; at: number; offline?: boolean }
  | { kind: 'network'; qr: string; at: number };

type CamState = 'starting' | 'on' | 'denied' | 'unavailable';

const TONE: Record<ScanResponse['result'], 'ok' | 'stop' | 'warn'> = {
  admitted: 'ok',
  already_used: 'stop',
  invalid_signature: 'stop',
  not_valid: 'stop',
  wrong_event: 'warn',
  not_found: 'stop',
  outdated_qr: 'warn',
  malformed: 'warn',
};

const TITLE: Record<ScanResponse['result'], string> = {
  admitted: 'Adelante',
  already_used: 'Ya ingresó',
  invalid_signature: 'QR falso',
  not_valid: 'Entrada anulada',
  wrong_event: 'Otro evento',
  not_found: 'No existe',
  outdated_qr: 'QR viejo',
  malformed: 'No es una entrada',
};

function readLocal(key: string, fallback: string) {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}
function writeLocal(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* modo privado: no pasa nada */
  }
}

/** Un único contexto de audio: Safari (iPhone) sólo deja sonar después de un toque, así que se desbloquea una vez. */
let audioCtx: AudioContext | null = null;
function audio(): AudioContext | null {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    audioCtx ??= new Ctx();
    if (audioCtx.state === 'suspended') void audioCtx.resume();
    return audioCtx;
  } catch {
    return null;
  }
}

/** Pitido corto con Web Audio: agudo = pasa, dos graves = no pasa. Sin archivos de sonido. */
function beep(ok: boolean) {
  try {
    const ctx = audio();
    if (!ctx) throw new Error('sin audio');
    const notes = ok ? [[1320, 0, 0.12]] : [[220, 0, 0.16], [180, 0.2, 0.22]];
    for (const [freq, start, dur] of notes) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = ok ? 'sine' : 'square';
      o.frequency.value = freq!;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + start!);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + start! + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start! + dur!);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + start!);
      o.stop(ctx.currentTime + start! + dur! + 0.02);
    }
  } catch {
    /* sin audio */
  }
  navigator.vibrate?.(ok ? 80 : [120, 80, 120]);
}

export function Scanner({ orgId, eventId, title, venueName }: { orgId: string; eventId: string; title: string; venueName: string | null }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const busyRef = useRef(false);
  const lastRef = useRef<{ qr: string; at: number } | null>(null);
  const [cam, setCam] = useState<CamState>('starting');
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [summary, setSummary] = useState<CheckinSummary | null>(null);
  const [gate, setGate] = useState('');
  const [torch, setTorch] = useState<boolean | null>(null);
  const [showRecent, setShowRecent] = useState(false);
  const base = `/api/v1/organizations/${orgId}/events/${eventId}`;
  const packRef = useRef<AccessPack | undefined>(undefined);
  const queueRef = useRef<QueuedEntry[]>([]);
  const [online, setOnline] = useState(true);
  const [packInfo, setPackInfo] = useState<{ count: number; syncedAt: string } | null>(null);
  const [pending, setPending] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [audioReady, setAudioReady] = useState(false);

  const refreshSummary = useCallback(async () => {
    const res = await fetchWithTimeout(`${base}/check-in/summary`, { cache: 'no-store' }, 5000);
    if (res?.ok) setSummary((await res.json()) as CheckinSummary);
  }, [base]);

  const showPack = (p: AccessPack | undefined) => setPackInfo(p ? { count: Object.keys(p.tickets).length, syncedAt: p.syncedAt } : null);

  /** Baja la lista (completa la primera vez, después sólo cambios) y sube la cola pendiente. */
  const syncNow = useCallback(async () => {
    if (!navigator.onLine) {
      setOnline(false);
      return;
    }
    // 1) Subir ingresos hechos sin señal.
    const q = queueRef.current;
    if (q.length > 0) {
      const batch = q.slice(0, 500);
      const res = await fetchWithTimeout(
        `${base}/check-in/sync`,
        { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ deviceId: readLocal('lintick.device', 'sin-id-000'), entries: batch }) },
        12_000,
      );
      if (res?.ok) {
        const body = (await res.json()) as { results: { ticketId: string; result: string; holderName: string | null; usedAt: string | null }[] };
        const sent = new Set(batch.map((e) => `${e.ticketId}|${e.scannedAt}`));
        queueRef.current = queueRef.current.filter((e) => !sent.has(`${e.ticketId}|${e.scannedAt}`));
        await saveQueue(eventId, queueRef.current);
        setPending(queueRef.current.length);
        const problems = body.results.filter((r) => r.result !== 'admitted');
        if (problems.length > 0) {
          const names = problems.slice(0, 3).map((p) => p.holderName ?? 'sin nombre').join(', ');
          setNotice(
            `${problems.length === 1 ? "1 ingreso sin señal no era válido" : `${problems.length} ingresos sin señal no eran válidos`} (ya habían entrado por otra puerta o el QR estaba vencido): ${names}${problems.length > 3 ? "…" : ""}. Quedó registrado para la productora.`,
          );
        }
      } else if (!res) {
        setOnline(false);
        return;
      }
    }
    // 2) Actualizar la lista.
    const next = await downloadPack(base, packRef.current);
    if (next) {
      // Lo que sigue en la cola (todavía sin subir) se mantiene como "ingresó".
      for (const e of queueRef.current) {
        const t = next.tickets[e.ticketId];
        if (t && t.s === 'valid') next.tickets[e.ticketId] = { ...t, s: 'used', u: e.scannedAt };
      }
      packRef.current = next;
      await savePack(next);
      showPack(next);
      setOnline(true);
    } else {
      setOnline(navigator.onLine);
    }
  }, [base, eventId]);

  useEffect(() => {
    setGate(readLocal('lintick.gate', ''));
    if (!readLocal('lintick.device', '')) writeLocal('lintick.device', crypto.randomUUID());
    let alive = true;
    (async () => {
      await purgeExpired();
      packRef.current = await loadPack(eventId);
      queueRef.current = await loadQueue(eventId);
      if (!alive) return;
      showPack(packRef.current);
      setPending(queueRef.current.length);
      setOnline(navigator.onLine);
      await syncNow();
      void refreshSummary();
    })();
    const tick = setInterval(() => {
      void syncNow();
      void refreshSummary();
    }, 8_000);
    const goOnline = () => {
      setOnline(true);
      void syncNow();
    };
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      alive = false;
      clearInterval(tick);
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, [eventId, syncNow, refreshSummary]);

  useEffect(() => {
    const unlock = () => {
      const ctx = audio();
      if (ctx) {
        // Un sonido mudo de 1 ms deja el audio habilitado para el resto del turno.
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        g.gain.value = 0.0001;
        o.connect(g).connect(ctx.destination);
        o.start();
        o.stop(ctx.currentTime + 0.001);
      }
      setAudioReady(true);
      window.removeEventListener('pointerdown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    return () => window.removeEventListener('pointerdown', unlock);
  }, []);

  /** Sin señal: valida con la lista guardada en el celular. */
  const validateLocally = useCallback(
    async (qr: string): Promise<boolean> => {
      const pack = packRef.current;
      if (!pack) return false;
      const { response, enqueue } = await validateOffline(qr, pack, readLocal('lintick.gate', '') || null);
      if (enqueue) {
        pack.tickets[enqueue.ticketId] = { ...pack.tickets[enqueue.ticketId]!, s: 'used', u: enqueue.scannedAt };
        queueRef.current = [...queueRef.current, enqueue];
        setPending(queueRef.current.length);
        void saveQueue(eventId, queueRef.current);
        void savePack(pack);
        setSummary((sm) => (sm ? { ...sm, admitted: sm.admitted + 1 } : sm));
      }
      beep(response.result === 'admitted');
      setOutcome({ kind: 'result', data: response, at: Date.now(), offline: true });
      return true;
    },
    [eventId],
  );

  const validate = useCallback(
    async (qr: string) => {
      busyRef.current = true;
      if (!navigator.onLine && (await validateLocally(qr))) return;
      const res = await fetchWithTimeout(
        `${base}/check-in`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ qr: qr.slice(0, 512), gate: readLocal('lintick.gate', '') || undefined, deviceId: readLocal('lintick.device', '') || undefined }),
        },
        4000,
      );
      if (!res || res.status >= 500) {
        // Sin respuesta del servidor: si hay lista descargada, se valida en el celular.
        setOnline(false);
        if (await validateLocally(qr)) return;
        beep(false);
        setOutcome({ kind: 'network', qr, at: Date.now() });
        return;
      }
      setOnline(true);
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        beep(false);
        setOutcome({ kind: 'result', at: Date.now(), data: { result: 'not_valid', message: body?.error?.message ?? 'No tenés permiso para controlar este evento ahora.', ticket: null } });
        return;
      }
      const data = (await res.json()) as ScanResponse;
      // Mantener la lista del celular al día con lo que dijo el servidor.
      const p = packRef.current;
      if (p && data.ticket && p.tickets[data.ticket.id] && (data.result === 'admitted' || data.result === 'already_used')) {
        p.tickets[data.ticket.id] = { ...p.tickets[data.ticket.id]!, s: 'used', u: data.ticket.usedAt };
      }
      beep(data.result === 'admitted');
      setOutcome({ kind: 'result', data, at: Date.now() });
      void refreshSummary();
    },
    [base, refreshSummary, validateLocally],
  );

  async function wipe() {
    if (queueRef.current.length > 0) {
      setNotice('Todavía hay ingresos sin subir. Conectate a internet antes de borrar los datos.');
      return;
    }
    await wipeEvent(eventId);
    packRef.current = undefined;
    showPack(undefined);
    setNotice('Se borró la lista de este celular. Se vuelve a descargar con señal.');
  }

  const dismiss = useCallback(() => {
    setOutcome(null);
    // Pequeña pausa para que el mismo QR, todavía frente a la cámara, no se vuelva a leer al instante.
    setTimeout(() => {
      busyRef.current = false;
    }, 600);
  }, []);

  // Escaneo continuo, sin tocar nada: "Adelante" se cierra a los 1,5 s; un rechazo queda 3,5 s en rojo (se ve de lejos)
  // y también se cierra solo. Tocar la pantalla lo cierra antes. "Sin conexión" espera una decisión.
  useEffect(() => {
    if (outcome?.kind === 'result') {
      const id = setTimeout(dismiss, outcome.data.result === 'admitted' ? 1500 : 3500);
      return () => clearTimeout(id);
    }
  }, [outcome, dismiss]);

  // Cámara + lectura continua.
  useEffect(() => {
    let stopped = false;
    let raf = 0;
    let lastTick = 0;
    let detector: BarcodeDetectorLike | null = null;
    let jsqr: ((data: Uint8ClampedArray, w: number, h: number, o?: { inversionAttempts: 'dontInvert' | 'attemptBoth' }) => { data: string } | null) | null = null;

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) return setCam('unavailable');
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
        if (stopped) return stream.getTracks().forEach((t) => t.stop());
        streamRef.current = stream;
        const video = videoRef.current!;
        video.srcObject = stream;
        await video.play();
        setCam('on');
        const caps = (stream.getVideoTracks()[0]?.getCapabilities?.() ?? {}) as { torch?: boolean };
        setTorch(caps.torch ? false : null);
      } catch (err) {
        setCam(err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'SecurityError') ? 'denied' : 'unavailable');
        return;
      }
      try {
        const formats = (await window.BarcodeDetector?.getSupportedFormats?.()) ?? [];
        if (window.BarcodeDetector && formats.includes('qr_code')) detector = new window.BarcodeDetector({ formats: ['qr_code'] });
      } catch {
        detector = null;
      }
      if (!detector) jsqr = (await import('jsqr')).default;
      loop();
    }

    function loop() {
      raf = requestAnimationFrame(async (t) => {
        if (stopped) return;
        const video = videoRef.current;
        if (video && !busyRef.current && video.readyState >= 2 && t - lastTick > 110) {
          lastTick = t;
          let value: string | null = null;
          try {
            if (detector) {
              const codes = await detector.detect(video);
              value = codes[0]?.rawValue ?? null;
            } else if (jsqr) {
              // Se analiza un cuadrado central reducido: más rápido y evita leer QRs del fondo.
              const side = Math.min(video.videoWidth, video.videoHeight);
              const size = Math.min(560, side);
              const c = (canvasRef.current ??= document.createElement('canvas'));
              c.width = size;
              c.height = size;
              const ctx = c.getContext('2d', { willReadFrequently: true })!;
              ctx.drawImage(video, (video.videoWidth - side) / 2, (video.videoHeight - side) / 2, side, side, 0, 0, size, size);
              value = jsqr(ctx.getImageData(0, 0, size, size).data, size, size, { inversionAttempts: 'dontInvert' })?.data ?? null;
            }
          } catch {
            value = null;
          }
          if (value) {
            const last = lastRef.current;
            const now = Date.now();
            if (!(last && last.qr === value && now - last.at < 6000)) {
              lastRef.current = { qr: value, at: now };
              void validate(value);
            }
          }
        }
        loop();
      });
    }

    void start();
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [validate]);

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || torch === null) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torch } as MediaTrackConstraintSet] });
      setTorch(!torch);
    } catch {
      setTorch(null);
    }
  }

  const pct = summary && summary.expected > 0 ? Math.round((summary.admitted / summary.expected) * 100) : 0;

  return (
    <main className="relative flex min-h-dvh flex-col">
      {/* Encabezado: evento + contador */}
      <header className="z-10 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="flex items-center gap-3">
          <Link href="/acceso" aria-label="Volver a mis eventos" className="grid size-10 place-items-center rounded-full bg-paper/10 text-lg">
            ←
          </Link>
          <div className="min-w-0 flex-1">
            <p className="truncate font-bold leading-tight">{title}</p>
            {venueName ? <p className="truncate text-xs text-paper/60">{venueName}</p> : null}
          </div>
          <span
            className={`hidden rounded-full px-2.5 py-1 text-[0.7rem] font-semibold sm:inline-flex ${online ? 'bg-success/25 text-[#9be3b4]' : 'bg-[#f2a541] text-ink'}`}
            aria-live="polite"
          >
            {online ? 'En línea' : `Sin señal${pending ? ` · ${pending} por subir` : ''}`}
          </span>
          <div className="text-right leading-none" aria-live="polite">
            <p className="font-display text-2xl font-extrabold tabular-nums">{summary ? summary.admitted.toLocaleString('es-AR') : '—'}</p>
            <p className="mt-1 text-[0.7rem] text-paper/60">de {summary ? summary.expected.toLocaleString('es-AR') : '—'} ingresaron</p>
          </div>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-paper/10" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Porcentaje de ingreso">
          <div className="h-full rounded-full bg-success transition-[width] duration-500" style={{ width: `${pct}%` }} />
        </div>
        {!online ? (
          <p className="mt-2 rounded-lg bg-[#f2a541] px-3 py-2 text-xs font-semibold text-ink sm:hidden">
            Sin señal{pending ? ` · ${pending} ingresos por subir` : ''}. {packInfo ? 'Validando con la lista del celular.' : 'No hay lista descargada: no se puede validar.'}
          </p>
        ) : null}
        {notice ? (
          <button type="button" onClick={() => setNotice(null)} className="mt-2 w-full rounded-lg bg-danger/90 px-3 py-2 text-left text-xs font-semibold text-white">
            {notice} <span className="opacity-70">(tocá para cerrar)</span>
          </button>
        ) : null}
      </header>

      {/* Cámara */}
      <div className="relative flex-1 overflow-hidden">
        <video ref={videoRef} playsInline muted className="absolute inset-0 h-full w-full object-cover" />
        {cam === 'on' ? (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <div className="scan-frame relative aspect-square w-[min(72vw,340px)]">
              <span className="scan-line" />
            </div>
          </div>
        ) : (
          <div className="absolute inset-0 grid place-items-center p-8 text-center">
            {cam === 'starting' ? (
              <p className="text-paper/70">Abriendo la cámara…</p>
            ) : cam === 'denied' ? (
              <div className="max-w-xs">
                <p className="text-lg font-bold">Necesitamos la cámara</p>
                <p className="mt-2 text-sm text-paper/60">Permití el acceso a la cámara en tu navegador (ícono del candado, arriba) y recargá la página.</p>
              </div>
            ) : (
              <div className="max-w-xs">
                <p className="text-lg font-bold">No encontramos una cámara</p>
                <p className="mt-2 text-sm text-paper/60">Abrí esta página desde el celular, con Chrome o Safari.</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Barra inferior: puerta, linterna, últimos ingresos */}
      <footer className="z-10 space-y-3 bg-ink px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        <div className="flex items-center gap-2">
          <label className="flex flex-1 items-center gap-2 rounded-full bg-paper/10 px-4">
            <span className="text-xs font-semibold text-paper/60">Puerta</span>
            <input
              value={gate}
              onChange={(e) => {
                setGate(e.target.value);
                writeLocal('lintick.gate', e.target.value.slice(0, 60));
              }}
              placeholder="Ej. Principal"
              maxLength={60}
              className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-paper/40"
            />
          </label>
          {torch !== null ? (
            <button type="button" onClick={toggleTorch} aria-pressed={torch} className={`h-11 rounded-full px-4 text-sm font-semibold ${torch ? 'bg-paper text-ink' : 'bg-paper/10'}`}>
              Linterna
            </button>
          ) : null}
          <button type="button" onClick={() => setSearchOpen(true)} className="h-11 rounded-full bg-paper/10 px-4 text-sm font-semibold">
            Buscar
          </button>
          <button type="button" onClick={() => setShowRecent((v) => !v)} aria-expanded={showRecent} className="h-11 rounded-full bg-paper/10 px-4 text-sm font-semibold">
            Datos
          </button>
        </div>
        <div className="flex items-center justify-between gap-3 text-[0.72rem] text-paper/50">
          <span>
            {packInfo
              ? `Lista sin señal: ${packInfo.count.toLocaleString('es-AR')} entradas · actualizada ${dateParts(packInfo.syncedAt).time} h`
              : online
                ? 'Descargando la lista para usar sin señal…'
                : 'Sin lista descargada'}
            {pending ? ` · ${pending} por subir` : ''}
          </span>
          {packInfo ? (
            <button type="button" onClick={wipe} className="shrink-0 underline decoration-paper/30 underline-offset-2 hover:text-paper">
              Borrar datos del celular
            </button>
          ) : null}
        </div>
        {showRecent && summary ? (
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded-lg bg-paper/5 px-2 py-2">
              <p className="font-display text-xl font-extrabold tabular-nums">{summary.lastMinute ?? 0}</p>
              <p className="text-paper/60">último minuto</p>
            </div>
            <div className="rounded-lg bg-paper/5 px-2 py-2">
              <p className="font-display text-xl font-extrabold tabular-nums">{summary.last10Minutes ?? 0}</p>
              <p className="text-paper/60">últimos 10 min</p>
            </div>
            <div className="rounded-lg bg-paper/5 px-2 py-2">
              <p className="font-display text-xl font-extrabold tabular-nums">{Math.max(0, summary.expected - summary.admitted).toLocaleString('es-AR')}</p>
              <p className="text-paper/60">faltan entrar</p>
            </div>
            {summary.byGate?.length ? (
              <div className="col-span-3 rounded-lg bg-paper/5 px-3 py-2 text-left">
                <p className="text-paper/60">Por puerta</p>
                <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1">{summary.byGate.map((g) => <span key={g.gate ?? '-'}><b>{g.count}</b> {g.gate ?? 'sin puerta'}</span>)}</p>
              </div>
            ) : null}
            {summary.byStaff?.length ? (
              <div className="col-span-3 rounded-lg bg-paper/5 px-3 py-2 text-left">
                <p className="text-paper/60">Por persona</p>
                <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1">{summary.byStaff.map((p) => <span key={p.name ?? '-'}><b>{p.count}</b> {p.name ?? '—'}</span>)}</p>
              </div>
            ) : null}
          </div>
        ) : null}
        {showRecent ? (
          <ul className="max-h-48 space-y-1 overflow-y-auto text-sm">
            {summary?.recent.length ? (
              summary.recent.map((r) => (
                <li key={`${r.ticketId}-${r.at}`} className="flex justify-between gap-3 rounded-lg bg-paper/5 px-3 py-2">
                  <span className="truncate">
                    <span className="font-semibold">{r.holderName}</span> <span className="text-paper/50">· {r.ticketTypeName}</span>
                  </span>
                  <span className="shrink-0 tabular-nums text-paper/60">
                    {dateParts(r.at).time}
                    {r.gate ? ` · ${r.gate}` : ''}
                    {r.byName ? ` · ${r.byName.split(' ')[0]}` : ''}
                  </span>
                </li>
              ))
            ) : (
              <li className="text-paper/50">Todavía no ingresó nadie.</li>
            )}
          </ul>
        ) : null}
      </footer>

      {!audioReady ? (
        <p className="pointer-events-none fixed inset-x-0 bottom-28 z-20 mx-auto w-max rounded-full bg-paper px-4 py-2 text-xs font-bold text-ink shadow">Tocá la pantalla una vez para activar el sonido</p>
      ) : null}
      {searchOpen ? (
        <ManualSearch
          base={base}
          onClose={() => setSearchOpen(false)}
          onResult={(data) => {
            setSearchOpen(false);
            beep(data.result === 'admitted');
            setOutcome({ kind: 'result', data, at: Date.now() });
            void refreshSummary();
          }}
        />
      ) : null}

      {/* Resultado a pantalla completa */}
      {outcome ? <ResultOverlay outcome={outcome} onDismiss={dismiss} onRetry={(qr) => { setOutcome(null); void validate(qr); }} /> : null}
    </main>
  );
}

function ResultOverlay({ outcome, onDismiss, onRetry }: { outcome: Outcome; onDismiss: () => void; onRetry: (qr: string) => void }) {
  const offline = outcome.kind === 'result' && outcome.offline;
  if (outcome.kind === 'network') {
    return (
      <div role="alertdialog" aria-label="Sin conexión" className="scan-result fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#f2a541] p-8 text-center text-ink">
        <p className="font-display text-5xl font-extrabold">Sin conexión</p>
        <p className="mt-3 max-w-xs">No se pudo validar la entrada. No dejes pasar sin validar.</p>
        <div className="mt-8 flex gap-3">
          <button type="button" onClick={() => onRetry(outcome.qr)} className="h-12 rounded-full bg-ink px-6 font-bold text-paper">
            Reintentar
          </button>
          <button type="button" onClick={onDismiss} className="h-12 rounded-full bg-ink/10 px-6 font-bold">
            Cancelar
          </button>
        </div>
      </div>
    );
  }
  const { data } = outcome;
  const tone = TONE[data.result];
  const bg = tone === 'ok' ? 'bg-success text-white' : tone === 'stop' ? 'bg-danger text-white' : 'bg-[#f2a541] text-ink';
  const t = data.ticket;
  return (
    <button type="button" onClick={onDismiss} aria-live="assertive" className={`scan-result fixed inset-0 z-50 flex flex-col items-center justify-center p-8 text-center ${bg}`}>
      <span aria-hidden className="grid size-24 place-items-center rounded-full bg-white/20 text-6xl font-bold">
        {tone === 'ok' ? '✓' : '✕'}
      </span>
      <span className="mt-6 font-display text-6xl font-extrabold uppercase tracking-[-0.03em]">{TITLE[data.result]}</span>
      <span className="mt-3 max-w-sm text-lg opacity-90">{data.message}</span>
      {data.result === 'already_used' && t?.usedAt ? (
        <span className="mt-4 rounded-2xl bg-black/20 px-4 py-2 text-lg font-bold">
          Entró a las {dateParts(t.usedAt).time} h
          {t.usedGate ? ` · puerta ${t.usedGate}` : ''}
          {t.usedByName ? <span className="block text-base font-semibold opacity-90">Lo dejó pasar {t.usedByName}</span> : null}
        </span>
      ) : null}
      {t ? (
        <span className="mt-8 w-full max-w-sm rounded-2xl bg-black/15 px-5 py-4 text-left">
          <span className="block text-2xl font-bold leading-tight">{t.holderName}</span>
          <span className="mt-1 block opacity-90">{t.ticketTypeName}</span>
          <span className="mt-3 flex flex-wrap justify-between gap-2 font-mono text-sm opacity-90">
            <span>Nº {ticketCode(t.id)}</span>
            {t.holderDocLast3 ? <span>DNI terminado en {t.holderDocLast3}</span> : null}
          </span>
        </span>
      ) : null}
      {offline ? <span className="mt-6 rounded-full bg-black/25 px-3 py-1 text-xs font-bold uppercase tracking-[0.12em]">Validado sin señal · se sube al volver la conexión</span> : null}
      <span className="mt-6 text-sm opacity-75">{data.result === 'admitted' ? 'Siguiente…' : 'Sigue solo en unos segundos · tocá para seguir ya'}</span>
    </button>
  );
}

type FoundTicket = { id: string; holderName: string; email: string; holderDocLast3: string | null; ticketTypeName: string; status: string; usedAt: string | null; usedByName: string | null; usedGate: string | null };

/** Búsqueda a mano: por nombre, email, número de entrada o últimos 3 del DNI. Para quien no puede mostrar el QR. */
function ManualSearch({ base, onClose, onResult }: { base: string; onClose: () => void; onResult: (r: ScanResponse) => void }) {
  const [q, setQ] = useState('');
  const [items, setItems] = useState<FoundTicket[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<FoundTicket | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setItems(null);
      return;
    }
    const id = setTimeout(async () => {
      const res = await fetchWithTimeout(`${base}/check-in/search?q=${encodeURIComponent(term)}`, { cache: 'no-store' }, 5000);
      if (!res?.ok) {
        setError(res ? 'No se pudo buscar.' : 'Sin conexión: la búsqueda necesita señal.');
        return;
      }
      setError(null);
      setItems(((await res.json()) as { items: FoundTicket[] }).items);
    }, 300);
    return () => clearTimeout(id);
  }, [q, base]);

  async function admit(t: FoundTicket) {
    setBusy(true);
    const res = await fetchWithTimeout(
      `${base}/check-in/manual`,
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ticketId: t.id, gate: readLocal('lintick.gate', '') || undefined, deviceId: readLocal('lintick.device', '') || undefined }) },
      5000,
    );
    setBusy(false);
    if (!res?.ok) {
      setError(res ? 'No se pudo registrar el ingreso.' : 'Sin conexión: el ingreso manual necesita señal.');
      return;
    }
    onResult((await res.json()) as ScanResponse);
  }

  const label: Record<string, string> = { valid: 'Puede entrar', used: 'Ya entró', locked: 'Transferencia pendiente', void: 'Anulada', cancelled: 'Cancelada', refunded: 'Devuelta' };
  return (
    <div role="dialog" aria-modal="true" aria-label="Buscar entrada" className="fixed inset-0 z-40 flex flex-col bg-ink/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
      <div className="flex items-center gap-2">
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Nombre, email, Nº de entrada o DNI (3 últimos)"
          className="h-12 min-w-0 flex-1 rounded-full bg-paper px-5 text-base text-ink outline-none"
        />
        <button type="button" onClick={onClose} className="h-12 rounded-full bg-paper/10 px-4 font-semibold">
          Cerrar
        </button>
      </div>
      {error ? <p className="mt-3 rounded-lg bg-danger/90 px-3 py-2 text-sm font-semibold text-white">{error}</p> : null}
      <ul className="mt-4 flex-1 space-y-2 overflow-y-auto">
        {items?.length === 0 ? <li className="text-paper/60">No hay entradas que coincidan.</li> : null}
        {items?.map((t) => (
          <li key={t.id} className="rounded-2xl bg-paper/5 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-lg font-bold">{t.holderName}</p>
                <p className="truncate text-sm text-paper/60">{t.email} · {t.ticketTypeName}</p>
                <p className="mt-1 font-mono text-xs text-paper/60">Nº {ticketCode(t.id)}{t.holderDocLast3 ? ` · DNI …${t.holderDocLast3}` : ''}</p>
                {t.status === 'used' && t.usedAt ? (
                  <p className="mt-1 text-sm text-[#ffb4a6]">Entró {dateParts(t.usedAt).time} h{t.usedGate ? ` · ${t.usedGate}` : ''}{t.usedByName ? ` · ${t.usedByName}` : ''}</p>
                ) : null}
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${t.status === 'valid' ? 'bg-success text-white' : 'bg-paper/15'}`}>{label[t.status] ?? t.status}</span>
            </div>
            {t.status === 'valid' ? (
              confirm?.id === t.id ? (
                <div className="mt-3 flex gap-2">
                  <button type="button" onClick={() => setConfirm(null)} className="h-11 flex-1 rounded-full bg-paper/10 font-semibold">
                    No
                  </button>
                  <button type="button" disabled={busy} onClick={() => admit(t)} className="h-11 flex-1 rounded-full bg-success font-bold text-white">
                    {busy ? '…' : 'Sí, dejar pasar'}
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => setConfirm(t)} className="mt-3 h-11 w-full rounded-full bg-paper font-bold text-ink">
                  Dejar pasar (verificá el DNI)
                </button>
              )
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
