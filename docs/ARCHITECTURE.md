# Lintick — Arquitectura

Documento vivo. Las decisiones puntuales con sus alternativas están en `docs/adr/`.

## 1. Arquitectura general

Lintick es **un solo núcleo (core) con cuatro productos encima**:

```
               ┌───────────────┐ ┌────────────────┐ ┌──────────────┐ ┌──────────────────┐
  Productos    │ Lintick (web)   │ │ Lintick Business │ │ Lintick Access │ │ WHITE LABEL      │
               │ marketplace   │ │ panel admin    │ │ PWA offline  │ │ = apps/web por   │
               │ + checkout    │ │                │ │ escaneo/sync │ │   dominio/brand  │
               └──────┬────────┘ └───────┬────────┘ └──────┬───────┘ └────────┬─────────┘
                      └──────────────────┴────── HTTPS / JSON (OpenAPI) ──────┘
                                         │
               ┌─────────────────────────▼───────────────────────────────┐
  Core         │ apps/api — monolito modular (Fastify)                   │
               │ auth · orgs · events · inventory · orders · payments ·  │
               │ tickets · resale · swap · access · crm · pricing · b2b  │
               │ analytics · finance · audit · webhooks                  │
               ├─────────────────────────────────────────────────────────┤
               │ packages/domain — reglas de negocio puras, sin I/O      │
               │ packages/db     — esquema, migraciones, RLS             │
               └─────────────┬─────────────────────────────┬─────────────┘
                             │                             │
                      PostgreSQL (fuente de verdad,   Worker (mismo código,
                      RLS por organización, cola       otro entrypoint): expiración
                      de trabajos)                     de reservas, conciliación,
                                                       liquidaciones, notificaciones
```

**Monolito modular, no microservicios.** Un equipo chico con un dominio muy transaccional
(stock, pagos, titularidad) gana más con transacciones ACID locales que con consistencia
eventual entre servicios. Cada módulo tiene límites explícitos (sus tablas, su servicio,
sus rutas) para poder extraerlo si un día lo exige la escala (el candidato natural es
`access`, por el volumen de escaneos en festivales).

**White Label no es una app aparte**: es `apps/web` resolviendo `Host → domain → brand →
organization`. Una sola base de código, temas y catálogo por marca, aislamiento por RLS.

## 2. Stack tecnológico

| Capa | Elección | Por qué |
|---|---|---|
| Lenguaje | TypeScript en todo el repo | Tipos compartidos entre API, panel y apps; un solo lenguaje para el equipo. |
| Runtime | Node.js 24 LTS con *type stripping* nativo | Ejecuta `.ts` sin transpilar ni bundler en el backend; `tsc --noEmit` hace el chequeo de tipos. |
| Monorepo | npm workspaces | Viene con Node; no requiere instalar otra herramienta (pnpm/Turbo se pueden sumar sin reestructurar). |
| API HTTP | Fastify 5 + Zod 4 + `@fastify/swagger` | Alto rendimiento en picos de venta, esquemas validados que generan OpenAPI automáticamente. Sin decoradores ni DI “mágica”. |
| Base de datos | PostgreSQL 17 | Transacciones serializables, `SELECT … FOR UPDATE`, Row Level Security, JSONB, índices parciales. |
| Acceso a datos | Drizzle ORM + `pg` | SQL explícito y tipado; las operaciones críticas (stock) se escriben como SQL atómico, sin que el ORM las oculte. |
| Colas | PostgreSQL (tabla de trabajos con `FOR UPDATE SKIP LOCKED`) | Una sola dependencia con estado al inicio. Redis se agrega cuando haga falta para rate limiting distribuido. |
| Frontend web y panel | Next.js (App Router) | SSR/SEO para el marketplace y los sitios white label. Entra en la etapa 2. |
| Access | PWA offline-first (IndexedDB + Service Worker) | Funciona en cualquier Android, sin pasar por tiendas de apps; valida firmas QR sin red. |
| Tests | Vitest + PostgreSQL real (embebido) | Los tests de stock y aislamiento corren contra Postgres de verdad, no contra mocks. |
| Criptografía | `node:crypto` (scrypt, Ed25519, HMAC, AES-256-GCM) | Sin dependencias nativas; primitivas estándar auditadas. |

Excluido por decisión de producto: cualquier servicio o API de IA. Recomendaciones,
precios dinámicos y segmentación se resuelven con reglas deterministas y estadística.

## 3. Estructura de carpetas

```
Lintick/
├─ apps/
│  ├─ api/                 Core HTTP API + worker (entrypoints separados)
│  │  └─ src/
│  │     ├─ app.ts         composición: plugins, módulos, OpenAPI
│  │     ├─ main.ts        servidor HTTP
│  │     ├─ worker.ts      procesos de fondo
│  │     ├─ config.ts      variables de entorno validadas con Zod
│  │     ├─ lib/           errores, db/tenancy, seguridad
│  │     └─ modules/<m>/   routes.ts · service.ts · schemas.ts (por módulo)
│  ├─ web/                 (etapa 2) marketplace + white label
│  ├─ business/            (etapa 3) panel de productoras
│  └─ access/              (etapa 5) PWA de control de accesos
├─ packages/
│  ├─ domain/              reglas puras: estados de ticket, precios, firma QR, TOTP, dinero
│  └─ db/                  esquema Drizzle, migraciones SQL, políticas RLS, Postgres de desarrollo
├─ infra/                  docker-compose, scripts operativos
└─ docs/                   arquitectura, ADRs, roadmap, criterios de aceptación
```

