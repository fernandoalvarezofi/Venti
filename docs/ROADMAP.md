# Lintick — Roadmap y criterios de aceptación

Estado: ✅ verificado con tests · 🚧 en curso · ⏳ pendiente

Una funcionalidad se marca ✅ sólo cuando tiene tests automatizados que pasan contra PostgreSQL real.

## Etapa 0 — Cimientos ✅
- Monorepo, configuración, documentación de arquitectura y ADRs.
- `packages/domain`: dinero, máquina de estados de tickets, resolución de etapas de precio, firma QR Ed25519, TOTP.
- `packages/db`: esquema núcleo, migraciones, RLS, Postgres embebido para desarrollo y tests.
- `apps/api`: configuración validada, errores uniformes, OpenAPI, healthcheck.

**Criterios de aceptación**
- `npm run typecheck` y `npm test` pasan desde la raíz.
- Las migraciones se aplican sobre una base vacía.
- El rol de la aplicación no puede leer ni escribir datos de otra organización (test de aislamiento).

## Etapa 1 — Identidad, organizaciones y motor de entradas ✅ (núcleo) · 🚧 MFA, verificación de email, recuperación de contraseña
- Registro, login, logout, sesiones revocables, rate limit en auth.
- Organizaciones, membresías y roles (owner, admin, manager, finance, sales, access_staff, viewer).
- ✅ Venues, eventos (borrador → publicado), tipos de entrada, etapas de precio, ajuste de capacidad.
- 🚧 Endpoints de sectores, edición y cancelación de eventos (las tablas y estados ya existen).
- Catálogo público de eventos publicados.
- Reservas temporales de stock (hold) con expiración y liberación automática.
- Emisión de cortesías (tickets sin pago, sólo por roles autorizados) con QR firmado.
- “Mis entradas” del comprador, historial de operaciones del ticket, auditoría.

**Criterios de aceptación**
- Nunca se reserva más stock que la capacidad: 50 reservas concurrentes sobre 10 lugares → exactamente 10 exitosas.
- Una reserva vencida devuelve su stock.
- Un QR alterado o de una versión anterior del ticket es rechazado.
- Un usuario sin rol suficiente recibe 403. Otra organización recibe 404 (no se filtra la existencia).

## Etapa 2 — Checkout y pagos reales ⏳
Órdenes con idempotencia. Mercado Pago (Checkout Pro y API de pagos, verificación de webhooks
con firma y consulta del pago). Transferencias bancarias con validación manual y conciliación por CBU/monto/referencia.
Macroclick (requiere convenio y credenciales del banco). Emisión de tickets sólo con pago verificado.
App `web` (marketplace) con Next.js.

## Etapa 3 — Lintick Business 🚧
✅ Hecho y probado (tests + navegador): alta de productora, resumen con ocupación, asistente de evento
(datos → lugar → entradas con etapas → revisar/publicar), gestión del evento (publicar, editar, cancelar con
anulación de entradas y liberación de reservas), tipos de entrada (capacidad, ocultar, etapas: agregar y editar
precio sólo si no vendió), cortesías, asistentes con búsqueda, equipo y roles.
✅ Compra pública rediseñada: hoja de compra (abajo en celular, lateral en escritorio) con cotización del servidor
y comisión de Lintick (10% por defecto, acordable por productora) que se descuenta a la productora: el comprador paga sólo el precio de la entrada.
⏳ Falta:
Panel con eventos, entradas, sectores, cupones, promociones, RRPP y vendedores con links trackeados,
cortesías e invitados, colaboradores y permisos, estadísticas básicas.

## Etapa 4 — Titularidad y mercado secundario ⏳
Transferencias, reventa oficial con precio tope, Ticket Swap con intercambio bilateral transaccional,
lista de espera, cola virtual anti-bots.

## Etapa 5 — Lintick Access ⏳
PWA offline, manifiestos firmados, escaneo QR/DNI, reingresos, puertas y sectores, ocupación en tiempo real,
alertas de capacidad, acreditaciones. Protocolo de molinetes y lectores RFID/NFC con simuladores (sin afirmar
integración con hardware que no se haya probado).

## Etapa 6 — Finanzas ⏳
Cuenta corriente por organizador, comisiones configurables, liquidaciones programadas, devoluciones
parciales y totales, contracargos, facturación electrónica ARCA (WSAA + WSFEv1, requiere certificado), reportes.

## Etapa 7 — White Label, CRM y marketing ⏳
Dominios personalizados con verificación DNS, temas por marca, CRM, segmentos, campañas por email/WhatsApp
(proveedores con credenciales), carritos abandonados, automatizaciones.

## Etapa 8 — Precios dinámicos, festivales, B2B, analytics ⏳
Motor de reglas con límites, simulación y aprobación manual. Multiescenario, grilla de artistas, camping,
parking, cashless, venta corporativa con cotizaciones, panel multievento.
