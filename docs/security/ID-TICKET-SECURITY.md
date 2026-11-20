# LinTICK ID & TICKET SECURITY — Auditoría y diseño

Estado: **diseño propuesto, sin implementar**. Fecha: 2026-11-20. Base auditada: commit `59410c7`.

Este documento no afirma que nada sea seguro. Cada afirmación sobre el sistema actual lleva su evidencia
(archivo:línea o test). Cada control propuesto lleva la prueba automatizada que debe demostrarlo antes de darlo
por cumplido.

---

## 0. Alcance y método

- **Qué se revisó:** código de `apps/api`, `packages/domain`, `packages/db` (esquema, migraciones 0000–0003, RLS),
  `apps/web` (flujos de compra, entradas, panel) y la suite de tests (62 tests, PostgreSQL real).
- **Qué NO se hizo:** pentest, revisión de infraestructura de Vercel/Supabase, análisis de dependencias,
  pruebas de carga. Nada de esto respalda afirmaciones de seguridad en este documento.
- **Principio rector:** *un QR dinámico prueba que alguien tiene acceso a una credencial vigente; no prueba quién es.*
  Identidad, posesión y vigencia son tres cosas distintas y se controlan por separado.

---

## 1. Auditoría del estado actual

### 1.1 Qué existe (con evidencia)

| Área | Existe | Evidencia |
|---|---|---|
| Cuentas | Email + contraseña (scrypt), bloqueo tras 10 fallos, rate limit en auth | `apps/api/src/lib/crypto.ts`, `modules/auth/routes.ts:84`; tests `auth.test.ts` (bloqueo, 429) |
| Sesiones | Token opaco 256 bits, sólo se guarda el SHA-256, revocables, `logout-all` | `auth/routes.ts:40-60`, `schema.ts` (`sessions`) |
| MFA | Algoritmo TOTP (RFC 6238) probado con vectores oficiales | `packages/domain/src/totp.ts`; `domain.test.ts` |
| Aislamiento | RLS forzado en las 17 tablas, rol sin `BYPASSRLS` | `migrations/0001_rls.sql`, `0002_hardening.sql`; `rls.test.ts` |
| Tickets | Estados `valid/locked/used/void/cancelled/refunded`, máquina de transiciones | `domain/src/tickets.ts`; `domain.test.ts` |
| QR | Firma Ed25519 sobre `V1.ticketId.version.eventId` | `domain/src/qr.ts`; tests de alteración y de clave ajena |
| Rotación de QR | El titular sube `qr_version`; el QR anterior queda rechazado **online** | `tickets/routes.ts:230`; test "outdated_qr" en `ticketing.test.ts` |
| Check-in | Online, `SELECT … FOR UPDATE` sobre el ticket, primer escaneo gana | `tickets/routes.ts:264-287`; test "already_used" |
| Historial | `ticket_events` y `audit_logs` sin `UPDATE/DELETE` para la app | `0001_rls.sql:20`; `rls.test.ts` ("solo inserción") |
| Stock | Sin sobreventa bajo concurrencia | `ticketing.test.ts` (50 reservas concurrentes → 10) |
| Permisos | Roles por organización; `access_staff` sólo puede escanear; no ve asistentes | `domain/src/roles.ts:24-27`; `business.test.ts` |

### 1.2 Qué falta

| Pieza | Situación actual |
|---|---|
| Verificación de email | El campo `email_verified_at` existe y **nunca se completa**. No hay flujo. |
| Teléfono | No existe. |
| MFA en cuentas | Sólo el algoritmo; no hay endpoints de alta, verificación ni recuperación. `sessions.mfa_verified` siempre `false`. |
| Titular separado del comprador | `tickets.owner_user_id` mezcla "quién controla" y "quién entra". No hay asignación por entrada. |
| Reclamo de entradas emitidas a un email sin cuenta | Quedan con `owner_user_id = NULL` para siempre (`tickets/routes.ts:108`, `:132`). No hay "reclamar". |
| Órdenes y pagos | La tabla `orders` existe; no hay emisión por compra. Hoy sólo se emiten cortesías. |
| Transferencias | No existen (sólo los estados `locked`/`void` y la columna `previous_ticket_id`). |
| Reventa oficial | No existe. |
| QR que cambie con el tiempo | No existe: el QR es fijo hasta que el titular lo rota a mano. |
| Validación offline | Sólo la verificación de firma en el dominio. No hay manifiesto, clave pública distribuida ni sincronización. |
| Registro de escaneos | No hay tabla `scans`: el ingreso se guarda como un `ticket_event`. No hay reingresos, salidas ni conflictos. |
| Dispositivos | `deviceId` y `gate` son texto libre que manda el cliente (`tickets/routes.ts:250`). No hay enrolamiento. |
| Alcance del personal | Quien tiene `access.scan` puede escanear **cualquier evento** de la organización, en cualquier momento. |
| Auditoría a prueba de manipulación | Sólo "sin UPDATE/DELETE para la app". Sin encadenamiento por hash ni anclaje externo. |
| Rate limiting distribuido | En memoria por instancia: en Vercel cada instancia tiene su contador (`docs/DEPLOY.md`, limitaciones). |

