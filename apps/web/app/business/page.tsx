import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CreateOrgForm } from '@/components/business/create-org-form';
import { ErrorState } from '@/components/states';
import { getMyOrgs } from '@/lib/api';

export default async function BusinessHome({ searchParams }: { searchParams: Promise<{ nueva?: string }> }) {
  const { nueva } = await searchParams;
  const r = await getMyOrgs();
  if (!r.ok) {
    if (r.status === 401) redirect('/ingresar?next=/business');
    return (
      <div className="px-4 pt-16">
        <ErrorState message={r.error?.message ?? 'El servicio no respondió.'} />
      </div>
    );
  }
  const orgs = r.data.items;
  if (orgs.length === 1 && !nueva) redirect(`/business/${orgs[0]!.id}`);

  return (
    <div className="mx-auto grid max-w-5xl gap-10 px-4 pb-20 pt-12 sm:px-6 md:grid-cols-[1fr_440px] md:pt-20">
      <div>
        <Link href="/" className="font-display text-[1.45rem] font-extrabold tracking-[-0.04em]">
          venti<span className="text-accent">.</span> <span className="text-base font-semibold tracking-normal text-muted">business</span>
        </Link>
        <h1 className="mt-10 text-[clamp(2.6rem,6vw,4.4rem)] font-extrabold leading-[0.92]">
          Vendé tus eventos
          <br />
          con tu propia marca.
        </h1>
        <p className="mt-6 max-w-md text-muted">
          Creá tu productora, cargá el evento con sus entradas y etapas de precio, y publicalo. VENTI se encarga del stock, las reservas, los QR y el control de acceso.
        </p>
        {orgs.length > 0 ? (
          <div className="mt-10">
            <p className="eyebrow mb-3">Tus productoras</p>
            <ul className="divide-y divide-line rounded-[14px] bg-surface">
              {orgs.map((o) => (
                <li key={o.id}>
                  <Link href={`/business/${o.id}`} className="flex items-center justify-between px-5 py-4 hover:bg-ink/[0.03]">
                    <span className="font-semibold">{o.name}</span>
                    <span className="text-sm text-muted">Entrar →</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
      <div className="self-start rounded-[var(--radius-ticket)] bg-surface py-7 sm:py-9">
        <div className="px-7 sm:px-9">
          <h2 className="text-3xl font-bold">{orgs.length === 0 ? 'Creá tu productora' : 'Nueva productora'}</h2>
          <p className="mt-1 text-sm text-muted">Vas a quedar como dueño. Podés sumar a tu equipo después.</p>
        </div>
        <div className="cut my-5" aria-hidden>
          <span />
        </div>
        <div className="px-7 sm:px-9">
          <CreateOrgForm />
        </div>
      </div>
    </div>
  );
}
