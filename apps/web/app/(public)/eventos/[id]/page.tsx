import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EventPoster } from '@/components/event-card';
import { ArrowLeftIcon, CalendarIcon, PinIcon } from '@/components/icons';
import { ErrorState } from '@/components/states';
import { BuyPanel } from '@/components/checkout';
import { LinksAndMap, QuickFacts } from '@/components/event-content';
import { EventSections } from '@/components/event-sections';
import { getCurrentUser, getEvent } from '@/lib/api';
import { categoryLabel, dateParts, mediaSrc } from '@/lib/format';

type Params = Promise<{ id: string }>;
const UUID = /^[0-9a-f-]{36}$/;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  if (!UUID.test(id)) return { title: 'Evento' };
  const r = await getEvent(id);
  if (!r.ok) return { title: 'Evento' };
  const e = r.data;
  // Vista previa al compartir (WhatsApp, Instagram, X): título, descripción y portada del evento.
  const title = e.seo.title || e.title;
  const d = dateParts(e.startsAt);
  const description = e.seo.description || e.summary || `${d.long} · ${e.venue ? `${e.venue.name}, ${e.venue.city}` : 'Lintick'}. Entradas en Lintick.`;
  const image = e.coverImage ? mediaSrc(e.coverImage.url) : undefined;
  return {
    title,
    description,
    alternates: { canonical: `/eventos/${e.id}` },
    openGraph: { type: 'website', title, description, url: `/eventos/${e.id}`, siteName: 'Lintick', locale: 'es_AR', ...(image ? { images: [{ url: image, width: e.coverImage!.width, height: e.coverImage!.height, alt: e.title }] } : {}) },
    twitter: { card: image ? 'summary_large_image' : 'summary', title, description, ...(image ? { images: [image] } : {}) },
  };
}

export default async function EventPage({ params }: { params: Params }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const [r, user] = await Promise.all([getEvent(id), getCurrentUser()]);
  if (!r.ok) {
    if (r.status === 404) notFound();
    return (
      <div className="mx-auto max-w-6xl px-4 pt-10 sm:px-6">
        <ErrorState message={r.error?.message ?? 'El servicio no respondió.'} />
      </div>
    );
  }
  const e = r.data;
  const start = dateParts(e.startsAt);
  const end = dateParts(e.endsAt);

  return (
    <div className="mx-auto max-w-6xl px-4 pb-24 pt-6 sm:px-6 sm:pt-10 lg:pb-0">
      <Link href="/eventos" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink">
        <ArrowLeftIcon className="size-4" /> Eventos
      </Link>

      <div className="mt-6 grid gap-10 lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-14">
        <div className="min-w-0">
          <div className="aspect-[16/10] overflow-hidden rounded-[var(--radius-ticket)]">
            <EventPoster event={e} size="lg" priority />
          </div>

          <p className="eyebrow mt-8">
            {categoryLabel(e.category)} · {e.organization.name}
          </p>
          <h1 className="mt-3 text-[clamp(2.2rem,5.5vw,4rem)] font-extrabold leading-[0.95]">{e.title}</h1>

          <QuickFacts c={e} />

          {e.status === 'cancelled' ? (
            <p role="status" className="mt-6 rounded-xl bg-danger/10 px-4 py-3 text-sm font-semibold text-danger">
              Este evento fue cancelado por la productora.
            </p>
          ) : null}

          <dl className="mt-8 grid gap-5 border-y border-line py-6 sm:grid-cols-2">
            <div className="flex gap-3">
              <CalendarIcon className="mt-0.5 size-5 shrink-0 text-muted" />
              <div>
                <dt className="sr-only">Fecha</dt>
                <dd className="font-semibold">{start.long}</dd>
                <dd className="text-sm text-muted">
                  De {start.time} a {end.time} h{start.day !== end.day ? ` (termina el ${end.long.toLowerCase()})` : ''}
                </dd>
              </div>
            </div>
            {e.venue ? (
              <div className="flex gap-3">
                <PinIcon className="mt-0.5 size-5 shrink-0 text-muted" />
                <div>
                  <dt className="sr-only">Lugar</dt>
                  <dd className="font-semibold">{e.venue.name}</dd>
                  <dd className="text-sm text-muted">
                    {e.venue.address}, {e.venue.city}, {e.venue.province}
                  </dd>
                </div>
              </div>
            ) : null}
          </dl>

          <EventSections content={e} description={e.description} title={e.title} />
          <LinksAndMap links={e.links} venue={e.venue} />
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start" aria-label="Entradas">
          <BuyPanel event={e} loggedIn={Boolean(user)} />
        </aside>
      </div>
    </div>
  );
}