### 1.3 Hallazgos que deben corregirse (ordenados por severidad)

> Severidad estimada por impacto y facilidad; no hay explotación demostrada en producción.

**H1 — Alta. Secuestro de cortesías registrando un email ajeno.**
Al emitir una cortesía, el ticket se asigna a la cuenta cuyo email coincide (`tickets/routes.ts:108`),
pero las cuentas se crean **sin verificar el email** (`auth/routes.ts:90-115`). Un atacante que registre antes
`invitado@ejemplo.com` recibe en su cuenta las entradas emitidas a ese email.
*Corrección:* nunca vincular por email no verificado. Las emisiones a un email generan una **invitación de reclamo**
que sólo se acepta con email verificado (o enlace de un solo uso enviado a ese email).
*Prueba requerida:* "una cortesía emitida a X no aparece en una cuenta X no verificada; sí tras verificar".

**H2 — Alta. El QR es una credencial al portador reutilizable.**
El contenido del QR no depende del tiempo (`domain/src/qr.ts`). Una captura funciona en la puerta hasta que la entrada
se use o el titular rote el QR, y la rotación sólo protege online: un escáner offline que verifique firma aceptaría
la versión vieja si su manifiesto está desactualizado.
*Corrección:* credencial ligada al dispositivo con código de 30 s (ver §4.3). La captura deja de servir en segundos.

**H3 — Media. DNI en texto plano y buscable.**
`tickets.holder_document` se guarda en claro (`schema.ts:393`) y el panel lo busca con `ILIKE`
(`business/routes.ts:440`). Contradice lo prometido en `ARCHITECTURE.md §7` (cifrado del DNI).
*Corrección:* guardar HMAC con pimienta por organización + últimos 3 dígitos; búsqueda por igualdad exacta del HMAC.

**H4 — Media. Personal de acceso sin alcance ni dispositivo.**
`access.scan` vale para todos los eventos de la organización (`roles.ts:27`), sin ventana horaria, y el
dispositivo/puerta los declara el cliente (`tickets/routes.ts:250`, `:285`). Un empleado de un evento puede validar
entradas de otro, y el registro no permite saber desde qué equipo se escaneó.
*Corrección:* asignaciones de personal por evento/puerta/turno y dispositivos enrolados con clave propia.

**H5 — Media. Enumeración de cuentas en el registro.**
`email_taken` (`auth/routes.ts:107`) confirma si un email tiene cuenta. El login ya iguala respuestas; el registro no.
*Corrección:* el registro responde siempre igual y la confirmación llega por email.

**H6 — Media. Límites por persona evadibles.**
"Una reserva activa por usuario y evento" y "máx. 20 por compra" (`inventory/service.ts`) son por **cuenta**.
Con varias cuentas se evaden. Sin teléfono verificado ni titulares nominales no hay forma de limitar por persona.

**H7 — Media. Auditoría alterable fuera de la app.**
La app no puede modificar `audit_logs`, pero el rol dueño (con `BYPASSRLS`) sí, y no queda rastro. La app además
puede insertar cualquier `actor_user_id` (no se valida contra `venti_user()`).
*Corrección:* cadena de hashes calculada **en la base** (trigger) + anclaje periódico fuera de Supabase + actor
validado por la base.

**H8 — Media. Rate limiting no efectivo en serverless.** Ver §1.2. Afecta fuerza bruta, scraping de la cotización y bots.

**H9 — Baja. Sesiones largas sin visibilidad.**
30 días (`config.ts`), sin listado de sesiones/dispositivos para el usuario y sin reautenticación para acciones
sensibles (transferir, revender, cambiar email).

**H10 — Baja. Clave de firma sin identificador ni rotación.**
Una sola clave privada en una variable de entorno; el QR no indica qué clave lo firmó (`V1` sin `kid`).
Rotarla invalida todas las entradas emitidas.

**H11 — Baja (abuso interno). Cortesías sin límites ni aprobación.**
Un `manager` puede emitir cortesías hasta agotar el stock (`tickets/routes.ts`); queda auditado pero no limitado.

---

## 2. Principios de diseño

1. **Separar identidad, posesión y vigencia.**
   - *Identidad:* quién es la persona (nivel de garantía declarado y verificado).
   - *Posesión:* qué dispositivo tiene la credencial (clave ligada al dispositivo).
   - *Vigencia:* si la entrada sigue siendo válida (estado + época de credencial).
