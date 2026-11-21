import { and, eq, events, inArray, orders, ticketTypes, tickets, users, venues, withContext } from '@venti/db';
import type { Services } from '../../lib/context.ts';
import { C, button, esc, layout } from '../../lib/email-layout.ts';

const TZ = 'America/Argentina/Buenos_Aires';
const money = (cents: number, currency = 'ARS') =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency, minimumFractionDigits: cents % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 }).format(cents / 100);
const code = (id: string) => {
  const h = id.replace(/-/g, '').slice(0, 8).toUpperCase();
  return `${h.slice(0, 4)}-${h.slice(4)}`;
};

/** URL absoluta de la portada (las propias se sirven por la API de la web). Sólo https. */
function coverUrl(raw: string | null, web: string): string | null {
  if (!raw) return null;
  if (raw.startsWith('/v1/')) return `${web}/api${raw}`;
  return /^https:\/\//.test(raw) ? raw : null;
}

interface TicketsMail {
  title: string;
  startsAt: Date;
  doorsOpenAt: Date | null;
  cover: string | null;
  venueName: string | null;
  address: string | null;
  city: string | null;
  name: string;
  currency: string;
  items: { id: string; type: string; priceCents: number }[];
  /** Compra: resumen del pago. Cortesía: sin pago. */
  payment: { orderId: string; subtotalCents: number; feeCents: number; totalCents: number } | null;
}

