-- Transferencia de entradas entre personas (Lintick).
-- Mientras está pendiente, la entrada original queda bloqueada (no entra). Al aceptarla, la original se anula
-- y el destinatario recibe una entrada NUEVA (otro id y otro QR): el QR anterior deja de servir.
CREATE TABLE "ticket_transfers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
	"ticket_id" uuid NOT NULL REFERENCES "tickets"("id") ON DELETE cascade,
	"from_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
	"to_email_lower" text NOT NULL,
	"to_name" text NOT NULL,
	"token_hash" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"new_ticket_id" uuid REFERENCES "tickets"("id") ON DELETE set null,
	"accepted_by" uuid REFERENCES "users"("id") ON DELETE set null,
	"expires_at" timestamp with time zone NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ticket_transfers_status" CHECK ("status" IN ('pending', 'accepted', 'cancelled', 'expired'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "ticket_transfers_token_uq" ON "ticket_transfers" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "ticket_transfers_pending_uq" ON "ticket_transfers" USING btree ("ticket_id") WHERE "status" = 'pending';--> statement-breakpoint
CREATE INDEX "ticket_transfers_to_idx" ON "ticket_transfers" USING btree ("to_email_lower") WHERE "status" = 'pending';--> statement-breakpoint
CREATE INDEX "ticket_transfers_from_idx" ON "ticket_transfers" USING btree ("from_user_id");--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON ticket_transfers TO venti_app;--> statement-breakpoint
ALTER TABLE ticket_transfers ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE ticket_transfers FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY ticket_transfers_tenant ON ticket_transfers FOR ALL TO venti_app USING (organization_id = venti_org()) WITH CHECK (organization_id = venti_org());--> statement-breakpoint
-- Quien envía ve sus transferencias.
CREATE POLICY ticket_transfers_sender_read ON ticket_transfers FOR SELECT TO venti_app USING (from_user_id = venti_user());--> statement-breakpoint
-- Quien recibe (con el email VERIFICADO) ve las pendientes dirigidas a su email.
CREATE POLICY ticket_transfers_recipient_read ON ticket_transfers FOR SELECT TO venti_app
  USING (
    status = 'pending'
    AND to_email_lower = (SELECT lower(u.email) FROM users u WHERE u.id = venti_user() AND u.email_verified_at IS NOT NULL)
  );
