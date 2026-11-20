ALTER TABLE "email_verifications" ADD COLUMN "pending_password_hash" text NOT NULL;--> statement-breakpoint
ALTER TABLE "email_verifications" ADD COLUMN "pending_full_name" text NOT NULL;