2. **Niveles de garantía de identidad (IAL), no un único "verificado":**

   | Nivel | Qué significa | Cómo se obtiene |
   |---|---|---|
   | IAL0 | Cuenta creada | Registro |
   | IAL1 | Controla el email | Enlace de un solo uso |
   | IAL2 | Controla un teléfono | Código SMS/WhatsApp (proveedor con credenciales) |
   | IAL3 | DNI declarado y coincidente al ingresar | El titular declara su DNI; en la puerta el personal ve nombre + últimos 3 dígitos y compara con el documento físico |
   | IAL4 | DNI validado contra fuente oficial | **Opcional**, sólo para eventos de alto riesgo, vía proveedor habilitado (p. ej. RENAPER a través de un intermediario). Nunca biometría obligatoria. |

   Cada evento elige el nivel mínimo exigido por tipo de entrada. Por defecto: IAL1 para comprar, IAL0 para recibir.
3. **Minimización de datos.** El DNI es opcional salvo que el evento lo exija. Se guarda como HMAC + últimos 3.
   Nada de fotos, selfies ni datos biométricos.
4. **Todo cambio de titularidad es una reemisión.** El ticket viejo pasa a `void` y nace uno nuevo con credencial nueva.
   Nunca se "edita" el titular de un ticket vigente.
5. **La base de datos es la última línea.** Invariantes críticos con restricciones, índices únicos parciales,
   transacciones y triggers, no sólo en el código.
6. **Offline es un modo degradado explícito**, con riesgos residuales medidos y conciliación obligatoria.

---

## 3. Modelo de dominio

```
Cuenta (users) ──controla──▶ Ticket ◀──es titular── Titular (holder)
   │                           │                      │
   │ compra                    │ credencial            └─ puede ser una cuenta o un nombre+email
   ▼                           ▼                          pendiente de reclamo
 Orden ───emite───▶ Ticket ──▶ Credencial (época N, ligada a dispositivo)
                                │
                                ▼
                          Escaneo (scan) ── en ── Puerta ── por ── Dispositivo enrolado + Personal asignado
```

- **Comprador (cuenta pagadora):** quien paga la orden. Responsable ante contracargos.
- **Controlador:** cuenta que gestiona el ticket en la app (asignar, transferir, revender). Inicialmente el comprador.
- **Titular:** persona que entra. En entradas nominativas debe coincidir con quien se presenta.
- **Asistente:** titular que efectivamente ingresó (existe un `scan` admitido).
- **Credencial:** lo que se presenta en la puerta (QR dinámico, QR estático impreso o, más adelante, NFC/pulsera).

---

## 4. Diseño por componente

### 4.1 Cuenta y protección de cuentas

- Verificación de email obligatoria para comprar, recibir transferencias y reclamar entradas (corrige H1).
- Registro sin enumeración: misma respuesta siempre; el email informa "ya tenés cuenta" (corrige H5).
- MFA TOTP opcional para compradores y **obligatorio** para `owner`, `admin` y `finance`.
  Códigos de recuperación de un solo uso (hash). Protección contra reuso (`mfa_last_counter`, ya existe).
- **Reautenticación reciente** (≤ 10 min, contraseña o TOTP) para: transferir, revender, cambiar email/teléfono,
  desactivar MFA, ver datos de asistentes en lote.
- Sesiones: TTL absoluto 30 d + inactividad 7 d; rotación del token al elevar privilegio; listado de sesiones con
  dispositivo aproximado y "cerrar esta sesión".
- Rate limiting distribuido (Postgres o Redis/Upstash) por IP, por cuenta y por email objetivo (corrige H8).
- Detección de credential stuffing: muchos emails distintos desde la misma IP → desafío o bloqueo temporal.
- Notificaciones por email ante: nuevo dispositivo, cambio de contraseña, transferencia enviada/recibida, reventa.

### 4.2 Titulares y asignación de entradas grupales

- Cada ticket tiene **un** titular. Una compra de 4 entradas genera 4 tickets con el comprador como titular
  provisional y estado de asignación `unassigned` cuando el tipo de entrada es nominativo.
- El comprador asigna cada entrada: a sí mismo, a una cuenta existente (por email verificado) o a un nombre + email
  que recibe una **invitación de reclamo** (enlace de un solo uso, vence a las 72 h o al inicio del evento).
- Hasta que el invitado reclama, la credencial vive en la cuenta del comprador y la puerta muestra "titular pendiente".
- Si el evento exige IAL3, la asignación pide DNI. Se guarda HMAC + últimos 3. Cambiar el titular reemite el ticket.
- Límite por persona (corrige H6 parcialmente): máximo N entradas por **titular** (HMAC de DNI o teléfono verificado)
  por evento, no sólo por cuenta. Sin esos datos, el límite sigue siendo por cuenta, y eso se documenta como residual.

### 4.3 Credencial y QR dinámico

**Credencial ligada al dispositivo (recomendada):**

1. Al ver la entrada por primera vez, el navegador o la app genera un par de claves ECDSA P-256 **no exportable**
   (WebCrypto / Keystore) y registra la clave pública como *dispositivo de credencial* del ticket.
   Un ticket admite **un** dispositivo activo; cambiarlo exige reautenticación y queda auditado.
