# ADR 0003 — QR de tickets firmados con Ed25519

**Estado:** aceptada · 2026-11-19

## Decisión
El contenido del QR es `V1.<ticketId>.<version>.<eventId>.<firma>`, donde la firma es Ed25519 sobre
`V1.<ticketId>.<version>.<eventId>` en base64url. La clave privada vive sólo en el servidor (variable de
entorno o KMS). Los dispositivos de Access reciben la clave pública.

## Por qué no HMAC
Con HMAC, cada escáner necesitaría el secreto, y un dispositivo robado podría fabricar entradas válidas.
Con firma asimétrica, el escáner sólo puede verificar.

## Consecuencias
- Validación offline posible. La detección de duplicados offline se resuelve por dispositivo y se
  reconcilia al sincronizar (primer escaneo gana, los demás quedan como alerta).
- Cambiar de titular incrementa `version`, y el QR anterior deja de validar contra el manifiesto.
- Rotar la clave requiere un `kid`. El formato `V1` lo reserva para `V2`.
