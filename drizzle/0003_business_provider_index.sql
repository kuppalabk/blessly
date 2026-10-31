DROP INDEX "biz_messages_provider_idx";--> statement-breakpoint
CREATE INDEX "biz_messages_provider_idx" ON "biz_messages" USING btree ("provider_id");