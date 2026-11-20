# VENTI

Plataforma de ticketing para productoras de Argentina y Latinoamérica. Un solo núcleo para cuatro productos:
**VENTI** (marketplace y compra), **VENTI BUSINESS** (panel de productoras), **VENTI ACCESS** (control de accesos)
y **White Label** (ticketera propia con la marca de cada productora).

- Arquitectura: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- Roadmap y criterios de aceptación: [`docs/ROADMAP.md`](docs/ROADMAP.md)
- Decisiones: [`docs/adr/`](docs/adr)

## Requisitos
Node.js 24 o superior. Nada más: PostgreSQL de desarrollo viene embebido.

## Puesta en marcha

```bash
npm install
npm run keys -w @venti/api          # genera QR_SIGNING_PRIVATE_KEY
cp .env.example .env                # completar con la clave generada y las URLs que imprime db:start
npm run db:start                    # PostgreSQL en :54320, aplica migraciones (dejar corriendo)
npm run dev:api                     # API en http://localhost:4000 · documentación en /docs
npm run dev:worker                  # procesos de fondo (expiración de reservas)
```

Si `db:start` se cortó sin Ctrl+C: `npm run stop -w @venti/db`.

## Calidad

```bash
npm run typecheck   # tsc en todo el monorepo
npm test            # dominio + RLS + API contra PostgreSQL real
```

## Estructura

```
apps/api           API HTTP (Fastify) + worker
packages/domain    reglas de negocio puras (estados, precios, QR firmado, TOTP)
packages/db        esquema, migraciones, Row Level Security
docs/              arquitectura, ADRs, roadmap
infra/             docker-compose alternativo
```

## Principios
- Sin servicios de inteligencia artificial: reglas deterministas y estadística.
- Nunca se confirma un pago sin verificarlo con el proveedor.
- Aislamiento por organización garantizado por la base de datos (RLS), no sólo por el código.
- Ninguna funcionalidad se marca como terminada sin tests que la verifiquen.