2. El QR se compone en el teléfono cada 30 s:
   `V2.<kid>.<ticketId>.<epoch>.<ts>.<firmaServidor>.<firmaDispositivo>`
   - `firmaServidor` (Ed25519, `kid` identifica la clave): cubre `ticketId.epoch.eventId.devicePubKeyHash`.
     Se obtiene online y se guarda en el teléfono.
   - `firmaDispositivo` (ECDSA del teléfono): cubre `ticketId.epoch.ts`.
3. El escáner verifica: firma del servidor con la clave pública del evento, `devicePubKeyHash` contra el manifiesto,
   firma del dispositivo con esa clave, `|ahora − ts| ≤ 45 s` y `epoch` igual al del manifiesto.
4. **Qué mitiga:** capturas (vencen en 45 s), copiar el QR a otro teléfono (la clave no es exportable) y la
   reutilización de versiones viejas (la época está en el manifiesto).
5. **Qué NO mitiga:** quien tiene el teléfono desbloqueado del titular entra; un teléfono rooteado puede extraer la
   clave. Por eso, en entradas nominativas, la puerta además muestra nombre + últimos 3 del DNI.

**Fallback sin teléfono compatible:** QR estático `V2` sin firma de dispositivo, marcado como `static`.
La puerta exige comparar documento (IAL3) o lo rechaza si el tipo de entrada lo prohíbe.

**Rotación de claves del servidor:** `kid` en el QR; el manifiesto trae todas las claves públicas vigentes del evento.
Una clave comprometida se revoca y se fuerza nueva época a los tickets firmados con ella (corrige H10).

### 4.4 Transferencias atómicas

- Estados: `pending` → `accepted` → `completed` | `cancelled` | `expired` | `rejected`.
- Al iniciar: el ticket pasa a `locked` (no se puede escanear, revender ni transferir otra vez) dentro de la misma
  transacción que crea la transferencia. **Índice único parcial**: una sola transferencia `pending` por ticket.
- Al aceptar (destinatario con email verificado), una transacción `SERIALIZABLE`:
  1. `SELECT … FOR UPDATE` del ticket y de la transferencia;
  2. verifica `ticket.status = 'locked'` y `transfer.status = 'pending'` y que no venció;
  3. ticket viejo → `void`; ticket nuevo `valid` con `previous_ticket_id`, nuevo titular, época 1, sin dispositivo;
  4. transferencia → `completed`; eventos de ticket y auditoría.
  Si cualquier paso falla, no cambia nada.
- Cancelar o vencer devuelve el ticket a `valid` (`unlock`).
- **Ventana de corte:** no se permiten transferencias en las últimas *X* horas antes del evento (configurable), para
  que los manifiestos offline no queden desactualizados.
- Idempotencia: `Idempotency-Key` por solicitud; reintentos devuelven el mismo resultado.
- Riesgo de fraude: un comprador que transfiere y después contracarga. Mitigación: las entradas compradas en las
  últimas *N* horas o con pago marcado de riesgo no se pueden transferir hasta que el pago se acredite y pase la
  ventana configurada. Residual documentado.

### 4.5 Reventa oficial

- Publicación: el ticket pasa a `locked` y se crea un `resale_listing` (`listed`) con precio ≤ tope.
  El tope es el precio pagado × (1 + margen permitido por la productora), con 0% por defecto.
- Compra: la orden del comprador reserva el listing (`reserved`, con vencimiento); al acreditarse el pago, en una
  transacción: ticket viejo `void`, ticket nuevo al comprador, listing `sold`, liquidación pendiente al vendedor.
- El vendedor cobra **después** del evento o tras la ventana de contracargo (configurable): así se evita revender y
  después anular el pago original.
- La reventa fuera de LinTICK no se puede impedir, pero no sirve: las capturas vencen (§4.3) y la transferencia exige
  cuenta verificada.

### 4.6 Control de acceso: online, offline y concurrencia

**Online:** se mantiene el `FOR UPDATE` actual y se agrega:
- tabla `scans` con `id` generado por el dispositivo (UUID v7), `UNIQUE (id)` para reintentos idempotentes;
- **índice único parcial** `(ticket_id) WHERE result = 'admitted' AND direction = 'in' AND reentry_seq = 0`, de modo que
  la base rechaza un segundo primer ingreso aunque dos requests pasen el chequeo a la vez;
- política de reingreso por evento: `none` | `with_exit_scan` (requiere escaneo de salida previo) | `unlimited`.

**Offline:**
1. Antes de abrir puertas, cada dispositivo enrolado descarga un **manifiesto firmado** por el servidor:
   claves públicas del evento, y por ticket: `ticketId, epoch, devicePubKeyHash, status, sector, holderName,
   holderDocLast3`. Sólo los sectores asignados a esa puerta.
2. El escáner valida localmente y guarda cada escaneo en una cola cifrada (IndexedDB + clave del dispositivo).
3. Deduplicación local: un ticket admitido en ese dispositivo no vuelve a pasar.
4. Al recuperar conexión, sube los escaneos en lotes firmados por el dispositivo. El servidor los aplica en orden
   de `scanned_at`; el primero gana y los demás quedan como `conflict` con alerta.