## 4. Modelo de datos (núcleo)

Identidad global, todo lo demás pertenece a una organización (`organization_id`):

```
users ─< sessions
users ─< memberships >─ organizations ─< brands ─< domains
                              │
                              ├─< venues
                              ├─< events ─< sectors
                              │      └─< ticket_types ─< price_stages
                              ├─< holds ─< hold_items          (reserva temporal de stock)
                              ├─< orders ─< order_items        (etapa 2: pagos)
                              ├─< tickets ─< ticket_events     (historial inmutable)
                              └─< audit_logs
```

Reglas clave:
- **Dinero** en `bigint` de centavos y moneda ISO explícita. Nunca `float`.
- **Stock** en `ticket_types.capacity / sold / held`, con la invariante `sold + held ≤ capacity`
  verificada por un `CHECK` en la base y por una actualización atómica condicional.
- **Ticket**: UUID interno, `version` que se incrementa con cada cambio de titularidad
  (transferencia, reventa, swap). El QR firmado incluye la versión, así un QR viejo deja de ser válido.
- **Historial**: `ticket_events` y `audit_logs` son de solo inserción (el rol de la app no tiene `UPDATE`/`DELETE`).

## 5. Relaciones entre módulos

```
auth ──► organizations ──► events ──► inventory(holds) ──► orders ──► payments
                                            │                 │           │
                                            ▼                 ▼           ▼
                                       pricing(dyn)        tickets ◄── finance(liquidaciones,
                                                          │   │  │       comisiones, ARCA)
                                              resale ◄────┘   │  └──► access(scan, offline)
                                              swap   ◄────────┘
crm/marketing, analytics: leen eventos de dominio (outbox), no escriben en otros módulos.
```
Un módulo nunca escribe tablas de otro: llama a su servicio. Los efectos secundarios
(emails, webhooks, analítica) salen por una tabla **outbox** dentro de la misma transacción.

## 6. Estrategia multi-tenant

**Base compartida, esquema compartido, `organization_id` en cada fila y PostgreSQL Row Level Security.**

- La API se conecta con el rol `venti_app` (sin `BYPASSRLS`, no es dueño de las tablas).
  Las migraciones corren con el rol dueño. Todas las tablas tenant tienen `FORCE ROW LEVEL SECURITY`.
- Cada operación abre una transacción y fija `app.org_id` / `app.user_id` con
  `set_config(..., true)` (alcance de transacción, seguro con pool de conexiones).
- Políticas: escritura sólo si `organization_id = venti_org()`. Lectura adicional para el
  catálogo público (eventos publicados) y para el comprador sobre lo propio (`owner_user_id = venti_user()`).
- El servidor decide el contexto de organización, nunca el cliente: en el checkout se
  resuelve `evento → organización` del lado del servidor.
- Los procesos que cruzan organizaciones (expirar reservas) usan funciones
  `SECURITY DEFINER` acotadas y auditadas, no un rol con bypass general.
- Esto es **defensa en profundidad**: si un servicio olvida un filtro, la base igual impide la fuga.
  Hay tests de aislamiento que lo verifican.

## 7. Seguridad

- Contraseñas: scrypt (N=2^15, r=8, p=1) con sal por usuario y comparación en tiempo constante.
- Sesiones: token opaco de 256 bits. En la base se guarda sólo su SHA-256. Cookie `HttpOnly; Secure; SameSite=Lax`
  para web y `Authorization: Bearer` para apps. Rotación, revocación y expiración absoluta e inactiva.
- MFA: TOTP (RFC 6238) con secreto cifrado AES-256-GCM. Obligatorio para roles financieros y owner (etapa 1b).
- QR de tickets: firma **Ed25519**. Access verifica offline con la clave pública: un dispositivo
  comprometido no puede fabricar entradas.
- Rate limiting por IP y por usuario. Protección anti-bots en el checkout: cola virtual + límites por cuenta
  + desafío (etapa 4). El DDoS de capa 3/4 se delega al CDN/WAF (Cloudflare) en producción.
- Doble compra: claves de idempotencia en órdenes, restricciones únicas, transacciones.
- Pagos: un pago sólo se confirma tras consultar la API del proveedor. Un webhook por sí solo no confirma nada.
- Datos personales (Ley 25.326): minimización, cifrado de DNI en reposo, exportación y borrado a pedido.
- Auditoría: `audit_logs` de solo inserción para toda acción administrativa y financiera.

## 8. Escalabilidad

- Lo crítico son los picos de salida a la venta. El stock se descuenta con un `UPDATE` atómico de una sola
  fila (sin locks largos). La cola virtual (etapa 4) limita la concurrencia de entrada al checkout.
- La API no guarda estado entre requests y escala horizontalmente. PostgreSQL usa réplicas de lectura para
  catálogo y analítica, y PgBouncer en modo transaction (compatible con `set_config(..., true)`).
- Catálogo público cacheable en CDN (SSR + revalidación).
- Analítica: agregados incrementales; ClickHouse se evalúa sólo si el volumen lo justifica.
- Access: los dispositivos descargan el manifiesto del evento y operan offline. La sincronización es
  idempotente (cada escaneo tiene un UUID generado en el dispositivo).

## 9. Roadmap

Ver `docs/ROADMAP.md`.

## 10. Criterios de aceptación

Ver `docs/ROADMAP.md`: cada etapa lista criterios verificables por tests.
