import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { HoldPanel } from '@/components/hold-panel';
import { ArrowLeftIcon } from '@/components/icons';
import { ErrorState } from '@/components/states';
import { getEvent, getHold } from '@/lib/api';

export const metadata: Metadata = { title: 'Tu reserva' };

export default async function HoldPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const r = await getHold(id);
  if (!r.ok) {
    if (r.status === 401) redirect(`/ingresar?next=${encodeURIComponent(`/reserva/${id}`)}`);
    if (r.status === 404) notFound();
    return (
      <div className="mx-auto max-w-3xl px-4 pt-10">
        <ErrorState message={r.error?.message ?? 'El servicio no respondió.'} />
      </div>
    );
  }
  const ev = await getEvent(r.data.eventId);
  return (
    <div className="mx-auto max-w-3xl px-4 pt-10 sm:px-6">
      <Link href={`/eventos/${r.data.eventId}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink">
        <ArrowLeftIcon className="size-4" /> {ev.ok ? ev.data.title : 'Volver al evento'}
      </Link>
      <h1 className="mt-4 text-[clamp(2.2rem,5vw,3.4rem)] font-extrabold leading-none">Tu reserva</h1>
      <div className="mt-8">
        <HoldPanel hold={r.data} />
      </div>
    </div>
  );
}
