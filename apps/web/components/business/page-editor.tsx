'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { EventSections, SECTION_LABELS, SPONSOR_TIER_LABELS, resolveSections, videoEmbed } from '@/components/event-sections';
import { fromLocalInput, send, toLocalInput } from '@/lib/client-api';
import { AMENITY_LABELS, LINEUP_ROLE_LABELS, dateParts, mediaSrc } from '@/lib/format';
import { prepareImage, uploadEventImage } from '@/lib/image-prep';
import type { AdminEvent, EventContent, LineupRole, PageSectionKey, SponsorTier } from '@/lib/types';
import { MinusIcon, PlusIcon } from '../icons';
import { MediaEditor } from './content-editor';
import { PanelIcon } from './panel-icons';

/**
 * Editor de la página pública del evento, en tres áreas:
 *  1. módulos (mostrar/ocultar y ordenar),  2. vista previa real (escritorio o celular),  3. ajustes del módulo elegido.
 * Deshacer/rehacer, aviso de cambios sin guardar y guardado automático cuando todo es válido.
 */

type Line = { name: string; role: LineupRole; startsAt: string; stage: string; bio: string; link: string; imageId: string | null };
interface Draft {
  description: string;
  summary: string;
  lineup: Line[];
  videos: { url: string; title: string }[];
  sponsors: { name: string; tier: SponsorTier; url: string; logoId: string | null }[];
  faq: { q: string; a: string }[];
  amenities: string[];
  extraAmenities: string[];
  doorsOpenAt: string;
  minAge: string;
  dressCode: string;
  links: Record<string, string>;
  policies: string;
  contact: { email: string; whatsapp: string };
  seo: { title: string; description: string };
  sections: { key: PageSectionKey; visible: boolean }[];
}

type ModuleKey = 'media' | 'info' | 'links' | 'seo' | PageSectionKey;
const FIXED: { key: ModuleKey; label: string }[] = [
  { key: 'media', label: 'Portada y fotos' },
  { key: 'info', label: 'Datos útiles' },
];
const EXTRA: { key: ModuleKey; label: string }[] = [
  { key: 'links', label: 'Redes y enlaces' },
  { key: 'seo', label: 'Al compartir (SEO)' },
];
const LINK_FIELDS: [string, string][] = [
  ['instagram', 'Instagram'],
  ['tiktok', 'TikTok'],
  ['spotify', 'Spotify'],
  ['youtube', 'YouTube'],
  ['website', 'Sitio web'],
];

const isHttps = (v: string) => {
  try {
    return new URL(v).protocol === 'https:';
  } catch {
    return false;
  }
};

function fromEvent(e: AdminEvent): Draft {
  return {
    description: e.description,
    summary: e.summary ?? '',
    lineup: e.lineup.map((l) => ({ name: l.name, role: l.role, startsAt: toLocalInput(l.startsAt), stage: l.stage ?? '', bio: l.bio ?? '', link: l.link ?? '', imageId: l.imageId ?? null })),
    videos: (e.videos ?? []).map((v) => ({ ...v })),
    sponsors: (e.sponsors ?? []).map((s) => ({ name: s.name, tier: s.tier, url: s.url ?? '', logoId: s.logoId })),
    faq: (e.faq ?? []).map((f) => ({ ...f })),
    amenities: e.amenities,
    extraAmenities: e.extraAmenities,
    doorsOpenAt: toLocalInput(e.doorsOpenAt),
    minAge: e.minAge === null ? '' : String(e.minAge),
    dressCode: e.dressCode ?? '',
    links: { ...(e.links as Record<string, string>) },
    policies: e.policies,
    contact: { email: e.contact?.email ?? '', whatsapp: e.contact?.whatsapp ?? '' },
    seo: { title: e.seo?.title ?? '', description: e.seo?.description ?? '' },
    sections: resolveSections(e.pageSections ?? []),
  };
}

