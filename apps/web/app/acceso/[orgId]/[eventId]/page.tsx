import { notFound } from 'next/navigation';
import { Scanner } from '@/components/access/scanner';
import { getAccessEvents } from '@/lib/api';

export const metadata = { title: 'Escanear' };

export default async function ScanPage({ params }: { params: Promise<{ orgId: string; eventId: string }> }) {
  const { orgId, eventId } = await params;
  const res = await getAccessEvents();
  const ev = res.ok ? res.data.items.find((e) => e.orgId === orgId && e.eventId === eventId) : undefined;
  if (!ev) notFound();
  return <Scanner orgId={orgId} eventId={eventId} title={ev.title} venueName={ev.venueName} />;
}
