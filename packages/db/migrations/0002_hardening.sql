-- ════════════════════════════════════════════════════════════════════════════
-- Blindaje para hosting gestionado (Supabase y similares).
-- Supabase expone el esquema `public` por su API (PostgREST) a los roles anon y
-- authenticated, y les da privilegios por defecto sobre tablas nuevas. VENTI no usa
-- esa API: sólo `venti_app` accede a los datos.
-- ════════════════════════════════════════════════════════════════════════════

-- 1. Las tablas globales también tienen RLS forzado: sólo venti_app puede verlas.
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE users FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY users_app ON users FOR ALL TO venti_app USING (true) WITH CHECK (true);
--> statement-breakpoint
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE sessions FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY sessions_app ON sessions FOR ALL TO venti_app USING (true) WITH CHECK (true);
--> statement-breakpoint

-- 2. Ningún otro rol de aplicación conserva privilegios sobre los objetos de VENTI.
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', r);
    END IF;
  END LOOP;
END
$$;
--> statement-breakpoint

-- 3. Tablas futuras: venti_app recibe privilegios automáticamente (las migraciones las crea el rol dueño).
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO venti_app;