5. **Riesgo residual explícito:** dos puertas desconectadas entre sí pueden admitir la misma entrada una vez cada una.
   No se puede impedir sin conexión. Se reduce con: manifiestos particionados por sector/puerta, sincronización cada
   pocos segundos cuando hay red, credenciales de 30 s (una captura no llega a dos puertas a tiempo) y alertas de
   conflicto al supervisor. Se mide como "duplicados por 10.000 ingresos" en cada evento.
6. Reloj: el escáner usa la hora firmada del último manifiesto más el reloj monotónico; si el desvío supera 2 min, se
   bloquea la validación de códigos dinámicos y pasa a modo "verificar documento".

### 4.7 Personal y dispositivos

- `staff_assignments (user, event, gates[], valid_from, valid_until)`: `access.scan` sólo vale dentro de una
  asignación vigente (corrige H4). El rol de organización sigue siendo necesario, pero no alcanza.
- `access_devices`: un dispositivo se enrola escaneando un código de un solo uso generado por un supervisor.
  Genera su par de claves; el servidor guarda la clave pública. Cada lote de escaneos va firmado por el dispositivo.
  Revocar un dispositivo invalida sus lotes futuros y marca para revisión los no sincronizados.
- Doble control para acciones sensibles del personal: deshacer un ingreso, ingreso manual sin credencial y
  modo "sin verificar documento" exigen un supervisor (segundo usuario) y quedan auditados.
- Cortesías: cupo por evento y por usuario emisor. Por encima del cupo, requiere aprobación de un `admin` (corrige H11).

### 4.8 Auditoría inmutable

- `audit_logs` y `ticket_events` pasan a ser una **cadena de hashes por organización**:
  `hash = SHA-256(prev_hash || canonical_json(fila))`, calculado por un trigger `BEFORE INSERT` que toma un
  advisory lock por organización (orden total, sin huecos). Columna `seq` monotónica.
- El trigger completa `actor_user_id` desde `venti_user()` e ignora lo que mande la app (corrige H7, parte app).
- **Anclaje externo:** cada hora, un proceso publica `(org, seq, hash)` en un almacenamiento fuera de Supabase
  con retención bloqueada (object lock). Un cambio hecho con el rol dueño rompe la cadena y se detecta comparando
  contra el ancla.
- Un verificador recorre la cadena y reporta la primera fila inconsistente. Sin anclaje externo, la cadena sólo
  detecta cambios de la app, no los del administrador de la base: está documentado.

---

## 5. Modelo de datos propuesto

> Nuevas tablas con RLS forzado y política tenant, igual que las existentes. Montos en centavos.

**Modificaciones**

```
users           + phone_e164 text, phone_verified_at timestamptz, ial smallint not null default 0,
                + password_changed_at timestamptz
sessions        + device_label text, + idle_expires_at timestamptz, + elevated_until timestamptz,
                + rotated_from uuid
tickets         - holder_document (se migra y elimina)
                + controller_user_id uuid  (hoy owner_user_id; se renombra con vista de compatibilidad)
                + holder_user_id uuid null, holder_doc_hmac bytea null, holder_doc_last3 char(3) null
                + assignment_status ('unassigned'|'pending_claim'|'assigned')
                + credential_epoch int (reemplaza qr_version), credential_kind ('device'|'static')
                + device_pubkey_hash bytea null, device_bound_at timestamptz null
ticket_types    + nominative bool, + min_ial smallint, + transferable bool, + resellable bool,
                + max_per_holder int null
events          + reentry_policy, + transfer_cutoff_minutes int, + resale_markup_bps int default 0,
                + courtesy_quota int null
audit_logs      + seq bigint, prev_hash bytea, hash bytea  (cadena por organización)
ticket_events   + seq bigint, prev_hash bytea, hash bytea
```

**Nuevas tablas**

```
email_verifications   (id, user_id, token_hash, expires_at, used_at)
phone_verifications   (id, user_id, phone_e164, code_hash, attempts, expires_at, used_at)
mfa_recovery_codes    (user_id, code_hash, used_at)
ticket_claims         (id, ticket_id, org_id, email_lower, token_hash, expires_at, claimed_by, claimed_at)
transfers             (id, org_id, ticket_id, from_user_id, to_email_lower, to_user_id, status, expires_at,
                       idempotency_key, new_ticket_id, created_at, completed_at)
                       UNIQUE (ticket_id) WHERE status = 'pending'
resale_listings       (id, org_id, ticket_id, seller_user_id, price_cents, cap_cents, status, reserved_until,
                       buyer_order_id, payout_status, created_at)
                       UNIQUE (ticket_id) WHERE status IN ('listed','reserved')
gates                 (id, org_id, event_id, name, sectors text[])
access_devices        (id, org_id, name, pubkey, enrolled_by, enrolled_at, revoked_at, last_sync_at)
staff_assignments     (id, org_id, user_id, event_id, gate_ids uuid[], valid_from, valid_until, created_by)
scans                 (id uuid PK (del dispositivo), org_id, event_id, ticket_id null, gate_id, device_id,
                       staff_user_id, credential_epoch, direction ('in'|'out'), result, reentry_seq int,
                       scanned_at_device, received_at, offline bool, conflict_of uuid null, batch_sig bytea)
                       UNIQUE (ticket_id) WHERE result='admitted' AND direction='in' AND reentry_seq=0
event_manifests       (id, event_id, gate_id, version, signed_payload_hash, issued_at, expires_at)
signing_keys          (kid, public_key, created_at, retired_at, revoked_at)   — la privada nunca en la base
audit_anchors         (org_id, seq, hash, anchored_at, location)
```

