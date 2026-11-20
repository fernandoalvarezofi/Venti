import type { Metadata, Viewport } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/api';

export const metadata: Metadata = { title: { default: 'Lintick Access', template: '%s · Lintick Access' }, robots: { index: false } };
export const viewport: Viewport = { themeColor: '#171411' };

/** Lintick Access: pantalla oscura pensada para la puerta (de noche, con el celular en la mano). */
export default async function AccessLayout({ children }: { children: React.ReactNode }) {
  if (!(await getCurrentUser())) redirect('/ingresar?next=/acceso');
  return <div className="min-h-dvh bg-ink text-paper">{children}</div>;
}
