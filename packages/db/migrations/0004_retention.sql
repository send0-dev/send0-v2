ALTER TABLE "messages" ADD COLUMN "scrubbed_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "messages_org_created_idx" ON "messages" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "messages_unscrubbed_idx" ON "messages" USING btree ("created_at") WHERE "messages"."scrubbed_at" is null;--> statement-breakpoint
CREATE INDEX "messages_scrubbed_idx" ON "messages" USING btree ("created_at") WHERE "messages"."scrubbed_at" is not null;