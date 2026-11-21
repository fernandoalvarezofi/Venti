# Plan: Lintick como plataforma integral de ticketing

Pedido del dueño del producto (2026-11-20). Guardado acá para no perderlo; se ejecuta **después** de
la app instalable sin internet (ver `docs/ROADMAP.md`), salvo que se indique otro orden.

- Referencia visual del panel: [`docs/referencias/panel-administracion.jpg`](referencias/panel-administracion.jpg)
  — es una **referencia** de estilo y disposición (no una copia exacta). Menú: los 5 grupos del pedido, mostrando sólo secciones que funcionan.
- Referencias funcionales: Eventbrite, Fever, Ticketek, Passline. Analizar patrones, **no copiar diseños**.

## Regla principal: no romper nada

No reconstruir desde cero, no eliminar funcionalidades, no cambiar sin necesidad arquitectura, rutas,
tablas, componentes ni integraciones. Todo cambio incremental, seguro, probado (tests + escritorio + móvil).
Sin migraciones destructivas. Sin botones que no funcionan, sin prototipos que simulen funcionalidad.

## Etapas pedidas

1. **Auditoría completa** (frontend, backend, base, auth, APIs, almacenamiento, despliegue, roles, panel,
   eventos, compra) → diagnóstico + plan. Luego implementar sin detenerse.
2. **Panel administrativo profesional.** Secciones: General (Inicio, Mis eventos, Calendario, Notificaciones) ·
   Ventas y operaciones (Ventas, Entradas, Compradores, Check-in, Devoluciones) · Marketing (Promociones,
   Descuentos, Promotores, Colaboradores, Campañas) · Contenido y marca (Perfil de productora, Identidad visual,
   Multimedia, Artistas, Patrocinadores) · Administración (Finanzas, Liquidaciones, Equipo, Roles, Integraciones,
   Configuración). Dashboard: recaudación, vendidas/disponibles, ocupación, conversión, compradores, rendimiento
   por evento, actividad reciente, alertas y tareas. Navegación según permisos, responsive.
3. **Asistente de creación de eventos** por pasos, con autoguardado, validaciones, borradores y vista previa:
   información · multimedia (portada, banner, fotos, galerías, videos, logo, imágenes para redes) · artistas y
   colaboradores (line-up, DJs, bios, productoras asociadas, marcas, sponsors, logos, enlaces) · entradas (general,
   VIP, sectores, mesas, gratuitas, preventas, etapas, cupos, fechas, límites, descuentos) · marketing (códigos,
   promotores, links, campañas, redes, conversiones) · publicación (FAQ, políticas, cancelaciones, contacto, SEO,
   metadatos sociales, revisión, publicación inmediata o programada).
4. **Editor visual de la página del evento**: módulos activables y reordenables, textos, imágenes, videos, logos,
   vista previa escritorio/móvil, deshacer/rehacer, autoguardado. Tres áreas: módulos · vista previa · ajustes.
   Simple, no un constructor complejo.
5. **Páginas públicas**: landing por evento (portada, video, compra, line-up, galería, sponsors, mapa, FAQ, acceso,
   redes, condiciones), **perfil público de productora**, URL propia, SEO y Open Graph (buena vista previa en WhatsApp).
   La compra actual tiene que seguir funcionando.
6. **Biblioteca multimedia** por productora y evento: carga múltiple, arrastrar y soltar, recorte, orden, carpetas,
   reutilización, progreso, reintentos; WebP/AVIF, miniaturas, imágenes responsivas, lazy loading, CDN; validar MIME
   real, límites, archivos maliciosos, URLs controladas.
7. **Herramientas comerciales**: ventas, base de compradores, promotores y comisiones, descuentos, reportes,
   liquidaciones, equipos y permisos por rol (cada uno ve sólo lo autorizado).
8. **Seguridad y confiabilidad**: auditar auth, permisos, aislamiento entre productoras, endpoints, datos personales,
   operaciones financieras, QR, check-in y archivos. Nunca confiar sólo en el frontend; registrar acciones sensibles.
9. **Diseño premium** con la identidad de Lintick: jerarquía, tipografía, formularios, tablas, filtros, estados
   vacíos/carga/error, responsive. Nada genérico "hecho por IA", sin exceso de tarjetas ni decoración inútil.
10. **Implementación y pruebas por módulos**, verificando después de cada uno.

## Diagnóstico inicial (lo que ya existe, verificado en el código)

| Área | Estado |
|---|---|
| Cuentas | Email + contraseña con confirmación, recuperar contraseña, **Google** (activo en producción). |
| Roles | owner, admin, manager, finance, sales, access_staff, viewer; permisos en la API y RLS por productora. |
| Panel actual | Resumen, Nuevo evento (asistente), Equipo, Cobros, Control de ingreso. Evento: Resumen, Entradas, Contenido, Asistentes, Equipo. |
| Eventos | Borrador → publicado; tipos de entrada con etapas de precio; cortesías; contenido (galería, line-up, servicios, enlaces, condiciones). |
| Venta | Reserva con vencimiento, cargo por servicio 10% al comprador, **Mercado Pago real** (marketplace) activo. |
| Puerta | Lintick Access: QR firmado, una sola entrada, funciona sin señal y sincroniza. |
| Reportes | Ventas por día, por tipo, ingreso, planilla de asistentes (CSV). |

**Falta (a construir):** calendario, notificaciones, devoluciones desde el panel, códigos de descuento,
promotores y campañas, perfil público de productora e identidad visual, biblioteca multimedia con carga de
archivos, patrocinadores, editor visual por módulos, publicación programada, autoguardado, mesas/butacas,
liquidaciones, medición de conversión. A verificar en la auditoría completa: SEO/Open Graph por evento y cómo se
cargan hoy las imágenes.

## Orden propuesto

1. Panel nuevo con la disposición de la referencia (navegación por permisos + dashboard con datos reales).
2. Biblioteca multimedia (lo necesitan el asistente, el editor y las páginas públicas).
3. Asistente de eventos con autoguardado y vista previa.
4. Páginas públicas + perfil de productora + SEO/Open Graph.
5. Editor visual por módulos.
6. Descuentos, promotores, devoluciones, liquidaciones.
7. Auditoría de seguridad final y pulido de diseño.