---

## 6. Estados

**Ticket**

```
                 asignar / reclamar (no cambia estado, cambia assignment_status)
   ┌──────────────────────────────────────────────┐
   ▼                                              │
[valid] ──lock (transferir/revender)──▶ [locked] ──unlock (cancelar/vencer)──▶ [valid]
   │                                        │
   │ check_in                                │ completar transferencia / venta
   ▼                                        ▼
 [used] ──undo_check_in (supervisor)──▶ [valid]   [void]  (siempre con sucesor previous_ticket_id)
   │
   └─ reingreso: no cambia estado; se registra en scans (out/in)

[valid|locked] ──cancel (evento cancelado)──▶ [cancelled] ──refund──▶ [refunded]
```

**Transferencia:** `pending → accepted → completed`; `pending → cancelled | expired | rejected` (todas devuelven el
ticket a `valid`).
**Reventa:** `listed → reserved → sold`; `reserved → listed` (vence la reserva); `listed → cancelled | expired`.
**Escaneo (resultado):** `admitted | already_inside | outdated_credential | expired_code | wrong_device |
wrong_event | wrong_gate | invalid_signature | not_valid | holder_mismatch | conflict`.

---

## 7. Procesos clave

**7.1 Transferencia (online, atómica)**

```
Emisor            API                         Base                       Destinatario
  │ POST transfer  │                            │                            │
  │ (reauth+Idem)  │ BEGIN; ticket FOR UPDATE   │                            │
  │───────────────▶│ valid? transferable? fuera │                            │
  │                │ de ventana de corte?       │                            │
  │                │ INSERT transfer(pending)   │ UNIQUE parcial impide 2ª   │
  │                │ ticket → locked; COMMIT    │                            │
  │                │──── email con enlace ─────────────────────────────────▶ │
  │                │                            │       POST accept (IAL1)   │
  │                │ BEGIN SERIALIZABLE; FOR UPDATE ticket+transfer ◀────────│
  │                │ ticket viejo → void; ticket nuevo valid (epoch 1)        │
  │                │ transfer → completed; eventos + auditoría; COMMIT       │
  │                │──── confirmación a ambos ──────────────────────────────▶│
```

**7.2 Ingreso offline y conciliación**

```
Dispositivo (sin red)                                   API (al reconectar)
 lee QR → verifica firmas, ts, epoch, device hash        recibe lote firmado
 → busca en manifiesto → ¿ya admitido localmente?        verifica firma del dispositivo + asignación vigente
 → admite y encola scan(id=UUIDv7)                       INSERT scans ON CONFLICT (id) DO NOTHING (idempotente)
                                                         si viola el índice de primer ingreso → result=conflict,
                                                         alerta a supervisor, se conserva la evidencia de ambos
```

**7.3 Reclamo de una entrada emitida a un email**

```
Emisión ─▶ ticket (assignment_status=pending_claim) + ticket_claims(token_hash) ─▶ email con enlace único
Invitado ─▶ abre enlace ─▶ inicia sesión con ESE email verificado ─▶ BEGIN; claim FOR UPDATE; no usado/no vencido
         ─▶ ticket.holder_user_id/controller_user_id = invitado; claim.used; COMMIT
```

---

## 8. Escenarios de fraude y abuso

