ALTER TABLE "events" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "cancellation_reason" text;--> statement-breakpoint
ALTER TABLE "holds" ADD COLUMN "currency" "currency" DEFAULT 'ARS' NOT NULL;--> statement-breakpoint
ALTER TABLE "holds" ADD COLUMN "subtotal_cents" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "holds" ADD COLUMN "fee_cents" bigint DEFAULT 0 NOT NULL;