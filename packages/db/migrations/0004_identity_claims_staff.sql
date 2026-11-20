CREATE TABLE "email_verifications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "password_resets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_assignments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"valid_from" timestamp with time zone NOT NULL,
	"valid_until" timestamp with time zone NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_assignments_window" CHECK ("staff_assignments"."valid_until" > "staff_assignments"."valid_from")
);
--> statement-breakpoint
CREATE TABLE "ticket_claims" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"ticket_id" uuid NOT NULL,
	"email_lower" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"claimed_by" uuid,
	"claimed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD COLUMN "seq" bigint;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD COLUMN "prev_hash" text;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD COLUMN "hash" text;--> statement-breakpoint
ALTER TABLE "ticket_events" ADD COLUMN "seq" bigint;--> statement-breakpoint
ALTER TABLE "ticket_events" ADD COLUMN "prev_hash" text;--> statement-breakpoint
ALTER TABLE "ticket_events" ADD COLUMN "hash" text;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "holder_doc_hmac" text;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "holder_doc_last3" text;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "assignment_status" text DEFAULT 'assigned' NOT NULL;--> statement-breakpoint
ALTER TABLE "email_verifications" ADD CONSTRAINT "email_verifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_assignments" ADD CONSTRAINT "staff_assignments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_assignments" ADD CONSTRAINT "staff_assignments_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_assignments" ADD CONSTRAINT "staff_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_claims" ADD CONSTRAINT "ticket_claims_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_claims" ADD CONSTRAINT "ticket_claims_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_claims" ADD CONSTRAINT "ticket_claims_claimed_by_users_id_fk" FOREIGN KEY ("claimed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "email_verifications_token_uq" ON "email_verifications" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "email_verifications_user_idx" ON "email_verifications" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "password_resets_token_uq" ON "password_resets" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "password_resets_user_idx" ON "password_resets" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_assignments_uq" ON "staff_assignments" USING btree ("event_id","user_id");--> statement-breakpoint
CREATE INDEX "staff_assignments_user_idx" ON "staff_assignments" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ticket_claims_open_uq" ON "ticket_claims" USING btree ("ticket_id") WHERE "ticket_claims"."claimed_at" IS NULL;--> statement-breakpoint
CREATE INDEX "ticket_claims_email_idx" ON "ticket_claims" USING btree ("email_lower");--> statement-breakpoint
CREATE UNIQUE INDEX "audit_logs_chain_uq" ON "audit_logs" USING btree ("organization_id","seq");--> statement-breakpoint
CREATE UNIQUE INDEX "ticket_events_chain_uq" ON "ticket_events" USING btree ("organization_id","seq");--> statement-breakpoint
CREATE INDEX "tickets_holder_doc_idx" ON "tickets" USING btree ("event_id","holder_doc_hmac");--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_doc_last3" CHECK ("tickets"."holder_doc_last3" IS NULL OR "tickets"."holder_doc_last3" ~ '^[0-9]{3}$');--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_claim_owner" CHECK ("tickets"."assignment_status" <> 'pending_claim' OR "tickets"."owner_user_id" IS NULL);