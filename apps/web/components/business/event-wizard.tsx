'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { fromLocalInput, parseMoneyToCents, send } from '@/lib/client-api';
import { CATEGORY_LABELS, formatMoney } from '@/lib/format';
import { prepareImage, uploadEventImage } from '@/lib/image-prep';
import type { Venue } from '@/lib/types';
import { MinusIcon, PlusIcon } from '../icons';
import { AdmitButton } from '../ticket-button';

export const KIND_LABELS: Record<string, string> = {
  general: 'General',
  vip: 'VIP',
  backstage: 'Backstage',
  early_bird: 'Early bird',
  presale: 'Preventa',
  seated: 'Numerada / platea',
  sector: 'Por sector',
  group: 'Grupal',
  season_pass: 'Abono',
  multiday: 'Multidía',
  corporate: 'Corporativa',
};

interface StageDraft {
  name: string;
  price: string;
  limit: string;
  endsAt: string;
}
interface TypeDraft {
  name: string;
  kind: string;
  capacity: string;
  maxPerOrder: string;
  description: string;
  stages: StageDraft[];
}

const emptyType = (): TypeDraft => ({ name: '', kind: 'general', capacity: '', maxPerOrder: '6', description: '', stages: [{ name: 'General', price: '', limit: '', endsAt: '' }] });
const STEPS = ['Datos', 'Lugar', 'Entradas', 'Revisar'] as const;

