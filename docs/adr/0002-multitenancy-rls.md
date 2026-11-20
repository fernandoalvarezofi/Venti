# ADR 0002 — Multi-tenancy con Row Level Security

**Estado:** aceptada · 2026-11-19

## Decisión
Esquema compartido con `organization_id` y RLS forzado (`FORCE ROW LEVEL SECURITY`). La app usa el rol
`venti_app` sin bypass. El contexto se fija por transacción con `set_config('app.org_id', …, true)`.

## Alternativas descartadas
- **Base por tenant:** aislamiento máximo, pero las migraciones y la analítica cruzada se vuelven
  inviables con cientos de productoras chicas.
- **Esquema por tenant:** mismos problemas de migración y de pool de conexiones.
- **Sólo filtros en la aplicación:** un `WHERE` olvidado alcanza para filtrar datos de otro tenant.

## Consecuencias
Toda consulta tenant debe ejecutarse dentro de `withTenant()`. Los procesos que cruzan organizaciones
usan funciones `SECURITY DEFINER` específicas. Las tablas globales (`users`, `sessions`) no tienen RLS
y sólo las accede el módulo `auth`.
