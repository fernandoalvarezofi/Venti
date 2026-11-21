import { and, eq, events, orders, ticketTypes, tickets, users, venues, withContext } from '@venti/db';
import type { Services } from '../../lib/context.ts';

const TZ = 'America/Argentina/Buenos_Aires';
const money = (cents: number, currency = 'ARS') =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency, minimumFractionDigits: cents % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 }).format(cents / 100);
const code = (id: string) => {
  const h = id.replace(/-/g, '').slice(0, 8).toUpperCase();
  return `${h.slice(0, 4)}-${h.slice(4)}`;
};
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/**
 * Mail de confirmación de compra: se manda una sola vez, cuando la orden pasa a "pagada".
 * Lleva el detalle (evento, fecha, lugar, entradas con su número, precio, cargo por servicio y total) y el
 * enlace a "Mis entradas". El QR NO va en el mail: se muestra en la app (firmado y renovable si alguien lo copia).
 * Si el envío falla, la compra no se ve afectada (las entradas ya están en la cuenta).
 */
export async function sendPurchaseConfirmation(s: Services, orgId: string, orderId: string): Promise<void> {
  if (!s.email.enabled) return;
  const data = await withContext(s.db, { orgId }, async (tx) => {
    const [o] = await tx
      .select({ order: orders, buyerEmail: users.email, buyerName: users.fullName, title: events.title, startsAt: events.startsAt, doorsOpenAt: events.doorsOpenAt, venueName: venues.name, address: venues.address, city: venues.city })
      .from(orders)
      .innerJoin(users, eq(users.id, orders.buyerUserId))
      .innerJoin(events, eq(events.id, orders.eventId))
      .leftJoin(venues, eq(venues.id, events.venueId))
      .where(and(eq(orders.id, orderId), eq(orders.organizationId, orgId)));
    if (!o) return null;
    const items = await tx
      .select({ id: tickets.id, type: ticketTypes.name, priceCents: tickets.priceCents })
      .from(tickets)
      .innerJoin(ticketTypes, eq(ticketTypes.id, tickets.ticketTypeId))
      .where(eq(tickets.orderId, orderId));
    return { ...o, items };
  });
  if (!data || data.items.length === 0) return;

  const web = s.config.PUBLIC_WEB_URL.replace(/\/+$/, '');
  const link = `${web}/mis-entradas`;
  const when = new Intl.DateTimeFormat('es-AR', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', hour12: false }).format(data.startsAt);
  const whenCap = when.charAt(0).toUpperCase() + when.slice(1);
  const doors = data.doorsOpenAt ? new Intl.DateTimeFormat('es-AR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(data.doorsOpenAt) : null;
  const place = data.venueName ? `${data.venueName}${data.address ? `, ${data.address}` : ''}${data.city ? `, ${data.city}` : ''}` : null;
  const first = data.buyerName.trim().split(/\s+/)[0] ?? '';
  const o = data.order;
  const n = data.items.length;

  const text = [
    `¡Hola${first ? ` ${first}` : ''}! Tu compra está confirmada.`,
    '',
    data.title,
    `${whenCap} h${doors ? ` · Puertas: ${doors} h` : ''}`,
    place ?? '',
    '',
    `${n === 1 ? 'Tu entrada' : `Tus ${n} entradas`}:`,
    ...data.items.map((t) => `• ${t.type} — Nº ${code(t.id)} — ${money(t.priceCents, o.currency)}`),
    '',
    `Entradas: ${money(o.subtotalCents, o.currency)}`,
    o.feeCents > 0 ? `Cargo por servicio: ${money(o.feeCents, o.currency)}` : '',
    `Total pagado: ${money(o.totalCents, o.currency)}`,
    '',
    `Mostrá el QR en la puerta desde "Mis entradas": ${link}`,
    'Funciona aunque no tengas señal. No compartas el QR: entra una sola vez.',
    '',
    `Compra Nº ${code(o.id)}`,
  ]
    .filter((l, i, a) => l !== '' || a[i - 1] !== '')
    .join('\n');

  const row = (k: string, v: string, strong = false) =>
    `<tr><td style="padding:6px 0;color:#6b645c">${esc(k)}</td><td style="padding:6px 0;text-align:right;${strong ? 'font-weight:700;color:#171411' : 'color:#171411'}">${esc(v)}</td></tr>`;
  const html = `<!doctype html><html lang="es"><body style="margin:0;background:#f4efe6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#171411">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4efe6;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fbf8f2;border-radius:18px;overflow:hidden">
<tr><td style="padding:22px 24px 8px;font-size:22px;font-weight:800;letter-spacing:-0.5px">Lintick<span style="color:#d23a1f">.</span></td></tr>
<tr><td style="padding:4px 24px 0"><p style="margin:0;font-size:15px">¡Hola${first ? ` ${esc(first)}` : ''}! Tu compra está <strong>confirmada</strong>.</p></td></tr>
<tr><td style="padding:18px 24px 0">
  <div style="background:#171411;color:#f4efe6;border-radius:14px;padding:18px">
    <div style="font-size:20px;font-weight:800;line-height:1.2">${esc(data.title)}</div>
    <div style="margin-top:8px;font-size:14px;opacity:.85">${esc(whenCap)} h${doors ? ` · Puertas ${esc(doors)} h` : ''}</div>
    ${place ? `<div style="margin-top:2px;font-size:14px;opacity:.85">${esc(place)}</div>` : ''}
  </div>
</td></tr>
<tr><td style="padding:18px 24px 0">
  <div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#6b645c">${n === 1 ? 'Tu entrada' : `Tus ${n} entradas`}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:6px;font-size:14px">
  ${data.items.map((t) => `<tr><td style="padding:8px 0;border-bottom:1px solid #ece5d9"><strong>${esc(t.type)}</strong><br><span style="font-family:Menlo,monospace;color:#6b645c">Nº ${code(t.id)}</span></td><td style="padding:8px 0;border-bottom:1px solid #ece5d9;text-align:right">${esc(money(t.priceCents, o.currency))}</td></tr>`).join('')}
  </table>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;font-size:14px">
  ${row('Entradas', money(o.subtotalCents, o.currency))}
  ${o.feeCents > 0 ? row('Cargo por servicio', money(o.feeCents, o.currency)) : ''}
  ${row('Total pagado', money(o.totalCents, o.currency), true)}
  </table>
</td></tr>
<tr><td style="padding:22px 24px 6px" align="center">
  <a href="${link}" style="display:inline-block;background:#d23a1f;color:#ffffff;text-decoration:none;font-weight:700;padding:13px 22px;border-radius:999px">Ver mis entradas</a>
</td></tr>
<tr><td style="padding:6px 24px 22px;font-size:13px;color:#6b645c;text-align:center">Mostrá el QR en la puerta desde “Mis entradas”. Funciona aunque no tengas señal.<br>No compartas el QR: cada entrada entra una sola vez.</td></tr>
</table>
<p style="font-size:12px;color:#8a8278;margin:14px 0 0">Compra Nº ${code(o.id)} · Lintick</p>
</td></tr></table></body></html>`;

  await s.email.send({
    to: data.buyerEmail.toLowerCase(),
    kind: 'purchase_confirmed',
    subject: `Tus entradas para ${data.title}`,
    text,
    html,
    meta: { orderId: o.id, link },
  });
}
