'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';
import { fromLocalInput, send, toLocalInput } from '@/lib/client-api';
import { AMENITY_LABELS, LINEUP_ROLE_LABELS, mediaSrc } from '@/lib/format';
import { prepareImage, uploadEventImage } from '@/lib/image-prep';
import type { AdminEvent, LineupItem, LineupRole } from '@/lib/types';
import { MinusIcon, PlusIcon } from '../icons';

function Msg({ m }: { m: { ok: boolean; text: string } | null }) {
  if (!m) return null;
  return (
    <p role={m.ok ? 'status' : 'alert'} className={`mt-3 rounded-lg px-3 py-2 text-sm ${m.ok ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}>
      {m.text}
    </p>
  );
}

// ─── Imágenes ───
export function MediaEditor({ orgId, event }: { orgId: string; event: AdminEvent }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const coverInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const closed = event.status === 'cancelled' || event.status === 'finished';

  async function upload(files: FileList | null, kind: 'cover' | 'gallery') {
    if (!files?.length) return;
    setMsg(null);
    const list = kind === 'cover' ? [files[0]!] : Array.from(files).slice(0, Math.max(0, 8 - event.gallery.length));
    let done = 0;
    for (const file of list) {
      setBusy(kind === 'cover' ? 'Procesando portada…' : `Subiendo ${done + 1} de ${list.length}…`);
      try {
        const blob = await prepareImage(file);
        const r = await uploadEventImage(orgId, event.id, blob, kind);
        if (!r.ok) {
          setMsg({ ok: false, text: r.message });
          break;
        }
        done++;
      } catch (err) {
        setMsg({ ok: false, text: err instanceof Error ? err.message : 'No se pudo subir la imagen.' });
        break;
      }
    }
    setBusy(null);
    if (done > 0) {
      setMsg({ ok: true, text: kind === 'cover' ? 'Portada actualizada.' : `${done === 1 ? 'Imagen agregada' : `${done} imágenes agregadas`} a la galería.` });
      router.refresh();
    }
    if (coverInput.current) coverInput.current.value = '';
    if (galleryInput.current) galleryInput.current.value = '';
  }

  async function remove(id: string) {
    setBusy('Borrando…');
    const r = await send('DELETE', `/v1/organizations/${orgId}/events/${event.id}/media/${id}`);
    setBusy(null);
    setMsg(r.ok ? { ok: true, text: 'Imagen borrada.' } : { ok: false, text: r.message });
    if (r.ok) router.refresh();
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold">Portada</p>
        <p className="text-xs text-muted">Es la imagen de fondo de la tarjeta del evento. Horizontal, idealmente 1600 × 1000 px.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <div className="aspect-[16/10] overflow-hidden rounded-[var(--radius-ticket)] bg-ink/[0.06]">
            {event.coverImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={mediaSrc(event.coverImage.url, orgId)} alt="Portada actual" className="h-full w-full object-cover" />
            ) : (
              <div className="grid h-full place-items-center text-sm text-muted">Sin portada: se muestra el afiche de color</div>
            )}
          </div>
          {!closed ? (
            <div className="flex gap-2 sm:flex-col">
              <label className={`btn btn-ink h-10 cursor-pointer text-sm ${busy ? 'pointer-events-none opacity-50' : ''}`}>
                {event.coverImage ? 'Cambiar' : 'Subir portada'}
                <input ref={coverInput} type="file" accept="image/jpeg,image/png,image/webp,image/heic" className="sr-only" onChange={(e) => upload(e.target.files, 'cover')} />
              </label>
              {event.coverImage ? (
                <button type="button" disabled={Boolean(busy)} onClick={() => remove(event.coverImage!.id)} className="btn btn-ghost h-10 text-sm">
                  Quitar
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div>
        <div className="flex items-baseline justify-between">
          <p className="text-sm font-semibold">Galería</p>
          <p className="text-xs text-muted">{event.gallery.length} de 8</p>
        </div>
        <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {event.gallery.map((g) => (
            <li key={g.id} className="group relative aspect-square overflow-hidden rounded-xl bg-ink/[0.06]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={mediaSrc(g.url, orgId)} alt="" className="h-full w-full object-cover" />
              {!closed ? (
                <button
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={() => remove(g.id)}
                  className="absolute right-1.5 top-1.5 grid size-8 place-items-center rounded-full bg-ink/70 text-paper opacity-90 hover:bg-danger"
                  aria-label="Borrar imagen"
                >
                  <MinusIcon className="size-4" />
                </button>
              ) : null}
            </li>
          ))}
          {!closed && event.gallery.length < 8 ? (
            <li>
              <label className={`grid aspect-square cursor-pointer place-items-center rounded-xl text-center text-xs font-semibold text-muted shadow-[inset_0_0_0_1.5px_var(--color-line-strong)] hover:bg-ink/[0.03] ${busy ? 'pointer-events-none opacity-50' : ''}`}>
                <span>
                  <PlusIcon className="mx-auto mb-1 size-5" />
                  Agregar fotos
                </span>
                <input ref={galleryInput} type="file" multiple accept="image/jpeg,image/png,image/webp,image/heic" className="sr-only" onChange={(e) => upload(e.target.files, 'gallery')} />
              </label>
            </li>
          ) : null}
        </ul>
      </div>
      {busy ? (
        <p role="status" className="text-sm text-muted">
          {busy}
        </p>
      ) : null}
      <Msg m={msg} />
      <p className="text-xs text-muted">Antes de subir, achicamos las fotos y les quitamos los metadatos (por ejemplo, la ubicación GPS).</p>
    </div>
  );
}

// ─── Line-up, servicios, datos y enlaces ───
type Draft = {
  lineup: (Omit<LineupItem, 'startsAt'> & { startsAt: string })[];
  amenities: string[];
  extraAmenities: string[];
  extraInput: string;
  doorsOpenAt: string;
  minAge: string;
  dressCode: string;
  links: Record<string, string>;
  policies: string;
};

const LINK_FIELDS: [string, string, string][] = [
  ['instagram', 'Instagram', 'https://instagram.com/tu_cuenta'],
  ['tiktok', 'TikTok', 'https://tiktok.com/@tu_cuenta'],
  ['spotify', 'Spotify', 'https://open.spotify.com/…'],
  ['youtube', 'YouTube', 'https://youtube.com/…'],
  ['website', 'Sitio web', 'https://…'],
];

export function ContentEditor({ orgId, event }: { orgId: string; event: AdminEvent }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [d, setD] = useState<Draft>({
    lineup: event.lineup.map((l) => ({ ...l, startsAt: toLocalInput(l.startsAt) })),
    amenities: event.amenities,
    extraAmenities: event.extraAmenities,
    extraInput: '',
    doorsOpenAt: toLocalInput(event.doorsOpenAt),
    minAge: event.minAge === null ? '' : String(event.minAge),
    dressCode: event.dressCode ?? '',
    links: { ...event.links } as Record<string, string>,
    policies: event.policies,
  });
  const closed = event.status === 'cancelled' || event.status === 'finished';
  const setLine = (i: number, patch: Partial<Draft['lineup'][number]>) => setD((x) => ({ ...x, lineup: x.lineup.map((l, j) => (j === i ? { ...l, ...patch } : l)) }));

  function save(e: React.FormEvent) {
    e.preventDefault();
    const minAge = d.minAge === '' ? null : Number(d.minAge);
    if (minAge !== null && (!Number.isInteger(minAge) || minAge < 0 || minAge > 25)) return setMsg({ ok: false, text: 'La edad mínima tiene que ser un número entre 0 y 25.' });
    const lineup = d.lineup.filter((l) => l.name.trim()).map((l) => ({ name: l.name.trim(), role: l.role, startsAt: fromLocalInput(l.startsAt), stage: l.stage?.trim() || null }));
    const links = Object.fromEntries(Object.entries(d.links).filter(([, v]) => v && v.trim()).map(([k, v]) => [k, v.trim()]));
    start(async () => {
      setMsg(null);
      const r = await send('PATCH', `/v1/organizations/${orgId}/events/${event.id}`, {
        lineup,
        amenities: d.amenities,
        extraAmenities: d.extraAmenities,
        doorsOpenAt: fromLocalInput(d.doorsOpenAt),
        minAge,
        dressCode: d.dressCode.trim() || null,
        links,
        policies: d.policies,
      });
      if (!r.ok) {
        const issue = (r.details?.issues as { path: string; message: string }[] | undefined)?.[0];
        return setMsg({ ok: false, text: issue ? `Revisá ${issue.path.replace(/^\//, '').replace(/\//g, ' › ')}: ${issue.message}` : r.message });
      }
      setMsg({ ok: true, text: 'Contenido guardado.' });
      router.refresh();
    });
  }

  return (
    <form onSubmit={save} className="space-y-8">
      <fieldset disabled={closed || pending} className="space-y-8">
        <div>
          <legend className="text-sm font-semibold">Line-up</legend>
          <p className="text-xs text-muted">Artistas principales, invitados, soporte y DJs. Se muestran en ese orden.</p>
          <ul className="mt-3 space-y-2">
            {d.lineup.map((l, i) => (
              <li key={i} className="relative grid gap-2 rounded-xl bg-paper p-2.5 pr-12 sm:grid-cols-2">
                <input className="field h-10 text-sm" aria-label="Nombre del artista" placeholder="Nombre" value={l.name} onChange={(e) => setLine(i, { name: e.target.value })} maxLength={80} />
                <select className="field h-10 text-sm" aria-label="Rol" value={l.role} onChange={(e) => setLine(i, { role: e.target.value as LineupRole })}>
                  {Object.entries(LINEUP_ROLE_LABELS).map(([v, label]) => (
                    <option key={v} value={v}>
                      {label}
                    </option>
                  ))}
                </select>
                <input className="field h-10 text-sm" type="datetime-local" aria-label="Horario (opcional)" value={l.startsAt} onChange={(e) => setLine(i, { startsAt: e.target.value })} />
                <input className="field h-10 text-sm" aria-label="Escenario (opcional)" placeholder="Escenario" value={l.stage ?? ''} onChange={(e) => setLine(i, { stage: e.target.value })} maxLength={60} />
                <button type="button" onClick={() => setD((x) => ({ ...x, lineup: x.lineup.filter((_, j) => j !== i) }))} className="absolute right-1.5 top-2.5 grid size-9 place-items-center rounded-full text-muted hover:bg-ink/5 hover:text-danger" aria-label={`Quitar ${l.name || 'artista'}`}>
                  <MinusIcon className="size-4" />
                </button>
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => setD((x) => ({ ...x, lineup: [...x.lineup, { name: '', role: x.lineup.length === 0 ? 'headliner' : 'guest', startsAt: '', stage: null }] }))} className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold hover:underline">
            <PlusIcon className="size-4" /> Agregar artista
          </button>
        </div>

        <div>
          <legend className="text-sm font-semibold">Qué hay en el evento</legend>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {Object.entries(AMENITY_LABELS).map(([code, label]) => {
              const on = d.amenities.includes(code);
              return (
                <label key={code} className={`flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${on ? 'bg-ink text-paper' : 'bg-paper hover:bg-ink/5'}`}>
                  <input type="checkbox" className="sr-only" checked={on} onChange={() => setD((x) => ({ ...x, amenities: on ? x.amenities.filter((a) => a !== code) : [...x.amenities, code] }))} />
                  <span aria-hidden className={`grid size-4 place-items-center rounded border ${on ? 'border-paper' : 'border-line-strong'}`}>{on ? '✓' : ''}</span>
                  {label}
                </label>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {d.extraAmenities.map((x) => (
              <span key={x} className="inline-flex items-center gap-1.5 rounded-full bg-ink px-3 py-1.5 text-sm text-paper">
                {x}
                <button type="button" onClick={() => setD((s) => ({ ...s, extraAmenities: s.extraAmenities.filter((y) => y !== x) }))} aria-label={`Quitar ${x}`} className="opacity-70 hover:opacity-100">
                  ×
                </button>
              </span>
            ))}
            <input
              className="field h-9 w-56 text-sm"
              placeholder="Otro (ej. Feria de diseño)"
              aria-label="Agregar otro servicio"
              value={d.extraInput}
              maxLength={40}
              onChange={(e) => setD((x) => ({ ...x, extraInput: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                const v = d.extraInput.trim();
                if (v.length >= 2 && !d.extraAmenities.includes(v) && d.extraAmenities.length < 10) setD((x) => ({ ...x, extraAmenities: [...x.extraAmenities, v], extraInput: '' }));
              }}
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="doors" className="mb-1.5 block text-sm font-semibold">
              Apertura de puertas
            </label>
            <input id="doors" type="datetime-local" className="field" value={d.doorsOpenAt} onChange={(e) => setD((x) => ({ ...x, doorsOpenAt: e.target.value }))} />
          </div>
          <div>
            <label htmlFor="minage" className="mb-1.5 block text-sm font-semibold">
              Edad mínima
            </label>
            <input id="minage" inputMode="numeric" className="field" placeholder="Ej. 18" value={d.minAge} onChange={(e) => setD((x) => ({ ...x, minAge: e.target.value.replace(/\D/g, '').slice(0, 2) }))} />
          </div>
          <div>
            <label htmlFor="dress" className="mb-1.5 block text-sm font-semibold">
              Vestimenta
            </label>
            <input id="dress" className="field" placeholder="Ej. Informal" maxLength={120} value={d.dressCode} onChange={(e) => setD((x) => ({ ...x, dressCode: e.target.value }))} />
          </div>
        </div>

        <div>
          <legend className="text-sm font-semibold">Enlaces</legend>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {LINK_FIELDS.map(([k, label, ph]) => (
              <div key={k}>
                <label htmlFor={`link-${k}`} className="mb-1 block text-xs font-semibold text-muted">
                  {label}
                </label>
                <input id={`link-${k}`} className="field h-10 text-sm" type="url" placeholder={ph} value={d.links[k] ?? ''} onChange={(e) => setD((x) => ({ ...x, links: { ...x.links, [k]: e.target.value } }))} />
              </div>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="policies" className="text-sm font-semibold">
            Condiciones
          </label>
          <textarea id="policies" className="field mt-2 h-28 py-3" maxLength={5000} placeholder="Qué no se puede ingresar, reingresos, menores acompañados, devoluciones…" value={d.policies} onChange={(e) => setD((x) => ({ ...x, policies: e.target.value }))} />
        </div>
      </fieldset>
      {!closed ? (
        <button type="submit" disabled={pending} className="btn btn-ink">
          {pending ? 'Guardando…' : 'Guardar contenido'}
        </button>
      ) : null}
      <Msg m={msg} />
    </form>
  );
}
