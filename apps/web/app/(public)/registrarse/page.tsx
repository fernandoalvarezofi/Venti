import type { Metadata } from 'next';
import { AuthPage } from '@/components/auth-page';

export const metadata: Metadata = { title: 'Crear cuenta' };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ next?: string; google?: string }> }) {
  const { next, google } = await searchParams;
  return <AuthPage mode="register" nextRaw={next} googleStatus={google} />;
}
