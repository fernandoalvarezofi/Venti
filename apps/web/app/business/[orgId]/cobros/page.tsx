import type { Metadata } from 'next';
import { PaymentsConnect } from '@/components/business/payments-connect';
import { PageTitle, Panel } from '@/components/business/ui';
import { getPaymentAccount } from '@/lib/api';
import { dateParts } from '@/lib/format';

export const metadata: Metadata = { title: 'Cobros' };

const MESSAGES: Record<string, { ok: boolean; text: string }> = {
  ok: { ok: true, text: '¡Listo! Tu cuenta de Mercado Pago quedó conectada. Desde ahora tus eventos cobran online.' },
  cancelado: { ok: false, text: 'Cancelaste la conexión en Mercado Pago. Podés intentarlo de nuevo cuando quieras.' },
  'error:sesion': { ok: false, text: 'La conexión tiene que terminarla la misma persona que la empezó, con su sesión iniciada.' },
  'error:intercambio': { ok: false, text: 'Mercado Pago no confirmó la autorización. Probá de nuevo.' },
  'error:cuenta_en_uso': { ok: false, text: 'Esa cuenta de Mercado Pago ya cobra para otra productora en Lintick. Usá otra cuenta.' },
  'error:desactivado': { ok: false, text: 'Los cobros online todavía no están activados en Lintick.' },
};

export default async function PaymentsPage({ params, searchParams }: { params: Promise<{ orgId: string }>; searchParams: Promise<{ mp?: string; motivo?: string }> }) {
  const { orgId } = await params;
  const { mp, motivo } = await searchParams;
  const st = await getPaymentAccount(orgId);
  const msg = mp ? (MESSAGES[mp === 'error' ? `error:${motivo ?? ''}` : mp] ?? { ok: false, text: 'No se pudo completar la conexión.' }) : null;
  const rate = st.ok ? (st.data.commissionBps / 100).toLocaleString('es-AR') : '10';

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <PageTitle eyebrow="Cobros" title="Cobrá con Mercado Pago" />
      {msg ? (
        <p role="status" className={`rounded-xl px-4 py-3 text-sm font-medium ${msg.ok ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}>
          {msg.text}
        </p>
      ) : null}

      {!st.ok ? (
        <Panel title="Cuenta de cobro">
          <p className="text-sm text-muted">{st.status === 403 ? 'Tu rol no tiene acceso a los cobros de esta productora.' : (st.error?.message ?? 'No pudimos cargar el estado de los cobros.')}</p>
        </Panel>
      ) : (
        <>
          <Panel title="Cuenta de cobro" description="El dinero de cada venta se acredita directo en tu cuenta de Mercado Pago.">
            {!st.data.available ? (
              <p className="rounded-xl bg-warn/10 px-4 py-3 text-sm text-warn">Los cobros online todavía no están activados en Lintick. Muy pronto vas a poder conectar tu cuenta desde acá.</p>
            ) : st.data.connected ? (
              <div className="space-y-5">
                <div className="flex flex-wrap items-center gap-4">
                  <span className="grid size-12 place-items-center rounded-xl bg-[#009ee3] text-sm font-extrabold text-white" aria-hidden>
                    MP
                  </span>
                  <div>
                    <p className="flex items-center gap-2 font-semibold">
                      Mercado Pago conectado <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs text-success">Activa</span>
                      {st.data.liveMode === false ? <span className="rounded-full bg-warn/10 px-2 py-0.5 text-xs text-warn">Modo prueba</span> : null}
                    </p>
                    <p className="text-sm text-muted">
                      Cuenta {st.data.sellerId}
                      {st.data.connectedAt ? ` · conectada el ${dateParts(st.data.connectedAt).long}` : ''}
                    </p>
                  </div>
                </div>
                {st.data.lastError ? <p className="rounded-lg bg-warn/10 px-3 py-2 text-sm text-warn">Aviso de Mercado Pago: {st.data.lastError}</p> : null}
                <PaymentsConnect orgId={orgId} connected canManage />
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-muted">Conectá tu cuenta para que tus eventos puedan vender entradas online. Vas a iniciar sesión en Mercado Pago y autorizar a Lintick: nunca vemos tu contraseña.</p>
                <PaymentsConnect orgId={orgId} connected={false} canManage />
              </div>
            )}
          </Panel>

          <Panel title="Cómo funciona">
            <ol className="space-y-4 text-sm">
              {[
                ['Tu público paga', `Con tarjeta de crédito, débito o dinero en cuenta de Mercado Pago. Paga el precio de la entrada más el cargo por servicio de Lintick (${rate}%), que ve antes de pagar.`],
                ['La plata va a tu cuenta', 'Mercado Pago acredita cada venta directo en tu cuenta, por el precio completo de la entrada. Lintick sólo se queda con el cargo por servicio que pagó el comprador: no retenemos tus fondos.'],
                ['Las entradas se emiten solas', 'Apenas Mercado Pago confirma el pago, la entrada con su QR aparece en la cuenta del comprador.'],
                ['Si algo no cierra, no se emite', 'Si el monto, la moneda o la cuenta no coinciden, la entrada no se emite y queda registrado. Si se agotó el stock mientras pagaban, el pago se devuelve solo.'],
              ].map(([t, d], i) => (
                <li key={t} className="flex gap-4">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-ink font-display text-sm font-bold text-paper">{i + 1}</span>
                  <span>
                    <span className="block font-semibold">{t}</span>
                    <span className="text-muted">{d}</span>
                  </span>
                </li>
              ))}
            </ol>
          </Panel>
        </>
      )}
    </div>
  );
}
