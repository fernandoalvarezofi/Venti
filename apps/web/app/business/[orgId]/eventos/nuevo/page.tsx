import type { Metadata } from 'next';
import { EventWizard } from '@/components/business/event-wizard';
import { getVenues } from '@/lib/api';

export const metadata: Metadata = { title: 'Nuevo evento' };

export default async function NewEventPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const venues = await getVenues(orgId);
  return (
    <div className="mx-auto max-w-[1280px]">
      <h1 className="font-display text-3xl font-extrabold tracking-[-0.03em]">Crear evento</h1>
      <p className="mt-1 text-sm text-muted">Se guarda como borrador hasta que lo publiques. Nadie lo ve antes.</p>
      <div className="mt-6">
        <EventWizard orgId={orgId} venues={venues.ok ? venues.data.items : []} />
      </div>
    </div>
  );
}
