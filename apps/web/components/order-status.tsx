'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { formatMoney } from '@/lib/format';
import { InstallApp } from './app-install';
import { Mascot } from './mascot';

type Order = { id: string; status: 'pending_payment' | 'paid' | 'cancelled' | 'expired' | 'refunded' | 'partially_refunded'; eventId: string; totalCents: number; currency: string; tickets: number };

/**
 * Estado de una compra al volver de Mercado Pago. Consulta cada 3 s (y le pide a la API que verifique
 * con Mercado Pago) hasta que el pago se confirma o pasan 2 minutos. Nunca da por pagado algo que la API no confirmó.
 */
export function OrderStatus({ orderId }: { orderId: string }) {
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gaveUp, setGaveUp] = useState(false);

  useEffect(() => {
    let alive = true;
    let tries = 0;
    async function check() {
      tries++;
      const res = await fetch(`/api/v1/orders/${orderId}?refresh=1`, { cache: 'no-store' }).catch(() => null);
      if (!alive) return;
      if (res?.status === 404) return setError('No encontramos esta compra en tu cuenta.');
      if (res?.ok) {
        const o = (await res.json()) as Order;
        setOrder(o);
        if (o.status !== 'pending_payment') return;
      }
      if (tries >= 40) return setGaveUp(true);
      setTimeout(check, 3000);
    }
    void check();
    return () => {
      alive = false;
    };
  }, [orderId]);

  if (error) {
    return (
      <div className="rounded-[var(--radius-ticket)] bg-surface p-8 text-center">
        <h1 className="text-2xl font-bold">{error}</h1>
        <Link href="/mis-entradas" className="btn btn-ink mt-6">
          Ir a mis entradas
        </Link>
      </div>
    );
  }

  if (!order || order.status === 'pending_payment') {
    return (
      <div className="rounded-[var(--radius-ticket)] bg-surface p-8 text-center" aria-live="polite">
        <span className="mx-auto block size-12 animate-spin rounded-full border-4 border-ink/10 border-t-accent" aria-hidden />
        <h1 className="mt-6 text-2xl font-bold">{gaveUp ? 'Todavía no nos llegó la confirmación' : 'Confirmando tu pago con Mercado Pago…'}</h1>
        <p className="mx-auto mt-2 max-w-sm text-muted">
          {gaveUp
            ? 'Si pagaste, en unos minutos tus entradas aparecen solas en “Mis entradas”. Si cancelaste el pago, podés volver al evento y reservar de nuevo.'
            : 'No cierres esta página. Tus entradas se emiten apenas Mercado Pago confirma el cobro.'}
        </p>
        {order ? <p className="mt-4 text-sm text-muted">Total: {formatMoney(order.totalCents, order.currency)}</p> : null}
        {gaveUp ? (
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Link href="/mis-entradas" className="btn btn-ink">
              Mis entradas
            </Link>
            {order ? (
              <Link href={`/eventos/${order.eventId}`} className="btn btn-ghost">
                Volver al evento
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  if (order.status === 'paid') {
    return (
      <div className="text-center">
        <Mascot pose="wave" say="¡Nos vemos ahí!" size={180} className="mx-auto" priority />
        <div className="mt-4 rounded-[var(--radius-ticket)] bg-surface p-8">
          <p className="eyebrow text-success">Pago aprobado</p>
          <h1 className="mt-2 text-3xl font-extrabold">¡Listo! Ya tenés tus entradas</h1>
          <p className="mt-2 text-muted">
            {order.tickets === 1 ? '1 entrada' : `${order.tickets} entradas`} · {formatMoney(order.totalCents, order.currency)}. Mostrá el QR en la puerta desde “Mis entradas”.
          </p>
          <Link href="/mis-entradas" className="btn btn-primary mt-6">
            Ver mis entradas
          </Link>
        </div>
        {/* Justo después de comprar es cuando más sirve tener la app (el QR sin señal en la puerta). */}
        <InstallApp className="mt-4 text-left" />
      </div>
    );
  }

  return (
    <div className="rounded-[var(--radius-ticket)] bg-surface p-8 text-center">
      <h1 className="text-2xl font-bold">{order.status === 'refunded' ? 'Te devolvimos el dinero' : 'Esta compra no se completó'}</h1>
      <p className="mx-auto mt-2 max-w-sm text-muted">
        {order.status === 'refunded'
          ? 'Mientras pagabas se agotaron las entradas que habías elegido, así que el pago se devolvió completo a tu medio de pago en Mercado Pago.'
          : 'El pago no se realizó. Podés volver al evento y reservar de nuevo.'}
      </p>
      <Link href={`/eventos/${order.eventId}`} className="btn btn-ink mt-6">
        Volver al evento
      </Link>
    </div>
  );
}