export function EventWizard({ orgId, venues }: { orgId: string; venues: Venue[] }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [info, setInfo] = useState({ title: '', category: 'music', description: '', startsAt: '', endsAt: '' });
  const [venueMode, setVenueMode] = useState<'existing' | 'new'>(venues.length ? 'existing' : 'new');
  const [venueId, setVenueId] = useState(venues[0]?.id ?? '');
  const [venue, setVenue] = useState({ name: '', address: '', city: '', province: '', capacity: '' });
  const [types, setTypes] = useState<TypeDraft[]>([emptyType()]);
  const [cover, setCover] = useState<{ blob: Blob; preview: string } | null>(null);
  const [coverError, setCoverError] = useState<string | null>(null);

  async function pickCover(file: File | undefined) {
    setCoverError(null);
    if (!file) return;
    try {
      const blob = await prepareImage(file);
      if (cover) URL.revokeObjectURL(cover.preview);
      setCover({ blob, preview: URL.createObjectURL(blob) });
    } catch (err) {
      setCoverError(err instanceof Error ? err.message : 'No se pudo usar esa imagen.');
    }
  }

  const updateType = (i: number, patch: Partial<TypeDraft>) => setTypes((ts) => ts.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  const updateStage = (i: number, k: number, patch: Partial<StageDraft>) =>
    setTypes((ts) => ts.map((t, j) => (j === i ? { ...t, stages: t.stages.map((s, m) => (m === k ? { ...s, ...patch } : s)) } : t)));

  function validate(s: number): Record<string, string> {
    const e: Record<string, string> = {};
    if (s === 0) {
      if (info.title.trim().length < 3) e.title = 'El nombre del evento debe tener al menos 3 letras.';
      const a = fromLocalInput(info.startsAt);
      const b = fromLocalInput(info.endsAt);
      if (!a) e.startsAt = 'Elegí cuándo empieza.';
      else if (new Date(a).getTime() < Date.now()) e.startsAt = 'La fecha de inicio ya pasó.';
      if (!b) e.endsAt = 'Elegí cuándo termina.';
      else if (a && b <= a) e.endsAt = 'Tiene que terminar después de empezar.';
    }
    if (s === 1) {
      if (venueMode === 'existing' && !venueId) e.venue = 'Elegí un lugar.';
      if (venueMode === 'new') {
        if (venue.name.trim().length < 2) e.vname = 'Escribí el nombre del lugar.';
        if (venue.address.trim().length < 3) e.vaddress = 'Escribí la dirección.';
        if (venue.city.trim().length < 2) e.vcity = 'Escribí la ciudad.';
        if (venue.province.trim().length < 2) e.vprovince = 'Escribí la provincia.';
      }
    }
    if (s === 2) {
      types.forEach((t, i) => {
        if (!t.name.trim()) e[`t${i}name`] = 'Poné un nombre (ej. Campo, Platea, VIP).';
        const cap = Number(t.capacity);
        if (!Number.isInteger(cap) || cap < 1) e[`t${i}cap`] = 'Cantidad de entradas: un número mayor a 0.';
        const max = Number(t.maxPerOrder);
        if (!Number.isInteger(max) || max < 1 || max > 100) e[`t${i}max`] = 'Entre 1 y 100.';
        t.stages.forEach((st, k) => {
          if (!st.name.trim()) e[`t${i}s${k}name`] = 'Nombre de la etapa.';
          if (parseMoneyToCents(st.price) === null) e[`t${i}s${k}price`] = 'Precio inválido (ej. 18000).';
          if (st.limit && (!Number.isInteger(Number(st.limit)) || Number(st.limit) < 1)) e[`t${i}s${k}limit`] = 'Cupo: número mayor a 0 o vacío.';
        });
        const allLimited = t.stages.every((st) => st.limit);
        if (allLimited && cap > 0 && t.stages.reduce((a, st) => a + Number(st.limit || 0), 0) < cap) {
          e[`t${i}stages`] = 'Todas las etapas tienen cupo y no llegan a cubrir la capacidad: dejá la última sin cupo.';
        }
      });
    }
    return e;
  }

  function next() {
    const e = validate(step);
    setErrors(e);
    if (Object.keys(e).length === 0) setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function submit(publish: boolean) {
    for (let s = 0; s < 3; s++) {
      const e = validate(s);
      if (Object.keys(e).length) {
        setErrors(e);
        setStep(s);
        return;
      }
    }
    start(async () => {
      setSubmitError(null);
      let vId = venueId;
      if (venueMode === 'new') {
        const v = await send<{ id: string }>('POST', `/v1/organizations/${orgId}/venues`, {
          name: venue.name.trim(),
          address: venue.address.trim(),
          city: venue.city.trim(),
          province: venue.province.trim(),
          ...(venue.capacity ? { capacity: Number(venue.capacity) } : {}),
        });
        if (!v.ok) return setSubmitError(`No se pudo guardar el lugar: ${v.message}`);
        vId = v.data.id;
      }
      const ev = await send<{ id: string }>('POST', `/v1/organizations/${orgId}/events`, {
        title: info.title.trim(),
        category: info.category,
        description: info.description,
        venueId: vId,
        startsAt: fromLocalInput(info.startsAt),
        endsAt: fromLocalInput(info.endsAt),
      });
      if (!ev.ok) return setSubmitError(ev.code === 'slug_taken' ? 'Ya tenés un evento con ese nombre en esa fecha.' : `No se pudo crear el evento: ${ev.message}`);
      const eventUrl = `/business/${orgId}/eventos/${ev.data.id}`;
      if (cover) {
        const up = await uploadEventImage(orgId, ev.data.id, cover.blob, 'cover');
        if (!up.ok) {
          router.push(`${eventUrl}?aviso=${encodeURIComponent(`El evento se creó, pero la portada no se pudo subir: ${up.message}`)}`);
          return;
        }
      }
      for (const t of types) {
        const r = await send('POST', `/v1/organizations/${orgId}/events/${ev.data.id}/ticket-types`, {
          name: t.name.trim(),
          kind: t.kind,
          description: t.description,
          capacity: Number(t.capacity),
          maxPerOrder: Number(t.maxPerOrder),
          stages: t.stages.map((st) => ({
            name: st.name.trim(),
            priceCents: parseMoneyToCents(st.price)!,
            quantityLimit: st.limit ? Number(st.limit) : null,
            endsAt: fromLocalInput(st.endsAt),
          })),
        });
        if (!r.ok) {
          // El evento ya existe como borrador: llevamos al usuario ahí para que complete lo que falta.
          router.push(`${eventUrl}?aviso=${encodeURIComponent(`El evento se creó, pero "${t.name}" no se pudo guardar: ${r.message}`)}`);
          return;
        }
      }
      if (publish) {
        const p = await send('POST', `/v1/organizations/${orgId}/events/${ev.data.id}/publish`);
        if (!p.ok) {
          router.push(`${eventUrl}?aviso=${encodeURIComponent(`Se guardó como borrador. No se pudo publicar: ${p.message}`)}`);
          return;
        }
      }
      router.push(eventUrl);
      router.refresh();
    });
  }

  const err = (k: string) => (errors[k] ? <p className="mt-1.5 text-sm text-danger">{errors[k]}</p> : null);
  const label = (htmlFor: string, text: string) => (
    <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-semibold">
      {text}
    </label>
  );
  const selectedVenue = venues.find((v) => v.id === venueId);

  return (
    <div>
      <ol className="mb-6 grid grid-cols-4 gap-2" aria-label="Pasos">
        {STEPS.map((s, i) => (
          <li key={s}>
            <button
              type="button"
              onClick={() => i < step && setStep(i)}
              disabled={i > step}
              aria-current={i === step ? 'step' : undefined}
              className="w-full text-left disabled:cursor-default"
            >
              <span className={`block h-1 rounded-full ${i <= step ? 'bg-ink' : 'bg-ink/10'}`} />
              <span className={`mt-2 block text-xs font-semibold ${i === step ? 'text-ink' : 'text-muted'}`}>
                {i + 1}. {s}
              </span>
            </button>
          </li>
        ))}
      </ol>

      <div className="rounded-[var(--radius-ticket)] bg-surface p-5 sm:p-7">
        {step === 0 ? (
          <div className="space-y-5">
            <div>
              {label('title', 'Nombre del evento')}
              <input id="title" className="field" value={info.title} onChange={(e) => setInfo({ ...info, title: e.target.value })} maxLength={160} placeholder="Ej. Los Tres Soles — Gira Aniversario" aria-invalid={errors.title ? 'true' : undefined} />
              {err('title')}
            </div>
            <div>
              {label('category', 'Categoría')}
              <select id="category" className="field" value={info.category} onChange={(e) => setInfo({ ...info, category: e.target.value })}>
                {Object.entries(CATEGORY_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                {label('startsAt', 'Empieza')}
                <input id="startsAt" type="datetime-local" className="field" value={info.startsAt} onChange={(e) => setInfo({ ...info, startsAt: e.target.value })} aria-invalid={errors.startsAt ? 'true' : undefined} />
                {err('startsAt')}
              </div>
              <div>
                {label('endsAt', 'Termina')}
                <input id="endsAt" type="datetime-local" className="field" value={info.endsAt} onChange={(e) => setInfo({ ...info, endsAt: e.target.value })} aria-invalid={errors.endsAt ? 'true' : undefined} />
                {err('endsAt')}
              </div>
            </div>
            <p className="-mt-2 text-xs text-muted">Horario de Argentina.</p>
            <div>
              {label('description', 'Descripción (opcional)')}
              <textarea id="description" className="field h-36 py-3" value={info.description} onChange={(e) => setInfo({ ...info, description: e.target.value })} maxLength={20000} placeholder="Line-up, apertura de puertas, edad mínima, qué llevar…" />
            </div>
            <div>
              <p className="mb-1.5 text-sm font-semibold">Portada (opcional)</p>
              <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                <div className="aspect-[16/10] overflow-hidden rounded-[var(--radius-ticket)] bg-ink/[0.06]">
                  {cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={cover.preview} alt="Vista previa de la portada" className="h-full w-full object-cover" />
                  ) : (
                    <div className="grid h-full place-items-center px-4 text-center text-sm text-muted">Va de fondo en la tarjeta del evento. Si no subís una, usamos un afiche de color.</div>
                  )}
                </div>
                <label className="btn btn-ghost h-10 cursor-pointer text-sm">
                  {cover ? 'Cambiar' : 'Elegir imagen'}
                  <input type="file" accept="image/jpeg,image/png,image/webp,image/heic" className="sr-only" onChange={(e) => pickCover(e.target.files?.[0])} />
                </label>
              </div>
              {coverError ? <p className="mt-1.5 text-sm text-danger">{coverError}</p> : null}
            </div>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="space-y-5">
            {venues.length > 0 ? (
              <div className="flex gap-2" role="radiogroup" aria-label="Lugar">
                {(['existing', 'new'] as const).map((m) => (
                  <button key={m} type="button" role="radio" aria-checked={venueMode === m} onClick={() => setVenueMode(m)} className={`btn h-10 px-4 text-sm ${venueMode === m ? 'btn-ink' : 'btn-ghost'}`}>
                    {m === 'existing' ? 'Uno que ya cargué' : 'Lugar nuevo'}
                  </button>
                ))}
              </div>
            ) : null}
            {venueMode === 'existing' && venues.length > 0 ? (
              <div>
                {label('venue', 'Lugar')}
                <select id="venue" className="field" value={venueId} onChange={(e) => setVenueId(e.target.value)}>
                  {venues.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name} — {v.city}
                    </option>
                  ))}
                </select>
                {err('venue')}
              </div>
            ) : (
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  {label('vname', 'Nombre del lugar')}
                  <input id="vname" className="field" value={venue.name} onChange={(e) => setVenue({ ...venue, name: e.target.value })} placeholder="Ej. Club Paraguay" aria-invalid={errors.vname ? 'true' : undefined} />
                  {err('vname')}
                </div>
                <div className="sm:col-span-2">
                  {label('vaddress', 'Dirección')}
                  <input id="vaddress" className="field" value={venue.address} onChange={(e) => setVenue({ ...venue, address: e.target.value })} autoComplete="street-address" aria-invalid={errors.vaddress ? 'true' : undefined} />
                  {err('vaddress')}
                </div>
                <div>
                  {label('vcity', 'Ciudad')}
                  <input id="vcity" className="field" value={venue.city} onChange={(e) => setVenue({ ...venue, city: e.target.value })} aria-invalid={errors.vcity ? 'true' : undefined} />
                  {err('vcity')}
                </div>
                <div>
                  {label('vprovince', 'Provincia')}
                  <input id="vprovince" className="field" value={venue.province} onChange={(e) => setVenue({ ...venue, province: e.target.value })} aria-invalid={errors.vprovince ? 'true' : undefined} />
                  {err('vprovince')}
                </div>
                <div>
                  {label('vcap', 'Capacidad del lugar (opcional)')}
                  <input id="vcap" className="field" inputMode="numeric" value={venue.capacity} onChange={(e) => setVenue({ ...venue, capacity: e.target.value.replace(/\D/g, '') })} />
                </div>
              </div>
            )}
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-6">
            {types.map((t, i) => (
              <fieldset key={i} className="rounded-[14px] p-4 shadow-[inset_0_0_0_1px_var(--color-line-strong)] sm:p-5">
                <div className="flex items-center justify-between gap-3">
                  <legend className="font-semibold">Tipo de entrada {i + 1}</legend>
                  {types.length > 1 ? (
                    <button type="button" onClick={() => setTypes((ts) => ts.filter((_, j) => j !== i))} className="text-sm text-muted hover:text-danger">
                      Quitar
                    </button>
                  ) : null}
                </div>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div>
                    {label(`t${i}name`, 'Nombre')}
                    <input id={`t${i}name`} className="field" value={t.name} onChange={(e) => updateType(i, { name: e.target.value })} placeholder="Ej. Campo" maxLength={80} aria-invalid={errors[`t${i}name`] ? 'true' : undefined} />
                    {err(`t${i}name`)}
                  </div>
                  <div>
                    {label(`t${i}kind`, 'Tipo')}
                    <select id={`t${i}kind`} className="field" value={t.kind} onChange={(e) => updateType(i, { kind: e.target.value })}>
                      {Object.entries(KIND_LABELS).map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    {label(`t${i}cap`, 'Cantidad de entradas')}
                    <input id={`t${i}cap`} className="field" inputMode="numeric" value={t.capacity} onChange={(e) => updateType(i, { capacity: e.target.value.replace(/\D/g, '') })} aria-invalid={errors[`t${i}cap`] ? 'true' : undefined} />
                    {err(`t${i}cap`)}
                  </div>
                  <div>
                    {label(`t${i}max`, 'Máximo por compra')}
                    <input id={`t${i}max`} className="field" inputMode="numeric" value={t.maxPerOrder} onChange={(e) => updateType(i, { maxPerOrder: e.target.value.replace(/\D/g, '') })} aria-invalid={errors[`t${i}max`] ? 'true' : undefined} />
                    {err(`t${i}max`)}
                  </div>
                </div>

                <p className="mt-5 text-sm font-semibold">Etapas de precio</p>
                <p className="text-xs text-muted">Se venden en orden. Cuando una llega a su cupo o a su fecha de fin, empieza la siguiente.</p>
                <ul className="mt-3 space-y-3">
                  {t.stages.map((st, k) => (
                    <li key={k} className="grid gap-3 rounded-xl bg-paper p-3 sm:grid-cols-[1.2fr_1fr_0.8fr_1.3fr_auto] sm:items-start">
                      <div>
                        <label htmlFor={`t${i}s${k}name`} className="sr-only">
                          Nombre de la etapa
                        </label>
                        <input id={`t${i}s${k}name`} className="field h-11" value={st.name} onChange={(e) => updateStage(i, k, { name: e.target.value })} placeholder="Preventa" />
                        {err(`t${i}s${k}name`)}
                      </div>
                      <div>
                        <label htmlFor={`t${i}s${k}price`} className="sr-only">
                          Precio
                        </label>
                        <input id={`t${i}s${k}price`} className="field h-11" inputMode="decimal" value={st.price} onChange={(e) => updateStage(i, k, { price: e.target.value })} placeholder="$ 18.000" aria-invalid={errors[`t${i}s${k}price`] ? 'true' : undefined} />
                        {err(`t${i}s${k}price`)}
                      </div>
                      <div>
                        <label htmlFor={`t${i}s${k}limit`} className="sr-only">
                          Cupo
                        </label>
                        <input id={`t${i}s${k}limit`} className="field h-11" inputMode="numeric" value={st.limit} onChange={(e) => updateStage(i, k, { limit: e.target.value.replace(/\D/g, '') })} placeholder="Cupo" />
                        {err(`t${i}s${k}limit`)}
                      </div>
                      <div>
                        <label htmlFor={`t${i}s${k}ends`} className="sr-only">
                          Termina
                        </label>
                        <input id={`t${i}s${k}ends`} type="datetime-local" className="field h-11" value={st.endsAt} onChange={(e) => updateStage(i, k, { endsAt: e.target.value })} title="Fin de la etapa (opcional)" />
                      </div>
                      <button
                        type="button"
                        onClick={() => updateType(i, { stages: t.stages.filter((_, m) => m !== k) })}
                        disabled={t.stages.length === 1}
                        className="grid size-11 place-items-center rounded-full text-muted hover:bg-ink/5 hover:text-danger disabled:opacity-30"
                        aria-label="Quitar etapa"
                      >
                        <MinusIcon className="size-4" />
                      </button>
                    </li>
                  ))}
                </ul>
                {err(`t${i}stages`)}
                <button
                  type="button"
                  onClick={() => updateType(i, { stages: [...t.stages, { name: '', price: '', limit: '', endsAt: '' }] })}
                  disabled={t.stages.length >= 20}
                  className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold hover:underline"
                >
                  <PlusIcon className="size-4" /> Agregar etapa
                </button>
              </fieldset>
            ))}
            <button type="button" onClick={() => setTypes((ts) => [...ts, emptyType()])} className="btn btn-ghost w-full">
              <PlusIcon className="size-4" /> Agregar otro tipo de entrada
            </button>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="space-y-6">
            <div>
              <p className="eyebrow">{CATEGORY_LABELS[info.category]}</p>
              <h2 className="mt-1 text-2xl font-bold">{info.title}</h2>
              <p className="mt-1 text-sm text-muted">
                {info.startsAt.replace('T', ' ')} → {info.endsAt.replace('T', ' ')} · {venueMode === 'existing' ? `${selectedVenue?.name}, ${selectedVenue?.city}` : `${venue.name}, ${venue.city}`}
              </p>
            </div>
            <ul className="divide-y divide-line rounded-[14px] bg-paper">
              {types.map((t, i) => (
                <li key={i} className="p-4">
                  <p className="font-semibold">
                    {t.name} <span className="font-normal text-muted">· {KIND_LABELS[t.kind]} · {Number(t.capacity).toLocaleString('es-AR')} entradas</span>
                  </p>
                  <ul className="mt-1.5 space-y-0.5 text-sm text-ink-soft">
                    {t.stages.map((st, k) => (
                      <li key={k}>
                        {k + 1}. {st.name}: <span className="font-semibold tabular-nums">{formatMoney(parseMoneyToCents(st.price) ?? 0)}</span>
                        {st.limit ? ` · cupo ${st.limit}` : ''}
                        {st.endsAt ? ` · hasta ${st.endsAt.replace('T', ' ')}` : ''}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
            <p className="text-sm text-muted">Al comprador se le suma el cargo por servicio de LinTICK sobre el total de su compra. Lo ve desglosado antes de pagar.</p>
            {submitError ? (
              <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
                {submitError}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || pending} className="btn btn-ghost">
          Atrás
        </button>
        {step < 3 ? (
          <button type="button" onClick={next} className="btn btn-ink">
            Siguiente
          </button>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => submit(false)} disabled={pending} className="btn btn-ghost">
              {pending ? 'Guardando…' : 'Guardar borrador'}
            </button>
            <AdmitButton type="button" onClick={() => submit(true)} disabled={pending}>
              {pending ? 'Publicando…' : 'Publicar ahora'}
            </AdmitButton>
          </div>
        )}
      </div>
    </div>
  );
}
