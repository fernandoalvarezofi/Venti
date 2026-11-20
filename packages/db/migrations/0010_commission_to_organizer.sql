ALTER TABLE "holds" ADD COLUMN "commission_bps" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "holds" ADD COLUMN "commission_cents" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "commission_bps" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "commission_cents" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "holds" ADD CONSTRAINT "holds_commission" CHECK ("holds"."commission_cents" >= 0 AND "holds"."commission_cents" <= "holds"."subtotal_cents" AND "holds"."commission_bps" BETWEEN 0 AND 3000);--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_commission" CHECK ("orders"."commission_cents" >= 0 AND "orders"."commission_cents" <= "orders"."subtotal_cents" AND "orders"."commission_bps" BETWEEN 0 AND 3000);