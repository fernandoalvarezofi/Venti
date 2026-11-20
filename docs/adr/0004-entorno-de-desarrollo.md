# ADR 0004 — Entorno de desarrollo y herramientas

**Estado:** aceptada · 2026-11-19

## Contexto
Máquina de desarrollo con Windows 11, Node 24 y Docker Desktop instalado, pero sin WSL, así que el motor de
contenedores no arranca. Tampoco hay permisos de administrador para activar pnpm vía corepack.

## Decisiones
- **npm workspaces** en lugar de pnpm/Turborepo: vienen con Node y cubren lo necesario hoy.
  Migrar a pnpm es trivial si el monorepo crece.
- **PostgreSQL real embebido** (`embedded-postgres`, binarios oficiales) para desarrollo y tests,
  fijado en **PostgreSQL 17**. Con 18.7 en Windows, `initdb` termina con una violación de acceso (0xC0000005)
  en la fase post-bootstrap. El cluster se inicializa con `--encoding=UTF8 --locale=C` porque, si no,
  Windows impone WIN1252. Producción usará PostgreSQL 17 administrado. `infra/docker-compose.yml` queda como alternativa.
- **TypeScript ejecutado nativamente por Node 24** (*type stripping*). Se exige `erasableSyntaxOnly`:
  nada de `enum`, `namespace` ni parameter properties. Los imports relativos llevan extensión `.ts`.
  `tsc -b` sólo chequea tipos.
- **Vitest** contra Postgres real. La suite corre en serie (`fileParallelism: false`) porque comparte una base.

## Consecuencias
Sin paso de build para el backend. Un desarrollador nuevo sólo necesita Node 24: `npm install`, `npm run db:start`, `npm run dev:api`.
