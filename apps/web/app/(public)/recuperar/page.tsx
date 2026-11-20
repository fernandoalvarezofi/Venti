import type { Metadata } from 'next';
import { ForgotPasswordForm } from '@/components/account-flows';
import { SimpleCardPage } from '@/components/simple-card-page';

export const metadata: Metadata = { title: 'Recuperar contraseña' };

export default function ForgotPage() {
  return (
    <SimpleCardPage eyebrow="Cuenta" title="¿Olvidaste tu contraseña?">
      <ForgotPasswordForm />
    </SimpleCardPage>
  );
}