/** Mail con las entradas (compra o cortesía): portada, datos del evento, talones, cómo entrar y, si hubo pago, el resumen. */
function renderTicketsMail(web: string, d: TicketsMail): { html: string; text: string } {
  const link = `${web}/mis-entradas`;
  const dateFmt = new Intl.DateTimeFormat('es-AR', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' }).format(d.startsAt);
  const date = dateFmt.charAt(0).toUpperCase() + dateFmt.slice(1);
  const hour = new Intl.DateTimeFormat('es-AR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(d.startsAt);
  const doors = d.doorsOpenAt ? new Intl.DateTimeFormat('es-AR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(d.doorsOpenAt) : null;
  const placeLine = [d.address, d.city].filter(Boolean).join(', ');
  const place = d.venueName ? `${d.venueName}${placeLine ? `, ${placeLine}` : ''}` : null;
  const maps = d.venueName ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([d.venueName, placeLine].filter(Boolean).join(', '))}` : null;
  const first = d.name.trim().split(/\s+/)[0] ?? '';
  const n = d.items.length;
  const cover = coverUrl(d.cover, web);
  const p = d.payment;
  const isGift = !p;

  const text = [
    isGift ? `¡Hola${first ? `, ${first}` : ''}! Te enviaron ${n === 1 ? 'una entrada' : `${n} entradas`} de cortesía.` : `¡Listo${first ? `, ${first}` : ''}! Tu compra está confirmada.`,
    '',
    d.title,
    `${date} · ${hour} h${doors ? ` · Puertas: ${doors} h` : ''}`,
    place ?? '',
    '',
    `${n === 1 ? 'Tu entrada' : `Tus ${n} entradas`}:`,
    ...d.items.map((t, i) => `• ${t.type}${n > 1 ? ` (${i + 1} de ${n})` : ''} — Nº ${code(t.id)}${isGift ? '' : ` — ${money(t.priceCents, d.currency)}`}`),
    '',
    ...(p
      ? [`Entradas: ${money(p.subtotalCents, d.currency)}`, p.feeCents > 0 ? `Cargo por servicio: ${money(p.feeCents, d.currency)}` : '', `Total pagado: ${money(p.totalCents, d.currency)}`, '']
      : []),
    `Mostrá el QR en la puerta desde "Mis entradas": ${link}`,
    'Funciona aunque no tengas señal. No compartas el QR: cada entrada entra una sola vez.',
    ...(p ? ['', `Compra Nº ${code(p.orderId)}`] : []),
  ]
    .filter((l, i, a) => l !== '' || a[i - 1] !== '')
    .join('\n');

  const label = (t: string) => `<div style="font-family:${C.font};font-size:11px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:#a79f94">${esc(t)}</div>`;
  const value = (t: string, href?: string | null) =>
    `<div style="font-family:${C.font};font-size:15px;line-height:21px;font-weight:600;color:${C.paper};margin-top:3px">${href ? `<a href="${esc(href)}" target="_blank" style="color:${C.paper};text-decoration:underline">${esc(t)}</a>` : esc(t)}</div>`;
  const row = (k: string, v: string, strong = false) =>
    `<tr><td style="padding:7px 0;font-family:${C.font};font-size:14px;color:${C.muted}">${esc(k)}</td><td align="right" style="padding:7px 0;font-family:${C.font};font-size:${strong ? 17 : 14}px;${strong ? `font-weight:800;color:${C.ink}` : `color:${C.ink}`}">${esc(v)}</td></tr>`;

  // Entrada de "papel": portada, título y datos sobre fondo tinta; abajo, la perforación y los talones.
  const ticketCard = `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-radius:18px;overflow:hidden;background:${C.ink}" bgcolor="${C.ink}">
  ${cover ? `<tr><td style="padding:0;line-height:0"><img src="${esc(cover)}" width="488" alt="${esc(d.title)}" style="display:block;width:100%;max-width:488px;height:auto;border:0"></td></tr>` : `<tr><td style="height:6px;line-height:6px;background:${C.accent}" bgcolor="${C.accent}">&nbsp;</td></tr>`}
  <tr><td style="padding:22px 24px 6px">
    <div style="font-family:${C.font};font-size:24px;line-height:29px;font-weight:800;letter-spacing:-0.5px;color:${C.paper}">${esc(d.title)}</div>
  </td></tr>
  <tr><td style="padding:12px 24px 22px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td class="stack" valign="top" width="58%" style="padding:0 12px 14px 0">${label('Fecha')}${value(date)}</td>
      <td class="stack" valign="top" width="42%" style="padding:0 0 14px 0">${label('Hora')}${value(`${hour} h`)}${doors ? `<div style="font-family:${C.font};font-size:13px;color:#cfc7bb;margin-top:2px">Puertas ${esc(doors)} h</div>` : ''}</td>
    </tr>${place ? `<tr><td colspan="2" style="padding:0">${label('Lugar')}${value(place, maps)}</td></tr>` : ''}</table>
  </td></tr>
  <tr><td style="padding:0 18px"><div style="border-top:2px dashed #4a433c;height:0;line-height:0">&nbsp;</div></td></tr>
  <tr><td style="padding:16px 24px 20px">
    ${label(n === 1 ? 'Tu entrada' : `Tus ${n} entradas`)}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:8px">
    ${d.items
      .map(
        (t, i) => `<tr><td style="padding:10px 0;border-top:1px solid #2c2622">
        <div style="font-family:${C.font};font-size:15px;font-weight:700;color:${C.paper}">${esc(t.type)}${n > 1 ? `<span style="font-weight:500;color:#a79f94"> · ${i + 1} de ${n}</span>` : ''}</div>
        <div style="font-family:${C.mono};font-size:13px;letter-spacing:1px;color:#cfc7bb;margin-top:3px">Nº ${code(t.id)}</div>
      </td><td align="right" valign="middle" style="padding:10px 0;border-top:1px solid #2c2622;font-family:${C.font};font-size:14px;color:${C.paper}">${isGift ? 'Cortesía' : esc(money(t.priceCents, d.currency))}</td></tr>`,
      )
      .join('')}
    </table>
  </td></tr>
</table>`;

  const step = (nro: string, title: string, desc: string) => `<tr>
  <td valign="top" width="34" style="padding:8px 0"><div style="width:26px;height:26px;border-radius:13px;background:${C.paper};border:1px solid ${C.line};font-family:${C.font};font-size:13px;font-weight:800;line-height:26px;text-align:center;color:${C.ink}">${nro}</div></td>
  <td valign="top" style="padding:8px 0 8px 6px;font-family:${C.font}"><div style="font-size:15px;font-weight:700;color:${C.ink}">${esc(title)}</div><div style="font-size:14px;line-height:20px;color:${C.muted};margin-top:2px">${esc(desc)}</div></td>
</tr>`;

  const pill = isGift
    ? `<div style="display:inline-block;padding:6px 12px;border-radius:999px;background:#fbe9e5;font-size:12px;font-weight:700;letter-spacing:0.4px;color:${C.accent}">&#9733;&nbsp; Entrada de cortesía</div>`
    : `<div style="display:inline-block;padding:6px 12px;border-radius:999px;background:#e8f3ea;font-size:12px;font-weight:700;letter-spacing:0.4px;color:#1f6b35">&#10003;&nbsp; Pago aprobado</div>`;
  const heading = isGift
    ? `¡Hola${first ? `, ${esc(first)}` : ''}! Te ${n === 1 ? 'regalaron una entrada' : `regalaron ${n} entradas`}.`
    : `¡Listo${first ? `, ${esc(first)}` : ''}! Ya tenés ${n === 1 ? 'tu entrada' : `tus ${n} entradas`}.`;
  const sub = isGift ? 'La productora te invitó. Ya están en tu cuenta, listas para usar.' : 'Te esperamos. Guardá este mail: tiene el detalle de tu compra.';

  const body = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td class="px" style="padding:32px 36px 0;font-family:${C.font}">
  ${pill}
  <h1 class="h1" style="margin:14px 0 0;font-size:30px;line-height:1.12;font-weight:800;letter-spacing:-0.8px;color:${C.ink}">${heading}</h1>
  <p style="margin:10px 0 0;font-size:16px;line-height:24px;color:#3a342e">${sub}</p>
</td></tr>
<tr><td class="px" style="padding:24px 36px 0">${ticketCard}</td></tr>
<tr><td class="px" style="padding:28px 36px 4px">${button(link, 'Ver mis entradas y el QR')}</td></tr>
<tr><td class="px" style="padding:26px 36px 0;font-family:${C.font}">
  <div style="font-size:13px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:${C.muted}">Cómo entrar</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:6px">
    ${step('1', 'Abrí "Mis entradas"', 'En lintick.com o en la app, con tu cuenta.')}
    ${step('2', 'Mostrá el QR en la puerta', 'Funciona aunque no tengas señal: se guarda en tu teléfono.')}
    ${step('3', 'No compartas el QR', 'Cada entrada entra una sola vez. Si alguien lo copia, se renueva.')}
  </table>
</td></tr>
${
  p
    ? `<tr><td class="px" style="padding:20px 36px 0"><div style="border-top:1px dashed ${C.line}"></div></td></tr>
<tr><td class="px" style="padding:14px 36px 0">
  <div style="font-family:${C.font};font-size:13px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:${C.muted}">Resumen del pago</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:4px">
    ${row(n === 1 ? 'Entrada' : `Entradas (${n})`, money(p.subtotalCents, d.currency))}
    ${p.feeCents > 0 ? row('Cargo por servicio', money(p.feeCents, d.currency)) : ''}
    <tr><td colspan="2" style="padding:4px 0"><div style="border-top:1px solid ${C.line}"></div></td></tr>
    ${row('Total pagado', money(p.totalCents, d.currency), true)}
  </table>
  <div style="font-family:${C.font};font-size:12px;line-height:18px;color:${C.muted};margin-top:8px">Compra Nº ${code(p.orderId)} · Pagado con Mercado Pago</div>
</td></tr>`
    : ''
}
<tr><td style="height:32px;line-height:32px">&nbsp;</td></tr>
</table>`;

  const html = layout({
    web,
    preheader: `${d.title} · ${date} ${hour} h — ${n === 1 ? 'tu entrada está' : `tus ${n} entradas están`} en "Mis entradas".`,
    tag: isGift ? 'Cortesía' : 'Compra confirmada',
    body,
    reason: isGift ? 'Te llega este mail porque una productora te envió entradas por Lintick.' : 'Te llega este mail porque compraste entradas en Lintick con esta cuenta.',
  });
  return { html, text };
}

const eventCols = { title: events.title, startsAt: events.startsAt, doorsOpenAt: events.doorsOpenAt, cover: events.coverImageUrl, venueName: venues.name, address: venues.address, city: venues.city };

/**
 * Mail de confirmación de compra: se manda una sola vez, cuando la orden pasa a "pagada".
 * El QR NO va en el mail: se muestra en la app (firmado y renovable si alguien lo copia).
 * Si el envío falla, la compra no se ve afectada (las entradas ya están en la cuenta).
 */
export async function sendPurchaseConfirmation(s: Services, orgId: string, orderId: string): Promise<void> {
  if (!s.email.enabled) return;
  const data = await withContext(s.db, { orgId }, async (tx) => {
    const [o] = await tx
      .select({ order: orders, buyerEmail: users.email, buyerName: users.fullName, ...eventCols })
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
  const o = data.order;
  const { html, text } = renderTicketsMail(web, {
    ...data,
    name: data.buyerName,
    currency: o.currency,
    payment: { orderId: o.id, subtotalCents: o.subtotalCents, feeCents: o.feeCents, totalCents: o.totalCents },
  });
  await s.email.send({ to: data.buyerEmail.toLowerCase(), kind: 'purchase_confirmed', subject: `Tus entradas para ${data.title}`, text, html, meta: { orderId: o.id, link: `${web}/mis-entradas` } });
}

/** Mail de cortesías ya asignadas a una cuenta: el mismo diseño de entradas, sin resumen de pago. */
export async function sendCourtesyTickets(s: Services, orgId: string, ticketIds: string[], to: string, name: string): Promise<void> {
  if (!s.email.enabled || ticketIds.length === 0) return;
  const data = await withContext(s.db, { orgId }, async (tx) => {
    const items = await tx
      .select({ id: tickets.id, type: ticketTypes.name, priceCents: tickets.priceCents, eventId: tickets.eventId, currency: ticketTypes.currency })
      .from(tickets)
      .innerJoin(ticketTypes, eq(ticketTypes.id, tickets.ticketTypeId))
      .where(and(inArray(tickets.id, ticketIds), eq(tickets.organizationId, orgId)));
    if (items.length === 0) return null;
    const [e] = await tx.select(eventCols).from(events).leftJoin(venues, eq(venues.id, events.venueId)).where(eq(events.id, items[0]!.eventId));
    return e ? { ...e, items, currency: items[0]!.currency } : null;
  });
  if (!data) return;
  const web = s.config.PUBLIC_WEB_URL.replace(/\/+$/, '');
  const { html, text } = renderTicketsMail(web, { ...data, name, payment: null });
  const n = data.items.length;
  await s.email.send({ to, kind: 'tickets_assigned', subject: `Tenés ${n === 1 ? 'una entrada' : `${n} entradas`} para ${data.title}`, text, html, meta: { link: `${web}/mis-entradas` } });
}
