import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { OrderStatus } from '@/components/order-status';
import { getCurrentUser } from '@/lib/api';

export const metadata: Metadata = { title: 'Tu compra' };

export default async function OrderPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(orderId)) notFound();
  if (!(await getCurrentUser())) redirect(`/ingresar?next=/compra/${orderId}`);
  return (
    <div className="mx-auto max-w-xl px-4 pb-20 pt-12 sm:px-6 sm:pt-16">
      <OrderStatus orderId={orderId} />
    </div>
  );
}
