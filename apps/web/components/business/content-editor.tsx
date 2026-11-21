'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { send } from '@/lib/client-api';
import { mediaSrc } from '@/lib/format';
import { prepareImage, uploadEventImage } from '@/lib/image-prep';
import type { AdminEvent } from '@/lib/types';
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
                <input ref={coverInput} type="file" accept="image/*" className="sr-only" onChange={(e) => upload(e.target.files, 'cover')} />
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
                <input ref={galleryInput} type="file" multiple accept="image/*" className="sr-only" onChange={(e) => upload(e.target.files, 'gallery')} />
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
