-- Cobros: cada tabla aislada por productora (RLS forzado), igual que el resto del esquema.
GRANT SELECT, INSERT, UPDATE, DELETE ON payment_accounts, payment_oauth_states, payments TO venti_app;
--> statement-breakpoint
ALTER TABLE payment_accounts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE payment_accounts FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE payment_oauth_states ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE payment_oauth_states FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE payments FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY payment_accounts_tenant ON payment_accounts FOR ALL TO venti_app
  USING (organization_id = venti_org()) WITH CHECK (organization_id = venti_org());
--> statement-breakpoint
CREATE POLICY payment_oauth_states_tenant ON payment_oauth_states FOR ALL TO venti_app
  USING (organization_id = venti_org()) WITH CHECK (organization_id = venti_org());
--> statement-breakpoint
CREATE POLICY payments_tenant ON payments FOR ALL TO venti_app
  USING (organization_id = venti_org()) WITH CHECK (organization_id = venti_org());
--> statement-breakpoint
-- La vuelta de Mercado Pago sólo trae el "state": esta función lo consume (una sola vez, si no venció)
-- y devuelve a qué productora y persona pertenece. No expone nada más.
CREATE FUNCTION venti_consume_oauth_state(p_hash text)
RETURNS TABLE (organization_id uuid, user_id uuid)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM payment_oauth_states s
  WHERE s.state_hash = p_hash AND s.expires_at > now()
  RETURNING s.organization_id, s.user_id;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION venti_consume_oauth_state(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION venti_consume_oauth_state(text) TO venti_app;
--> statement-breakpoint
-- Avisos de Mercado Pago que no traen productora (p. ej. el vendedor desconectó Lintick):
-- dado el user_id del vendedor, devuelve sólo el id de la productora conectada.
CREATE FUNCTION venti_payment_account_org(p_provider text, p_provider_user_id text)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT organization_id FROM payment_accounts
  WHERE provider = p_provider AND provider_user_id = p_provider_user_id;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION venti_payment_account_org(text, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION venti_payment_account_org(text, text) TO venti_app;
