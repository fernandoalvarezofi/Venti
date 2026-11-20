-- ════════════════════════════════════════════════════════════════════════════
-- Aislamiento multi-tenant con Row Level Security (ADR 0002).
-- La API se conecta como `venti_app`: sin BYPASSRLS y sin ser dueña de las tablas.
-- El rol que ejecuta migraciones debe ser superusuario o tener BYPASSRLS.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'venti_app') THEN
    CREATE ROLE venti_app NOLOGIN NOBYPASSRLS;
  END IF;
END
$$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO venti_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO venti_app;
--> statement-breakpoint
-- Historiales de solo inserción.
REVOKE UPDATE, DELETE ON ticket_events, audit_logs FROM venti_app;
--> statement-breakpoint

-- Contexto de la transacción actual. Vacío o ausente → NULL → ninguna política tenant coincide.
CREATE FUNCTION venti_org() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.org_id', true), '')::uuid
$$;
--> statement-breakpoint
CREATE FUNCTION venti_user() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.user_id', true), '')::uuid
$$;
--> statement-breakpoint

-- ─── organizations: perfil público de productoras activas, escritura sólo en contexto propio ───
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE organizations FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY organizations_read ON organizations FOR SELECT TO venti_app
  USING (status = 'active' OR id = venti_org());
--> statement-breakpoint
CREATE POLICY organizations_insert ON organizations FOR INSERT TO venti_app WITH CHECK (id = venti_org());
--> statement-breakpoint
CREATE POLICY organizations_update ON organizations FOR UPDATE TO venti_app
  USING (id = venti_org()) WITH CHECK (id = venti_org());
--> statement-breakpoint

-- ─── Tablas tenant: política base (todo en contexto de la organización) ───
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'memberships','brands','domains','venues','events','sectors','ticket_types','price_stages',
    'holds','hold_items','orders','tickets','ticket_events','audit_logs'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO venti_app USING (organization_id = venti_org()) WITH CHECK (organization_id = venti_org())',
      t || '_tenant', t
    );
  END LOOP;
END
$$;
--> statement-breakpoint

-- ─── Lecturas adicionales (las políticas permisivas se combinan con OR) ───

-- El usuario ve sus propias membresías (para listar “mis organizaciones”).
CREATE POLICY memberships_self_read ON memberships FOR SELECT TO venti_app USING (user_id = venti_user());
--> statement-breakpoint
-- Catálogo público y white label.
CREATE POLICY brands_public_read ON brands FOR SELECT TO venti_app USING (true);
--> statement-breakpoint
CREATE POLICY domains_public_read ON domains FOR SELECT TO venti_app USING (verified_at IS NOT NULL);
--> statement-breakpoint
CREATE POLICY venues_public_read ON venues FOR SELECT TO venti_app USING (true);
--> statement-breakpoint
CREATE POLICY events_public_read ON events FOR SELECT TO venti_app USING (status <> 'draft');
--> statement-breakpoint
CREATE POLICY sectors_public_read ON sectors FOR SELECT TO venti_app
  USING (EXISTS (SELECT 1 FROM events e WHERE e.id = sectors.event_id AND e.status <> 'draft'));
--> statement-breakpoint
CREATE POLICY ticket_types_public_read ON ticket_types FOR SELECT TO venti_app
  USING (EXISTS (SELECT 1 FROM events e WHERE e.id = ticket_types.event_id AND e.status <> 'draft'));
--> statement-breakpoint
CREATE POLICY price_stages_public_read ON price_stages FOR SELECT TO venti_app
  USING (EXISTS (
    SELECT 1 FROM ticket_types tt JOIN events e ON e.id = tt.event_id
    WHERE tt.id = price_stages.ticket_type_id AND e.status <> 'draft'
  ));
--> statement-breakpoint
-- El comprador ve lo suyo en cualquier organización.
CREATE POLICY holds_owner_read ON holds FOR SELECT TO venti_app USING (user_id = venti_user());
--> statement-breakpoint
CREATE POLICY orders_owner_read ON orders FOR SELECT TO venti_app USING (buyer_user_id = venti_user());
--> statement-breakpoint
CREATE POLICY tickets_owner_read ON tickets FOR SELECT TO venti_app USING (owner_user_id = venti_user());
--> statement-breakpoint
CREATE POLICY ticket_events_owner_read ON ticket_events FOR SELECT TO venti_app
  USING (EXISTS (SELECT 1 FROM tickets t WHERE t.id = ticket_events.ticket_id AND t.owner_user_id = venti_user()));
--> statement-breakpoint

-- ─── Proceso de sistema acotado: expirar reservas vencidas de todas las organizaciones ───
-- SECURITY DEFINER: corre con el rol dueño (superusuario o BYPASSRLS). Sólo hace esto.
CREATE FUNCTION venti_expire_holds(batch_size integer DEFAULT 500) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  expired_count integer := 0;
  h record;
BEGIN
  FOR h IN
    SELECT id FROM holds
    WHERE status = 'active' AND expires_at <= now()
    ORDER BY expires_at
    LIMIT batch_size
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE ticket_types tt
       SET held = tt.held - hi.quantity, updated_at = now()
      FROM hold_items hi
     WHERE hi.hold_id = h.id AND tt.id = hi.ticket_type_id;
    UPDATE price_stages ps
       SET held_count = ps.held_count - hi.quantity
      FROM hold_items hi
     WHERE hi.hold_id = h.id AND ps.id = hi.price_stage_id;
    UPDATE holds SET status = 'expired', closed_at = now() WHERE id = h.id;
    expired_count := expired_count + 1;
  END LOOP;
  RETURN expired_count;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION venti_expire_holds(integer) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION venti_expire_holds(integer) TO venti_app;
