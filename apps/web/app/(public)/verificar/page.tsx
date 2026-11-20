import type { Metadata } from 'next';
import { VerifyEmailForm } from '@/components/account-flows';
import { SimpleCardPage } from '@/components/simple-card-page';

export const metadata: Metadata = { title: 'Activar cuenta' };

export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <SimpleCardPage eyebrow="Último paso" title="Activá tu cuenta">
      <VerifyEmailForm token={token ?? ''} />
    </SimpleCardPage>
  );
}
