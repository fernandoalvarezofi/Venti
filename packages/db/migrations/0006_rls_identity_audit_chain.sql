-- ════════════════════════════════════════════════════════════════════════════
-- VENTI ID & TICKET SECURITY — fase 1 (docs/security/ID-TICKET-SECURITY.md)
--  · RLS y permisos de las tablas nuevas
--  · Cadena de hashes de auditoría calculada por la base (H7)
-- ════════════════════════════════════════════════════════════════════════════

GRANT SELECT, INSERT, UPDATE, DELETE ON email_verifications, password_resets, ticket_claims, staff_assignments TO venti_app;
--> statement-breakpoint

-- Tablas globales de identidad: sólo la app.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['email_verifications', 'password_resets'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR ALL TO venti_app USING (true) WITH CHECK (true)', t || '_app', t);
  END LOOP;
END
$$;
--> statement-breakpoint

-- Tablas tenant nuevas.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ticket_claims', 'staff_assignments'] LOOP
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

-- Un usuario con email VERIFICADO ve los reclamos abiertos dirigidos a su email, en cualquier organización.
CREATE POLICY ticket_claims_recipient_read ON ticket_claims FOR SELECT TO venti_app
  USING (
    claimed_at IS NULL
    AND email_lower = (SELECT lower(u.email) FROM users u WHERE u.id = venti_user() AND u.email_verified_at IS NOT NULL)
  );
--> statement-breakpoint
-- El personal ve sus propias asignaciones.
CREATE POLICY staff_assignments_self_read ON staff_assignments FOR SELECT TO venti_app USING (user_id = venti_user());
--> statement-breakpoint

-- ─── Cadena de auditoría ───
-- hash = sha256(prev_hash | seq | fila canónica sin columnas de cadena). Zona horaria fija para que el
-- texto de las fechas sea siempre el mismo al calcular y al verificar.
CREATE FUNCTION venti_chain_hash(p_prev text, p_seq bigint, p_row jsonb) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT encode(sha256(convert_to(p_prev || '|' || p_seq::text || '|' || (p_row - 'seq' - 'prev_hash' - 'hash')::text, 'UTF8')), 'hex')
$$;
--> statement-breakpoint

CREATE FUNCTION venti_chain_append() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public SET TimeZone = 'UTC' AS $$
DECLARE
  last_seq bigint;
  last_hash text;
BEGIN
  -- El autor lo fija la base a partir del contexto de la transacción: la app no puede atribuir acciones a otro.
  IF venti_user() IS NOT NULL THEN
    NEW.actor_user_id := venti_user();
  END IF;
  -- Orden total por organización y tabla: inserciones concurrentes se encolan.
  PERFORM pg_advisory_xact_lock(hashtextextended(TG_TABLE_NAME || ':' || NEW.organization_id::text, 0));
  EXECUTE format('SELECT seq, hash FROM %I WHERE organization_id = $1 AND seq IS NOT NULL ORDER BY seq DESC LIMIT 1', TG_TABLE_NAME)
    INTO last_seq, last_hash USING NEW.organization_id;
  NEW.seq := COALESCE(last_seq, 0) + 1;
  NEW.prev_hash := COALESCE(last_hash, repeat('0', 64));
  NEW.hash := venti_chain_hash(NEW.prev_hash, NEW.seq, to_jsonb(NEW));
  RETURN NEW;
END
$$;
--> statement-breakpoint

-- Encadenar las filas existentes (en orden de ocurrencia) antes de activar el trigger.
DO $$
DECLARE
  t text;
  o uuid;
  r record;
  s bigint;
  h text;
BEGIN
  SET LOCAL TimeZone = 'UTC';
  FOREACH t IN ARRAY ARRAY['audit_logs', 'ticket_events'] LOOP
    FOR o IN EXECUTE format('SELECT DISTINCT organization_id FROM %I', t) LOOP
      s := 0;
      h := repeat('0', 64);
      FOR r IN EXECUTE format('SELECT * FROM %I WHERE organization_id = $1 ORDER BY occurred_at, id', t) USING o LOOP
        s := s + 1;
        -- venti_chain_hash ignora seq/prev_hash/hash de la fila: el contenido es el mismo antes y después.
        EXECUTE format('UPDATE %I SET seq = $1, prev_hash = $2, hash = $3 WHERE id = $4', t)
          USING s, h, venti_chain_hash(h, s, to_jsonb(r)), r.id;
        h := venti_chain_hash(h, s, to_jsonb(r));
      END LOOP;
    END LOOP;
  END LOOP;
END
$$;
--> statement-breakpoint

ALTER TABLE audit_logs ALTER COLUMN seq SET NOT NULL, ALTER COLUMN prev_hash SET NOT NULL, ALTER COLUMN hash SET NOT NULL;
--> statement-breakpoint
ALTER TABLE ticket_events ALTER COLUMN seq SET NOT NULL, ALTER COLUMN prev_hash SET NOT NULL, ALTER COLUMN hash SET NOT NULL;
--> statement-breakpoint

CREATE TRIGGER audit_logs_chain BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION venti_chain_append();
--> statement-breakpoint
CREATE TRIGGER ticket_events_chain BEFORE INSERT ON ticket_events FOR EACH ROW EXECUTE FUNCTION venti_chain_append();
--> statement-breakpoint

-- Verificador: recorre la cadena de la organización del contexto y devuelve la primera fila inconsistente.
CREATE FUNCTION venti_verify_chain(p_table text, p_org uuid)
RETURNS TABLE (checked bigint, first_broken_seq bigint, reason text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public SET TimeZone = 'UTC' AS $$
DECLARE
  r record;
  n bigint := 0;
  prev text := repeat('0', 64);
BEGIN
  IF p_table NOT IN ('audit_logs', 'ticket_events') THEN
    RAISE EXCEPTION 'tabla no auditada: %', p_table;
  END IF;
  -- Sólo se puede verificar la organización de la transacción actual.
  IF p_org IS DISTINCT FROM venti_org() THEN
    RAISE EXCEPTION 'organización fuera de contexto' USING ERRCODE = '42501';
  END IF;
  FOR r IN EXECUTE format('SELECT * FROM %I WHERE organization_id = $1 ORDER BY seq', p_table) USING p_org LOOP
    n := n + 1;
    IF r.seq <> n THEN
      RETURN QUERY SELECT n, r.seq, 'secuencia con huecos o duplicada'::text;
      RETURN;
    END IF;
    IF r.prev_hash <> prev THEN
      RETURN QUERY SELECT n, r.seq, 'el hash anterior no coincide'::text;
      RETURN;
    END IF;
    IF r.hash <> venti_chain_hash(r.prev_hash, r.seq, to_jsonb(r)) THEN
      RETURN QUERY SELECT n, r.seq, 'el contenido de la fila fue modificado'::text;
      RETURN;
    END IF;
    prev := r.hash;
  END LOOP;
  RETURN QUERY SELECT n, NULL::bigint, NULL::text;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION venti_verify_chain(text, uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION venti_verify_chain(text, uuid) TO venti_app;
--> statement-breakpoint
REVOKE ALL ON FUNCTION venti_chain_append() FROM PUBLIC;
