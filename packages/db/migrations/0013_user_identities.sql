-- Ingreso con Google: vínculo entre una cuenta de Lintick y la cuenta externa (por su "sub", que no cambia).
CREATE TABLE "user_identities" (
	"provider" text NOT NULL,
	"subject" text NOT NULL,
	"user_id" uuid NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_identities_provider_subject_pk" PRIMARY KEY("provider","subject")
);
--> statement-breakpoint
ALTER TABLE "user_identities" ADD CONSTRAINT "user_identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "user_identities_user_provider_uq" ON "user_identities" USING btree ("user_id","provider");
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON user_identities TO venti_app;
--> statement-breakpoint
ALTER TABLE user_identities ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE user_identities FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY user_identities_app ON user_identities FOR ALL TO venti_app USING (true) WITH CHECK (true);