/** Problemas que impedirían guardar (mismas reglas que valida la API). */
function problems(d: Draft): string[] {
  const p: string[] = [];
  const age = d.minAge === '' ? null : Number(d.minAge);
  if (age !== null && (!Number.isInteger(age) || age > 25)) p.push('Edad mínima: un número entre 0 y 25.');
  d.lineup.forEach((l, i) => {
    if (l.link && !isHttps(l.link)) p.push(`Line-up ${i + 1}: el enlace tiene que empezar con https://`);
  });
  d.videos.forEach((v, i) => {
    if (v.url.trim() && !videoEmbed(v.url)) p.push(`Video ${i + 1}: pegá un enlace de YouTube o Vimeo.`);
  });
  d.sponsors.forEach((s, i) => {
    if (!s.name.trim() && !s.url.trim() && !s.logoId) return;
    if (!s.name.trim()) p.push(`Patrocinador ${i + 1}: falta el nombre.`);
    if (s.url && !isHttps(s.url)) p.push(`Patrocinador ${i + 1}: el enlace tiene que empezar con https://`);
  });
  d.faq.forEach((f, i) => {
    if (!f.q.trim() && !f.a.trim()) return;
    if (f.q.trim().length < 3 || !f.a.trim()) p.push(`Pregunta ${i + 1}: completá la pregunta y la respuesta.`);
  });
  for (const [k, label] of LINK_FIELDS) if (d.links[k] && !isHttps(d.links[k]!)) p.push(`${label}: el enlace tiene que empezar con https://`);
  if (d.contact.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.contact.email)) p.push('Contacto: el email no es válido.');
  if (d.contact.whatsapp && !/^\+?[0-9 ()-]{6,20}$/.test(d.contact.whatsapp)) p.push('Contacto: WhatsApp sólo con números (con código de área).');
  return p;
}

function payload(d: Draft) {
  return {
    description: d.description,
    summary: d.summary,
    lineup: d.lineup.filter((l) => l.name.trim()).map((l) => ({ name: l.name.trim(), role: l.role, startsAt: fromLocalInput(l.startsAt), stage: l.stage.trim() || null, bio: l.bio.trim(), link: l.link.trim() || null, imageId: l.imageId })),
    videos: d.videos.filter((v) => v.url.trim()).map((v) => ({ url: v.url.trim(), title: v.title.trim() })),
    sponsors: d.sponsors.filter((s) => s.name.trim() || s.url.trim() || s.logoId).map((s) => ({ name: s.name.trim(), tier: s.tier, url: s.url.trim() || null, logoId: s.logoId })),
    faq: d.faq.filter((f) => f.q.trim() || f.a.trim()).map((f) => ({ q: f.q.trim(), a: f.a.trim() })),
    amenities: d.amenities,
    extraAmenities: d.extraAmenities,
    doorsOpenAt: fromLocalInput(d.doorsOpenAt),
    minAge: d.minAge === '' ? null : Number(d.minAge),
    dressCode: d.dressCode.trim() || null,
    links: Object.fromEntries(Object.entries(d.links).filter(([, v]) => v && v.trim()).map(([k, v]) => [k, v.trim()])),
    policies: d.policies,
    contact: Object.fromEntries(Object.entries(d.contact).filter(([, v]) => v.trim()).map(([k, v]) => [k, v.trim()])),
    seo: Object.fromEntries(Object.entries(d.seo).filter(([, v]) => v.trim()).map(([k, v]) => [k, v.trim()])),
    pageSections: d.sections,
  };
}

/** Vista previa: los mismos componentes que la página pública, con el borrador. */
function preview(e: AdminEvent, d: Draft): EventContent {
  const p = payload(d);
  return {
    ...e,
    ...p,
    doorsOpenAt: p.doorsOpenAt,
    lineup: p.lineup,
    sponsors: p.sponsors,
    links: p.links,
    contact: p.contact,
    seo: p.seo,
  };
}

const label = (htmlFor: string, text: string, hint?: string) => (
  <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-semibold">
    {text}
    {hint ? <span className="ml-1 font-normal text-muted">{hint}</span> : null}
  </label>
);

function ImagePick({ orgId, eventId, value, onChange, disabled, round = false }: { orgId: string; eventId: string; value: string | null; onChange: (id: string | null) => void; disabled?: boolean; round?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function pick(file: File | undefined) {
    if (!file) return;
    setErr(null);
    setBusy(true);
    try {
      const blob = await prepareImage(file, 800, 120);
      const r = await uploadEventImage(orgId, eventId, blob, 'asset');
      if (r.ok) onChange(r.id);
      else setErr(r.message);
    } catch (x) {
      setErr(x instanceof Error ? x.message : 'No se pudo usar esa imagen.');
    }
    setBusy(false);
  }
  return (
    <div className="flex items-center gap-3">
      <span className={`grid size-14 shrink-0 place-items-center overflow-hidden bg-ink/[0.06] ${round ? 'rounded-full' : 'rounded-[10px]'}`}>
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={mediaSrc(`/v1/media/${value}`, orgId)} alt="" className="h-full w-full object-contain" />
        ) : (
          <PanelIcon name="plus" className="size-4 text-muted" />
        )}
      </span>
      <div className="text-sm">
        <label className={`cursor-pointer font-semibold underline ${busy || disabled ? 'pointer-events-none opacity-50' : ''}`}>
          {busy ? 'Subiendo…' : value ? 'Cambiar' : 'Subir imagen'}
          <input type="file" accept="image/jpeg,image/png,image/webp,image/heic" className="sr-only" disabled={busy || disabled} onChange={(e) => pick(e.target.files?.[0])} />
        </label>
        {value ? (
          <button type="button" onClick={() => onChange(null)} className="ml-3 text-muted hover:text-danger" disabled={disabled}>
            Quitar
          </button>
        ) : null}
        {err ? <p className="mt-1 text-xs text-danger">{err}</p> : null}
      </div>
    </div>
  );
}

