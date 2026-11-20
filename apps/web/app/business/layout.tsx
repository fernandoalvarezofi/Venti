import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/api';

export const metadata: Metadata = { title: { default: 'VENTI Business', template: '%s · VENTI Business' } };

export default async function BusinessRootLayout({ children }: { children: React.ReactNode }) {
  if (!(await getCurrentUser())) redirect('/ingresar?next=/business');
  return <div className="flex-1">{children}</div>;
}
