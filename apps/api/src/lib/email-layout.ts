/**
 * Diseño común de los mails de Lintick ("entrada de papel": cartulina, tinta y un acento bermellón).
 * HTML de tablas con estilos en línea: es lo único que Gmail, Outlook y Apple Mail muestran igual.
 * Las imágenes se sirven desde la web (PNG: los clientes de mail no muestran SVG).
 */
export const C = {
  paper: '#f4efe6',
  card: '#fbf8f2',
  ink: '#171411',
  muted: '#6b645c',
  line: '#e7dfd2',
  accent: '#d23a1f',
  font: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif",
  mono: "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace",
} as const;

export const SUPPORT_WHATSAPP_URL = 'https://wa.me/5492355504890';

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Botón "a prueba de Outlook" (tabla + enlace con relleno). */
export function button(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto"><tr>
<td align="center" bgcolor="${C.accent}" style="border-radius:999px">
<a href="${esc(href)}" target="_blank" style="display:inline-block;padding:15px 30px;font-family:${C.font};font-size:16px;font-weight:700;line-height:1;color:#ffffff;text-decoration:none;border-radius:999px">${esc(label)}</a>
</td></tr></table>`;
}

export interface LayoutInput {
  web: string;
  /** Texto que se ve en la bandeja junto al asunto (oculto en el cuerpo). */
  preheader: string;
  /** Etiqueta chica arriba a la derecha (ej. "Compra confirmada"). */
  tag?: string;
  body: string;
  /** Por qué le llega este mail (pie). */
  reason: string;
}

export function layout({ web, preheader, tag, body, reason }: LayoutInput): string {
  const logo = `${web}/email/lintick-mark.png`;
  return `<!doctype html>
<html lang="es" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light">
<title>Lintick</title>
<style>
  @media (max-width:600px){ .px{padding-left:20px!important;padding-right:20px!important} .h1{font-size:26px!important} .stack{display:block!important;width:100%!important} }
  a{color:${C.ink}}
</style>
</head>
<body style="margin:0;padding:0;background:${C.paper};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.paper}">${esc(preheader)}&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.paper}" style="background:${C.paper}">
<tr><td align="center" style="padding:28px 12px 36px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px">
  <tr><td class="px" style="padding:0 8px 18px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td valign="middle" style="font-family:${C.font}">
        <a href="${web}" target="_blank" style="text-decoration:none;color:${C.ink}">
          <img src="${logo}" width="40" height="40" alt="" style="display:inline-block;vertical-align:middle;border:0;width:40px;height:40px">
          <span style="display:inline-block;vertical-align:middle;margin-left:8px;font-size:24px;font-weight:800;letter-spacing:-0.6px;color:${C.ink}">Lintick<span style="color:${C.accent}">.</span></span>
        </a>
      </td>
      ${tag ? `<td valign="middle" align="right" style="font-family:${C.font};font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${C.muted}">${esc(tag)}</td>` : ''}
    </tr></table>
  </td></tr>
  <tr><td style="background:${C.card};border-radius:22px;border:1px solid ${C.line}">
    ${body}
  </td></tr>
  <tr><td class="px" style="padding:22px 16px 0;font-family:${C.font};font-size:13px;line-height:20px;color:${C.muted};text-align:center">
    ¿Necesitás ayuda? Escribinos por <a href="${SUPPORT_WHATSAPP_URL}" target="_blank" style="color:${C.ink};font-weight:600">WhatsApp</a> o mirá la <a href="${web}/ayuda" target="_blank" style="color:${C.ink};font-weight:600">guía de ayuda</a>.
  </td></tr>
  <tr><td class="px" style="padding:10px 16px 0;font-family:${C.font};font-size:12px;line-height:18px;color:#8a8278;text-align:center">
    ${esc(reason)}<br>Lintick · Entradas para lo que pasa · <a href="${web}" target="_blank" style="color:#8a8278">lintick.com</a>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

/** Mail simple de cuenta (confirmar email, cambiar contraseña, avisos): título, texto, botón y nota. */
export function simpleEmail(o: { web: string; preheader: string; title: string; paragraphs: string[]; cta?: { href: string; label: string }; note?: string; reason: string }): string {
  const body = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td class="px" style="padding:34px 36px 8px;font-family:${C.font}">
  <h1 class="h1" style="margin:0;font-size:28px;line-height:1.15;font-weight:800;letter-spacing:-0.6px;color:${C.ink}">${esc(o.title)}</h1>
</td></tr>
${o.paragraphs.map((p) => `<tr><td class="px" style="padding:12px 36px 0;font-family:${C.font};font-size:16px;line-height:25px;color:#3a342e">${p}</td></tr>`).join('')}
${o.cta ? `<tr><td class="px" style="padding:28px 36px 6px">${button(o.cta.href, o.cta.label)}</td></tr>
<tr><td class="px" style="padding:12px 36px 0;font-family:${C.font};font-size:12px;line-height:18px;color:${C.muted};text-align:center">Si el botón no funciona, copiá este enlace:<br><a href="${esc(o.cta.href)}" style="color:${C.muted};word-break:break-all">${esc(o.cta.href)}</a></td></tr>` : ''}
${o.note ? `<tr><td class="px" style="padding:22px 36px 0"><div style="border-top:1px dashed ${C.line}"></div></td></tr>
<tr><td class="px" style="padding:16px 36px 0;font-family:${C.font};font-size:13px;line-height:20px;color:${C.muted}">${o.note}</td></tr>` : ''}
<tr><td style="height:32px;line-height:32px">&nbsp;</td></tr>
</table>`;
  return layout({ web: o.web, preheader: o.preheader, body, reason: o.reason });
}