export function PageEditor({ orgId, event }: { orgId: string; event: AdminEvent }) {
  const router = useRouter();
  const closed = event.status === 'cancelled' || event.status === 'finished';
  const [d, setDraft] = useState<Draft>(() => fromEvent(event));
  const [saved, setSaved] = useState<string>(() => JSON.stringify(payload(fromEvent(event))));
  const [mod, setMod] = useState<ModuleKey>('about');
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const past = useRef<Draft[]>([]);
  const future = useRef<Draft[]>([]);
  const lastEdit = useRef<{ at: number; mod: ModuleKey }>({ at: 0, mod: 'about' });
  const [, force] = useState(0);

  /** Cada cambio entra al historial; escribir seguido en el mismo módulo cuenta como un solo paso. */
  const update = useCallback(
    (fn: (x: Draft) => Draft) => {
      setDraft((prev) => {
        const now = Date.now();
        if (now - lastEdit.current.at > 800 || lastEdit.current.mod !== mod) {
          past.current = [...past.current.slice(-99), prev];
          future.current = [];
        }
        lastEdit.current = { at: now, mod };
        return fn(prev);
      });
      force((n) => n + 1);
    },
    [mod],
  );
  const undo = () => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(d);
    lastEdit.current.at = 0;
    setDraft(prev);
    force((n) => n + 1);
  };
  const redo = () => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(d);
    lastEdit.current.at = 0;
    setDraft(next);
    force((n) => n + 1);
  };

  const body = payload(d);
  const dirty = JSON.stringify(body) !== saved;
  const issues = problems(d);

  const save = useCallback(() => {
    if (closed || issues.length || !dirty) return;
    const snapshot = JSON.stringify(body);
    start(async () => {
      const r = await send('PATCH', `/v1/organizations/${orgId}/events/${event.id}`, body);
      if (!r.ok) {
        const issue = (r.details?.issues as { path: string; message: string }[] | undefined)?.[0];
        setStatus({ ok: false, text: issue ? `No se guardó. Revisá ${issue.path.replace(/^\//, '').replace(/\//g, ' › ')}: ${issue.message}` : `No se guardó: ${r.message}` });
        return;
      }
      setSaved(snapshot);
      setStatus({ ok: true, text: 'Guardado' });
      router.refresh();
    });
  }, [closed, issues.length, dirty, body, orgId, event.id, router]);

  // Guardado automático: 1,5 s después del último cambio, si no hay errores.
  useEffect(() => {
    if (!dirty || issues.length || closed) return;
    const t = setTimeout(save, 1500);
    return () => clearTimeout(t);
  }, [dirty, issues.length, closed, save]);

  // Atajos: Ctrl+Z / Ctrl+Shift+Z (o Ctrl+Y) y Ctrl+S. No pisan el deshacer propio de un campo de texto.
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (!(ev.ctrlKey || ev.metaKey)) return;
      const inField = ev.target instanceof HTMLInputElement || ev.target instanceof HTMLTextAreaElement;
      if (ev.key.toLowerCase() === 's') {
        ev.preventDefault();
        save();
      } else if (!inField && ev.key.toLowerCase() === 'z') {
        ev.preventDefault();
        if (ev.shiftKey) redo();
        else undo();
      } else if (!inField && ev.key.toLowerCase() === 'y') {
        ev.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Aviso al salir con cambios sin guardar.
  useEffect(() => {
    const onLeave = (ev: BeforeUnloadEvent) => {
      if (dirty) ev.preventDefault();
    };
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  }, [dirty]);

  const moveSection = (i: number, delta: number) =>
    update((x) => {
      const s = [...x.sections];
      const j = i + delta;
      if (j < 0 || j >= s.length) return x;
      [s[i], s[j]] = [s[j]!, s[i]!];
      return { ...x, sections: s };
    });
  const toggleSection = (key: PageSectionKey) => update((x) => ({ ...x, sections: x.sections.map((s) => (s.key === key ? { ...s, visible: !s.visible } : s)) }));

  const pv = preview(event, d);
  const start_ = dateParts(event.startsAt);

  return (
    <div>
      {/* Barra superior: estado, deshacer/rehacer, guardar */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[14px] bg-surface px-4 py-3">
        <p className="flex items-center gap-2 text-sm" aria-live="polite">
          <span className={`size-2 rounded-full ${issues.length ? 'bg-danger' : dirty || pending ? 'bg-accent' : 'bg-success'}`} aria-hidden />
          {closed ? 'El evento terminó o se canceló: no se puede editar.' : issues.length ? 'Hay algo para corregir antes de guardar' : pending ? 'Guardando…' : dirty ? 'Cambios sin guardar' : status?.ok === false ? status.text : 'Todo guardado'}
        </p>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={undo} disabled={!past.current.length} className="h-9 rounded-full px-3 text-sm font-semibold hover:bg-ink/5 disabled:opacity-30" title="Deshacer (Ctrl+Z)">
            ↶ Deshacer
          </button>
          <button type="button" onClick={redo} disabled={!future.current.length} className="h-9 rounded-full px-3 text-sm font-semibold hover:bg-ink/5 disabled:opacity-30" title="Rehacer (Ctrl+Shift+Z)">
            ↷ Rehacer
          </button>
          <button type="button" onClick={save} disabled={!dirty || pending || issues.length > 0 || closed} className="ml-1 h-9 rounded-full bg-ink px-4 text-sm font-semibold text-paper hover:bg-ink/85 disabled:opacity-40">
            Guardar
          </button>
        </div>
      </div>
      {issues.length ? (
        <ul role="alert" className="mb-4 space-y-1 rounded-[14px] bg-danger/10 px-4 py-3 text-sm text-danger">
          {issues.slice(0, 4).map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)] 2xl:grid-cols-[260px_minmax(0,1fr)_360px]">
        {/* 1 · Módulos */}
        <nav aria-label="Módulos de la página" className="min-w-0 lg:sticky lg:top-6 lg:self-start">
          <p className="px-2 pb-2 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-muted">Módulos</p>
          <ul className="space-y-0.5">
            {FIXED.map((m) => (
              <li key={m.key}>
                <button type="button" onClick={() => setMod(m.key)} className={`w-full rounded-lg px-3 py-2 text-left text-sm font-medium ${mod === m.key ? 'bg-accent/[0.09] text-accent-ink' : 'hover:bg-ink/[0.04]'}`}>
                  {m.label}
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-4 px-2 pb-2 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-muted">Secciones · orden</p>
          <ul className="space-y-0.5">
            {d.sections.map((s, i) => (
              <li key={s.key} className={`flex items-center gap-1 rounded-lg ${mod === s.key ? 'bg-accent/[0.09]' : 'hover:bg-ink/[0.04]'}`}>
                <button type="button" onClick={() => setMod(s.key)} className={`min-w-0 flex-1 truncate px-3 py-2 text-left text-sm font-medium ${mod === s.key ? 'text-accent-ink' : ''} ${s.visible ? '' : 'text-muted line-through'}`}>
                  {SECTION_LABELS[s.key]}
                </button>
                <button type="button" onClick={() => moveSection(i, -1)} disabled={i === 0 || closed} className="grid size-7 place-items-center rounded text-muted hover:bg-ink/10 disabled:opacity-25" aria-label={`Subir ${SECTION_LABELS[s.key]}`}>
                  ↑
                </button>
                <button type="button" onClick={() => moveSection(i, 1)} disabled={i === d.sections.length - 1 || closed} className="grid size-7 place-items-center rounded text-muted hover:bg-ink/10 disabled:opacity-25" aria-label={`Bajar ${SECTION_LABELS[s.key]}`}>
                  ↓
                </button>
                <button type="button" onClick={() => toggleSection(s.key)} disabled={closed} className="mr-1 grid size-7 place-items-center rounded text-xs text-muted hover:bg-ink/10" aria-label={s.visible ? `Ocultar ${SECTION_LABELS[s.key]}` : `Mostrar ${SECTION_LABELS[s.key]}`} aria-pressed={s.visible}>
                  {s.visible ? '👁' : '—'}
                </button>
              </li>
            ))}
          </ul>
          <ul className="mt-4 space-y-0.5 border-t border-line pt-3">
            {EXTRA.map((m) => (
              <li key={m.key}>
                <button type="button" onClick={() => setMod(m.key)} className={`w-full rounded-lg px-3 py-2 text-left text-sm font-medium ${mod === m.key ? 'bg-accent/[0.09] text-accent-ink' : 'hover:bg-ink/[0.04]'}`}>
                  {m.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/* 3 · Ajustes del módulo (en pantallas medianas va antes de la vista previa) */}
        <section aria-label="Ajustes del módulo" className="min-w-0 rounded-[18px] bg-surface p-5 2xl:order-3 2xl:sticky 2xl:top-6 2xl:max-h-[calc(100dvh-3rem)] 2xl:self-start 2xl:overflow-y-auto">
          <fieldset disabled={closed} className="min-w-0 space-y-4">
            <legend className="mb-2 text-lg font-bold">{[...FIXED, ...EXTRA].find((m) => m.key === mod)?.label ?? SECTION_LABELS[mod as PageSectionKey]}</legend>

            {mod === 'media' ? <MediaEditor orgId={orgId} event={event} /> : null}

            {mod === 'about' ? (
              <>
                <div>
                  {label('summary', 'Descripción corta', `(${d.summary.length}/200)`)}
                  <input id="summary" className="field" maxLength={200} value={d.summary} onChange={(e) => update((x) => ({ ...x, summary: e.target.value }))} placeholder="Una frase que invite a venir" />
                  <p className="mt-1 text-xs text-muted">Se usa también como texto al compartir el enlace.</p>
                </div>
                <div>
                  {label('description', 'Descripción completa')}
                  <textarea id="description" className="field h-48 py-3" maxLength={20000} value={d.description} onChange={(e) => update((x) => ({ ...x, description: e.target.value }))} />
                </div>
              </>
            ) : null}

            {mod === 'lineup' ? (
              <>
                <ul className="space-y-3">
                  {d.lineup.map((l, i) => {
                    const set = (patch: Partial<Line>) => update((x) => ({ ...x, lineup: x.lineup.map((y, j) => (j === i ? { ...y, ...patch } : y)) }));
                    return (
                      <li key={i} className="relative space-y-2 rounded-xl bg-paper p-3 pr-11">
                        <div className="grid gap-2 sm:grid-cols-2">
                          <input className="field h-10 text-sm" aria-label="Nombre" placeholder="Nombre del artista" value={l.name} maxLength={80} onChange={(e) => set({ name: e.target.value })} />
                          <select className="field h-10 text-sm" aria-label="Rol" value={l.role} onChange={(e) => set({ role: e.target.value as LineupRole })}>
                            {Object.entries(LINEUP_ROLE_LABELS).map(([v, t]) => (
                              <option key={v} value={v}>
                                {t}
                              </option>
                            ))}
                          </select>
                          <input className="field h-10 text-sm" type="datetime-local" aria-label="Horario (opcional)" value={l.startsAt} onChange={(e) => set({ startsAt: e.target.value })} />
                          <input className="field h-10 text-sm" aria-label="Escenario (opcional)" placeholder="Escenario" value={l.stage} maxLength={60} onChange={(e) => set({ stage: e.target.value })} />
                        </div>
                        <textarea className="field h-20 py-2 text-sm" aria-label="Biografía (opcional)" placeholder="Biografía corta (opcional)" maxLength={600} value={l.bio} onChange={(e) => set({ bio: e.target.value })} />
                        <input className="field h-10 text-sm" type="url" aria-label="Enlace (opcional)" placeholder="https://open.spotify.com/… (opcional)" value={l.link} onChange={(e) => set({ link: e.target.value })} />
                        <ImagePick orgId={orgId} eventId={event.id} value={l.imageId} onChange={(id) => set({ imageId: id })} round />
                        <button type="button" onClick={() => update((x) => ({ ...x, lineup: x.lineup.filter((_, j) => j !== i) }))} className="absolute right-1.5 top-2.5 grid size-8 place-items-center rounded-full text-muted hover:bg-ink/5 hover:text-danger" aria-label={`Quitar ${l.name || 'artista'}`}>
                          <MinusIcon className="size-4" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
                <button type="button" onClick={() => update((x) => ({ ...x, lineup: [...x.lineup, { name: '', role: x.lineup.length ? 'guest' : 'headliner', startsAt: '', stage: '', bio: '', link: '', imageId: null }] }))} className="inline-flex items-center gap-1.5 text-sm font-semibold hover:underline">
                  <PlusIcon className="size-4" /> Agregar artista o DJ
                </button>
              </>
            ) : null}

            {mod === 'videos' ? (
              <>
                <p className="text-sm text-muted">Aftermovies, adelantos o videos de los artistas. Pegá el enlace de YouTube o Vimeo.</p>
                <ul className="space-y-3">
                  {d.videos.map((v, i) => (
                    <li key={i} className="relative space-y-2 rounded-xl bg-paper p-3 pr-11">
                      <input className="field h-10 text-sm" type="url" aria-label="Enlace del video" placeholder="https://www.youtube.com/watch?v=…" value={v.url} onChange={(e) => update((x) => ({ ...x, videos: x.videos.map((y, j) => (j === i ? { ...y, url: e.target.value } : y)) }))} />
                      <input className="field h-10 text-sm" aria-label="Título (opcional)" placeholder="Título (opcional)" maxLength={100} value={v.title} onChange={(e) => update((x) => ({ ...x, videos: x.videos.map((y, j) => (j === i ? { ...y, title: e.target.value } : y)) }))} />
                      {v.url && !videoEmbed(v.url) ? <p className="text-xs text-danger">No reconocemos ese enlace: tiene que ser de YouTube o Vimeo.</p> : null}
                      <button type="button" onClick={() => update((x) => ({ ...x, videos: x.videos.filter((_, j) => j !== i) }))} className="absolute right-1.5 top-2.5 grid size-8 place-items-center rounded-full text-muted hover:bg-ink/5 hover:text-danger" aria-label="Quitar video">
                        <MinusIcon className="size-4" />
                      </button>
                    </li>
                  ))}
                </ul>
                {d.videos.length < 6 ? (
                  <button type="button" onClick={() => update((x) => ({ ...x, videos: [...x.videos, { url: '', title: '' }] }))} className="inline-flex items-center gap-1.5 text-sm font-semibold hover:underline">
                    <PlusIcon className="size-4" /> Agregar video
                  </button>
                ) : (
                  <p className="text-xs text-muted">Máximo 6 videos.</p>
                )}
              </>
            ) : null}

            {mod === 'gallery' ? <p className="text-sm text-muted">Las fotos se suben en el módulo “Portada y fotos”. Acá elegís si la galería se muestra y en qué lugar de la página.</p> : null}

            {mod === 'amenities' ? (
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(AMENITY_LABELS).map(([code, t]) => {
                  const on = d.amenities.includes(code);
                  return (
                    <label key={code} className={`flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm ${on ? 'bg-ink text-paper' : 'bg-paper hover:bg-ink/5'}`}>
                      <input type="checkbox" className="sr-only" checked={on} onChange={() => update((x) => ({ ...x, amenities: on ? x.amenities.filter((a) => a !== code) : [...x.amenities, code] }))} />
                      {t}
                    </label>
                  );
                })}
              </div>
            ) : null}

            {mod === 'sponsors' ? (
              <>
                <p className="text-sm text-muted">Patrocinadores, marcas, productoras asociadas y medios, con su logo y enlace.</p>
                <ul className="space-y-3">
                  {d.sponsors.map((s, i) => {
                    const set = (patch: Partial<Draft['sponsors'][number]>) => update((x) => ({ ...x, sponsors: x.sponsors.map((y, j) => (j === i ? { ...y, ...patch } : y)) }));
                    return (
                      <li key={i} className="relative space-y-2 rounded-xl bg-paper p-3 pr-11">
                        <div className="grid gap-2 sm:grid-cols-2">
                          <input className="field h-10 text-sm" aria-label="Nombre" placeholder="Nombre" maxLength={80} value={s.name} onChange={(e) => set({ name: e.target.value })} />
                          <select className="field h-10 text-sm" aria-label="Tipo" value={s.tier} onChange={(e) => set({ tier: e.target.value as SponsorTier })}>
                            {Object.entries(SPONSOR_TIER_LABELS).map(([v, t]) => (
                              <option key={v} value={v}>
                                {t}
                              </option>
                            ))}
                          </select>
                        </div>
                        <input className="field h-10 text-sm" type="url" aria-label="Enlace (opcional)" placeholder="https://… (opcional)" value={s.url} onChange={(e) => set({ url: e.target.value })} />
                        <ImagePick orgId={orgId} eventId={event.id} value={s.logoId} onChange={(id) => set({ logoId: id })} />
                        <button type="button" onClick={() => update((x) => ({ ...x, sponsors: x.sponsors.filter((_, j) => j !== i) }))} className="absolute right-1.5 top-2.5 grid size-8 place-items-center rounded-full text-muted hover:bg-ink/5 hover:text-danger" aria-label={`Quitar ${s.name || 'patrocinador'}`}>
                          <MinusIcon className="size-4" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
                <button type="button" onClick={() => update((x) => ({ ...x, sponsors: [...x.sponsors, { name: '', tier: 'sponsor', url: '', logoId: null }] }))} className="inline-flex items-center gap-1.5 text-sm font-semibold hover:underline">
                  <PlusIcon className="size-4" /> Agregar patrocinador o marca
                </button>
              </>
            ) : null}

            {mod === 'faq' ? (
              <>
                <ul className="space-y-3">
                  {d.faq.map((f, i) => (
                    <li key={i} className="relative space-y-2 rounded-xl bg-paper p-3 pr-11">
                      <input className="field h-10 text-sm" aria-label="Pregunta" placeholder="¿Hay estacionamiento?" maxLength={200} value={f.q} onChange={(e) => update((x) => ({ ...x, faq: x.faq.map((y, j) => (j === i ? { ...y, q: e.target.value } : y)) }))} />
                      <textarea className="field h-20 py-2 text-sm" aria-label="Respuesta" placeholder="Respuesta" maxLength={2000} value={f.a} onChange={(e) => update((x) => ({ ...x, faq: x.faq.map((y, j) => (j === i ? { ...y, a: e.target.value } : y)) }))} />
                      <button type="button" onClick={() => update((x) => ({ ...x, faq: x.faq.filter((_, j) => j !== i) }))} className="absolute right-1.5 top-2.5 grid size-8 place-items-center rounded-full text-muted hover:bg-ink/5 hover:text-danger" aria-label="Quitar pregunta">
                        <MinusIcon className="size-4" />
                      </button>
                    </li>
                  ))}
                </ul>
                <button type="button" onClick={() => update((x) => ({ ...x, faq: [...x.faq, { q: '', a: '' }] }))} className="inline-flex items-center gap-1.5 text-sm font-semibold hover:underline">
                  <PlusIcon className="size-4" /> Agregar pregunta
                </button>
              </>
            ) : null}

            {mod === 'policies' ? (
              <div>
                {label('policies', 'Condiciones de ingreso y cancelaciones')}
                <textarea id="policies" className="field h-48 py-3" maxLength={5000} placeholder="Qué no se puede ingresar, reingresos, menores, cancelaciones y devoluciones…" value={d.policies} onChange={(e) => update((x) => ({ ...x, policies: e.target.value }))} />
              </div>
            ) : null}

            {mod === 'contact' ? (
              <>
                <div>
                  {label('cemail', 'Email de contacto', '(opcional)')}
                  <input id="cemail" type="email" className="field" value={d.contact.email} onChange={(e) => update((x) => ({ ...x, contact: { ...x.contact, email: e.target.value } }))} />
                </div>
                <div>
                  {label('cwa', 'WhatsApp', '(opcional, con código de área)')}
                  <input id="cwa" inputMode="tel" className="field" placeholder="+54 9 11 1234 5678" value={d.contact.whatsapp} onChange={(e) => update((x) => ({ ...x, contact: { ...x.contact, whatsapp: e.target.value } }))} />
                </div>
              </>
            ) : null}

            {mod === 'info' ? (
              <>
                <div>
                  {label('doors', 'Apertura de puertas')}
                  <input id="doors" type="datetime-local" className="field" value={d.doorsOpenAt} onChange={(e) => update((x) => ({ ...x, doorsOpenAt: e.target.value }))} />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    {label('minage', 'Edad mínima')}
                    <input id="minage" inputMode="numeric" className="field" placeholder="Ej. 18" value={d.minAge} onChange={(e) => update((x) => ({ ...x, minAge: e.target.value.replace(/\D/g, '').slice(0, 2) }))} />
                  </div>
                  <div>
                    {label('dress', 'Vestimenta')}
                    <input id="dress" className="field" maxLength={120} placeholder="Ej. Informal" value={d.dressCode} onChange={(e) => update((x) => ({ ...x, dressCode: e.target.value }))} />
                  </div>
                </div>
              </>
            ) : null}

            {mod === 'links' ? (
              <div className="space-y-3">
                {LINK_FIELDS.map(([k, t]) => (
                  <div key={k}>
                    {label(`link-${k}`, t)}
                    <input id={`link-${k}`} type="url" className="field h-10 text-sm" placeholder="https://…" value={d.links[k] ?? ''} onChange={(e) => update((x) => ({ ...x, links: { ...x.links, [k]: e.target.value } }))} />
                  </div>
                ))}
              </div>
            ) : null}

            {mod === 'seo' ? (
              <>
                <div>
                  {label('seot', 'Título al compartir', `(${d.seo.title.length}/70)`)}
                  <input id="seot" className="field" maxLength={70} placeholder={event.title} value={d.seo.title} onChange={(e) => update((x) => ({ ...x, seo: { ...x.seo, title: e.target.value } }))} />
                </div>
                <div>
                  {label('seod', 'Descripción al compartir', `(${d.seo.description.length}/170)`)}
                  <textarea id="seod" className="field h-24 py-3" maxLength={170} placeholder={d.summary || 'Si lo dejás vacío, usamos la descripción corta.'} value={d.seo.description} onChange={(e) => update((x) => ({ ...x, seo: { ...x.seo, description: e.target.value } }))} />
                </div>
                <div>
                  <p className="mb-2 text-sm font-semibold">Así se ve en WhatsApp</p>
                  <div className="overflow-hidden rounded-xl bg-[#e7ffdb] p-2">
                    <div className="overflow-hidden rounded-lg bg-white text-ink shadow-sm">
                      {event.coverImage ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={mediaSrc(event.coverImage.url, orgId)} alt="" className="aspect-[1.91/1] w-full object-cover" />
                      ) : null}
                      <div className="p-2.5">
                        <p className="line-clamp-1 text-sm font-semibold">{d.seo.title || event.title}</p>
                        <p className="line-clamp-2 text-xs text-ink-soft">{d.seo.description || d.summary || `${start_.long} · Entradas en Lintick`}</p>
                        <p className="mt-1 text-[0.7rem] text-muted">venti-web-eta.vercel.app</p>
                      </div>
                    </div>
                  </div>
                  {!event.coverImage ? <p className="mt-1.5 text-xs text-muted">Subí una portada para que aparezca la imagen.</p> : null}
                </div>
              </>
            ) : null}

            {(['lineup', 'videos', 'gallery', 'amenities', 'sponsors', 'faq', 'policies', 'contact', 'about'] as ModuleKey[]).includes(mod) ? (
              <label className="flex items-center gap-2 border-t border-line pt-4 text-sm">
                <input type="checkbox" checked={d.sections.find((s) => s.key === mod)?.visible ?? true} onChange={() => toggleSection(mod as PageSectionKey)} />
                Mostrar esta sección en la página
              </label>
            ) : null}
          </fieldset>
        </section>

        {/* 2 · Vista previa */}
        <section aria-label="Vista previa" className="min-w-0 lg:col-start-2 2xl:col-start-2 2xl:row-start-1">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Vista previa</p>
            <div className="flex rounded-full bg-surface p-1 text-xs font-semibold" role="group" aria-label="Tamaño de la vista previa">
              {(['desktop', 'mobile'] as const).map((v) => (
                <button key={v} type="button" onClick={() => setDevice(v)} aria-pressed={device === v} className={`rounded-full px-3 py-1.5 ${device === v ? 'bg-ink text-paper' : 'text-muted'}`}>
                  {v === 'desktop' ? 'Escritorio' : 'Celular'}
                </button>
              ))}
            </div>
          </div>
          <div className="overflow-hidden rounded-[18px] bg-ink/[0.04] p-3 sm:p-5">
            <div className={`mx-auto overflow-hidden rounded-[14px] bg-paper shadow-[0_0_0_1px_var(--color-line)] transition-[max-width] duration-300 ${device === 'mobile' ? 'max-w-[390px]' : 'max-w-full'}`}>
              <div className="relative aspect-[16/9] bg-[#c4553a] text-[#fff7ef]">
                {event.coverImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={mediaSrc(event.coverImage.url, orgId)} alt="" className="absolute inset-0 h-full w-full object-cover" />
                ) : (
                  <span className="absolute bottom-4 left-5 font-display leading-none">
                    <span className="block text-5xl font-extrabold tracking-[-0.05em]">{start_.day}</span>
                    <span className="text-sm font-bold">{start_.month}</span>
                  </span>
                )}
              </div>
              <div className={device === 'mobile' ? 'p-4 pb-8' : 'p-6 pb-10 sm:p-8'}>
                <h3 className={`font-extrabold leading-[0.95] ${device === 'mobile' ? 'text-3xl' : 'text-4xl'}`}>{event.title}</h3>
                <p className="mt-2 text-sm text-muted">
                  {start_.long} · {start_.time} h{event.venue ? ` · ${event.venue.name}, ${event.venue.city}` : ''}
                </p>
                <EventSections content={pv} description={d.description} title={event.title} />
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