| # | Escenario | Hoy | Control propuesto | Riesgo residual | Prueba |
|---|---|---|---|---|---|
| F1 | Compartir capturas del QR | **Funciona** hasta el primer uso o la rotación (H2) | QR de 30 s firmado por el dispositivo | Alguien parado al lado con el teléfono del titular | `qr-v2`: código vencido → `expired_code`; otro dispositivo → `wrong_device` |
| F2 | Compartir la cuenta | Sin control | Un dispositivo de credencial por ticket; cambiarlo exige reautenticación y queda auditado; alerta de nuevo dispositivo | Compartir contraseña **y** desbloquear el teléfono | Rebind sin reauth → 403; rebind → epoch+1, código del viejo dispositivo rechazado |
| F3 | Duplicar el QR (copiar texto/imagen) | Igual que F1 | Igual que F1 + dedupe en base | Duplicado offline en dos puertas (§4.6.5) | Dos escaneos concurrentes del mismo ticket → exactamente un `admitted` |
| F4 | Cambio de titular no autorizado | No existe flujo; cambiar titular no es posible | Sólo por transferencia/asignación con reautenticación; reemisión obligatoria | Robo de sesión con reauth vigente (≤10 min) | Editar holder directo → no hay endpoint; transferencia sin reauth → 403 |
| F5 | Compras masivas para revender | Limitado por cuenta, evadible (H6) | Límite por titular (DNI HMAC/teléfono), IAL1/IAL2 para comprar, cola virtual, rate limit distribuido | Personas reales coordinadas | 3 cuentas con el mismo DNI superan `max_per_holder` → 409 |
| F6 | Transferencias simultáneas del mismo ticket | No aplica aún | `locked` + índice único parcial + `FOR UPDATE` | — | 20 transferencias concurrentes → 1 `pending`, 19 rechazadas; 2 aceptaciones concurrentes → 1 completada |
| F7 | Transferir y escanear a la vez | No aplica aún | `locked` no se puede escanear; aceptar exige `locked` | — | Escaneo de ticket `locked` → `not_valid`; aceptar tras escaneo → 409 |
| F8 | Escaneos concurrentes en dos puertas (online) | `FOR UPDATE` (protegido) | + índice único parcial en `scans` | — | 50 escaneos concurrentes → 1 `admitted` |
| F9 | Puertas sin Internet | No hay modo offline | Manifiesto firmado, dedupe local, conciliación, alertas | Duplicados entre puertas desconectadas (medido) | Simulación de 2 dispositivos offline → 1 admitido + 1 `conflict` al sincronizar |
| F10 | Reloj del escáner manipulado | — | Hora del manifiesto + monotónico; desvío > 2 min bloquea códigos dinámicos | Dispositivo comprometido | Desvío simulado → modo documento |
| F11 | Reenvío de un lote de escaneos | — | Lote firmado + `scan.id` único (idempotente) | — | Reenviar el mismo lote → sin cambios |
| F12 | Empleado escanea en otro evento | **Puede** (H4) | `staff_assignments` por evento/puerta/turno | Colusión dentro del turno | Escaneo fuera de asignación → 403 |
| F13 | Empleado deja pasar sin entrada | Sin control | Ingreso manual requiere supervisor; métrica de ingresos manuales por empleado | Colusión de dos | Ingreso manual sin segundo usuario → 403 |
| F14 | Admin emite cortesías para revenderlas | Sin límite (H11) | Cupo + aprobación + auditoría encadenada | Colusión owner | Cortesía por encima del cupo sin aprobación → 403 |
| F15 | Borrar o alterar la auditoría | Sólo protegida contra la app (H7) | Cadena de hashes + anclaje externo | Alteración antes del anclaje horario | Modificar una fila con rol dueño → el verificador detecta ruptura |
| F16 | Robar cortesías registrando el email | **Funciona** (H1) | Reclamo con email verificado | Acceso al buzón de la víctima | Ver H1 |
| F17 | Contracargo después de transferir/revender | No aplica aún | Retención de transferibilidad, cobro al vendedor diferido | Fraude coordinado de bajo volumen | Transferir con pago < N horas → 409 |
| F18 | Phishing / credential stuffing | Bloqueo por cuenta + rate limit en memoria | Rate limit distribuido, MFA, alertas de nuevo dispositivo | Usuario sin MFA engañado | Login masivo multi-email desde una IP → desafío |
| F19 | SIM swap para tomar la cuenta | No hay teléfono | Teléfono no es factor único de recuperación; recuperación con TOTP o códigos | — | Recuperación sólo por SMS no permitida si hay MFA |
| F20 | Enumeración de usuarios/tickets | Registro enumera (H5); IDs UUID v4 | Respuesta uniforme | — | Registro con email existente → misma respuesta |
| F21 | Exfiltración de datos de asistentes | `tickets.read` ve emails; DNI en claro (H3) | HMAC de DNI, emails enmascarados para `sales`, export con reauth + auditoría | Rol `admin` comprometido | `sales` recibe emails enmascarados |
| F22 | Clave de firma filtrada | Sin `kid` (H10) | `kid`, revocación, nueva época masiva | Ventana hasta revocar | Revocar `kid` → códigos con ese `kid` rechazados |

---

## 9. Privacidad

- **Base legal y finalidad:** la Ley 25.326 exige finalidad y proporcionalidad. El DNI sólo se pide si el evento lo
  justifica (nominativo, edad, seguridad) y se informa al pedirlo.
- **Qué se guarda:** HMAC del DNI con pimienta por organización (permite comparar sin revelar) + últimos 3 dígitos
  para la verificación visual. Nunca la imagen del documento.
- **Retención:** datos de titulares y escaneos se anonimizan a los 180 días del evento (configurable), salvo
  obligación legal. La cadena de auditoría guarda IDs, no datos personales.
- **Acceso por rol:** `access_staff` ve nombre y últimos 3 sólo del ticket escaneado; `sales` ve emails enmascarados;
  exportaciones con reautenticación y auditoría.
