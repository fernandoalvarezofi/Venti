import type { Metadata } from 'next';
import { ResetPasswordForm } from '@/components/account-flows';
import { SimpleCardPage } from '@/components/simple-card-page';

export const metadata: Metadata = { title: 'Nueva contraseña' };

export default async function ResetPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <SimpleCardPage eyebrow="Cuenta" title="Elegí una contraseña nueva">
      <ResetPasswordForm token={token ?? ''} />
    </SimpleCardPage>
  );
}
