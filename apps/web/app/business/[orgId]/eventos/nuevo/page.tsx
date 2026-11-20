import type { Metadata } from 'next';
import { EventWizard } from '@/components/business/event-wizard';
import { PageTitle } from '@/components/business/ui';
import { getVenues } from '@/lib/api';

export const metadata: Metadata = { title: 'Nuevo evento' };

export default async function NewEventPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const venues = await getVenues(orgId);
  return (
    <div className="mx-auto max-w-3xl">
      <PageTitle eyebrow="Nuevo evento" title="Creá tu evento" />
      <p className="mt-3 text-muted">Se guarda como borrador. Nadie lo ve hasta que lo publiques.</p>
      <div className="mt-8">
        <EventWizard orgId={orgId} venues={venues.ok ? venues.data.items : []} />
      </div>
    </div>
  );
}