- **Derechos del titular:** exportar y borrar (anonimizar) sus datos, excepto lo necesario para obligaciones fiscales.

---

## 10. Pruebas automatizadas requeridas

Todas contra PostgreSQL real, como la suite actual. Un control no se marca hecho sin su prueba en verde.

**Unitarias (dominio)**
- Máquina de estados de ticket, transferencia y reventa: transiciones válidas e inválidas (tabla completa).
- QR V2: firma de servidor, firma de dispositivo, `ts` fuera de ventana, `kid` revocado, época vieja, campos alterados.
- HMAC de DNI: estable por organización, distinto entre organizaciones.
- Pruebas de propiedades (fast-check): ninguna secuencia de operaciones deja dos tickets `valid` encadenados por
  `previous_ticket_id`.

**Integración (API + base)**
- H1: cortesía a email no verificado no aparece en esa cuenta; aparece tras reclamar con email verificado.
- H5: registro con email existente devuelve lo mismo que uno nuevo.
- Transferencias: 20 iniciaciones concurrentes → 1; 2 aceptaciones concurrentes → 1; aceptar vencida → 409;
  transferir dentro de la ventana de corte → 409; reauth faltante → 403.
- Reventa: precio sobre el tope → 422; compra concurrente del mismo listing → 1 venta.
- Escaneo: 50 concurrentes → 1 admitido; reingreso según política; escaneo de `locked` → `not_valid`.
- Personal: fuera de asignación → 403; dispositivo revocado → lote rechazado.
- Auditoría: el trigger completa el actor; modificar una fila con el rol dueño → el verificador lo detecta.
- RLS: las tablas nuevas no se leen ni escriben desde otra organización.

**Offline (simulación)**
- Dos dispositivos con el mismo manifiesto, sin red, escanean el mismo ticket → al sincronizar: 1 `admitted` + 1 `conflict`.
- Reenvío del mismo lote → idempotente. Lote con firma inválida → rechazado completo.
- Desvío de reloj > 2 min → códigos dinámicos rechazados localmente.

**E2E (navegador)**
- Comprar → asignar titular → reclamar → mostrar QR dinámico → escanear con la PWA de Access.
- Captura de pantalla del QR presentada 60 s después → rechazada.

---

## 11. Qué modificar del código actual

| Archivo | Cambio |
|---|---|
| `modules/tickets/routes.ts:108` | Quitar la vinculación por email; generar `ticket_claims` (H1). |
| `modules/auth/routes.ts:90-115` | Registro sin enumeración + verificación de email (H1, H5). |
| `packages/db/src/schema.ts:393` | Reemplazar `holder_document` por HMAC + últimos 3; migración que convierte y borra (H3). |
| `modules/business/routes.ts:440` | Búsqueda por HMAC exacto; enmascarar emails para `sales` (H3, F21). |
| `domain/src/qr.ts` | Formato `V2` con `kid`, época, `ts` y firma de dispositivo; `V1` aceptado sólo durante la migración. |
| `modules/tickets/routes.ts:244-290` | Check-in con `scans`, asignación de personal, dispositivo enrolado, reingreso (H4). |
| `domain/src/roles.ts:27` | `access.scan` condicionado a `staff_assignments`. |
| `migrations` | Cadena de hashes por trigger, actor desde `venti_user()` (H7). |
| `app.ts` (rate limit) | Almacén compartido (H8). |
| `config.ts` | Claves con `kid`; lectura de varias claves públicas (H10). |

---

## 12. Fases de implementación

1. **Correcciones urgentes (sin cambiar experiencia):** H1 (reclamo con email verificado), H5, H3, H7 (trigger de
   actor y cadena), H4 (asignaciones de personal). Cada una con sus pruebas.
2. **Identidad y cuentas:** verificación de email, MFA con recuperación, reautenticación, sesiones visibles,
   rate limit distribuido.
3. **Titulares:** asignación por entrada, entradas nominativas, límite por titular.
4. **Credencial V2:** QR dinámico ligado al dispositivo, `kid`, rotación de claves, fallback estático con documento.
5. **Transferencias atómicas.**
6. **LinTICK Access:** PWA, dispositivos enrolados, manifiestos firmados, offline y conciliación, reingresos.
7. **Reventa oficial** (requiere pagos reales).
8. **Anclaje externo de auditoría** y verificador periódico.

## 13. Decisiones que necesitan al dueño del producto

- Nivel de identidad por defecto para comprar (propuesto: IAL1, email verificado).
- ¿Teléfono obligatorio? (propuesto: opcional; obligatorio sólo si el evento lo exige).
- Margen máximo de reventa (propuesto: 0% por defecto, la productora puede subirlo hasta un tope).
- Ventana de corte de transferencias antes del evento (propuesto: 2 h).
- Política de reingreso por defecto (propuesto: sin reingreso).
- Retención de datos de asistentes (propuesto: 180 días).
- Proveedor para IAL4 (validación contra RENAPER), sólo si algún cliente lo requiere.
