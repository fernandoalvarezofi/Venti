import { notFound, redirect } from 'next/navigation';
import { BusinessShell } from '@/components/business/shell';
import { getCurrentUser, getMyOrgs } from '@/lib/api';

export default async function OrgLayout({ children, params }: { children: React.ReactNode; params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const [user, orgs] = await Promise.all([getCurrentUser(), getMyOrgs()]);
  if (!user) redirect('/ingresar?next=/business');
  if (!orgs.ok) redirect('/business');
  const org = orgs.data.items.find((o) => o.id === orgId);
  if (!org) notFound();
  return (
    <BusinessShell org={org} orgs={orgs.data.items} userName={user.fullName}>
      {children}
    </BusinessShell>
  );
}
