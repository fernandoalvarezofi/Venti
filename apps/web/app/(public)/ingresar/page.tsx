import type { Metadata } from 'next';
import { AuthPage } from '@/components/auth-page';

export const metadata: Metadata = { title: 'Ingresar' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; google?: string }> }) {
  const { next, google } = await searchParams;
  return <AuthPage mode="login" nextRaw={next} googleStatus={google} />;
}
