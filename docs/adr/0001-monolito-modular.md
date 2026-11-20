# ADR 0001 — Monolito modular sobre PostgreSQL

**Estado:** aceptada · 2026-11-19

## Contexto
El dominio central (stock, órdenes, pagos, titularidad de tickets) exige consistencia fuerte.
El equipo inicial es chico y hay cuatro productos que comparten núcleo.

## Decisión
Una sola API (`apps/api`) organizada en módulos con límites explícitos, un solo PostgreSQL.
Los efectos asíncronos salen por outbox transaccional. El worker es otro entrypoint del mismo código.

## Alternativas descartadas
- **Microservicios desde el día uno:** sagas y consistencia eventual en operaciones de dinero y stock,
  costo operativo alto sin necesidad demostrada.
- **NestJS:** buena estructura, pero depende de decoradores y metadata de runtime. Eso complica el
  *type stripping* de Node y los tests con Vitest. Fastify con módulos explícitos da la misma separación con menos magia.
- **Prisma:** abstrae demasiado el SQL en las operaciones críticas de concurrencia y el manejo de RLS por transacción.

## Consecuencias
Despliegue simple y transacciones ACID. Si un módulo (Access) necesita escalar aparte, se extrae
porque ya tiene límites definidos.
