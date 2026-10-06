ALTER TABLE "orgs" ADD COLUMN "daily_send_limit" integer DEFAULT 50 NOT NULL;--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN "sending_paused_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN "sending_paused_reason" text;