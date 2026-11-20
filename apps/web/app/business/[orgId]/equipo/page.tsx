import type { Metadata } from 'next';
import { AddMemberForm } from '@/components/business/add-member-form';
import { PageTitle, Panel } from '@/components/business/ui';
import { getMembers } from '@/lib/api';
import type { OrgRole } from '@/lib/types';

export const metadata: Metadata = { title: 'Equipo' };

const ROLE_INFO: Record<OrgRole, { label: string; body: string }> = {
  owner: { label: 'Dueño', body: 'Todo, incluida la configuración de la productora.' },
  admin: { label: 'Administrador', body: 'Todo menos la configuración de la productora.' },
  manager: { label: 'Producción', body: 'Eventos, entradas, precios, cortesías y acceso.' },
  finance: { label: 'Finanzas', body: 'Ventas, liquidaciones y auditoría.' },
  sales: { label: 'Ventas', body: 'Ve eventos y entradas.' },
  access_staff: { label: 'Acceso', body: 'Sólo escanea entradas en la puerta.' },
  viewer: { label: 'Lectura', body: 'Ve los eventos, sin cambiar nada.' },
};

export default async function TeamPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const members = await getMembers(orgId);
  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <PageTitle eyebrow="Equipo" title="Quién trabaja con vos" />
      <Panel title="Sumar a alguien" description="La persona tiene que tener cuenta en LinTICK con ese email.">
        <AddMemberForm orgId={orgId} roles={Object.entries(ROLE_INFO).map(([value, r]) => ({ value: value as OrgRole, label: r.label, body: r.body }))} />
      </Panel>
      <Panel title="Miembros">
        {!members.ok ? (
          <p className="text-sm text-muted">Sólo el dueño y los administradores pueden ver y gestionar el equipo.</p>
        ) : (
          <ul className="divide-y divide-line">
            {members.data.items.map((m) => (
              <li key={m.userId} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="font-medium">{m.fullName}</p>
                  <p className="truncate text-sm text-muted">{m.email}</p>
                </div>
                <span className="rounded-full bg-ink/[0.07] px-2.5 py-1 text-xs font-semibold">{ROLE_INFO[m.role].label}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
