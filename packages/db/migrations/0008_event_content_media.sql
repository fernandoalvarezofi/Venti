CREATE TABLE "event_media" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"content_type" text NOT NULL,
	"bytes" "bytea" NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_media_size" CHECK ("event_media"."size_bytes" > 0 AND "event_media"."size_bytes" <= 3145728)
);
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "doors_open_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "min_age" smallint;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "dress_code" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "lineup" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "amenities" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "extra_amenities" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "links" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "policies" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "cover_media_id" uuid;--> statement-breakpoint
ALTER TABLE "event_media" ADD CONSTRAINT "event_media_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_media" ADD CONSTRAINT "event_media_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_media_event_idx" ON "event_media" USING btree ("event_id","kind","position");--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_min_age" CHECK ("events"."min_age" IS NULL OR "events"."min_age" BETWEEN 0 AND 25);