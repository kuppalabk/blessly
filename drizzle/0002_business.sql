CREATE TYPE "public"."biz_channel" AS ENUM('whatsapp', 'email');--> statement-breakpoint
CREATE TYPE "public"."biz_message_status" AS ENUM('queued', 'sent', 'delivered', 'read', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."campaign_status" AS ENUM('scheduled', 'sending', 'done', 'cancelled');--> statement-breakpoint
CREATE TABLE "automations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"channel" text DEFAULT 'both' NOT NULL,
	"template_id" uuid,
	"email_subject" text NOT NULL,
	"email_body" text NOT NULL,
	"send_hour" smallint DEFAULT 9 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "biz_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"customer_id" uuid,
	"dedupe_key" text NOT NULL,
	"source" text NOT NULL,
	"campaign_id" uuid,
	"channel" "biz_channel" NOT NULL,
	"recipient" text NOT NULL,
	"preview" text DEFAULT '' NOT NULL,
	"status" "biz_message_status" DEFAULT 'queued' NOT NULL,
	"provider_id" text,
	"error" text,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"send_at" timestamp with time zone NOT NULL,
	"sent_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "businesses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"timezone" text DEFAULT 'Asia/Kolkata' NOT NULL,
	"country" text DEFAULT 'IN' NOT NULL,
	"monthly_quota" integer DEFAULT 1000 NOT NULL,
	"wa_phone_number_id" text,
	"wa_business_account_id" text,
	"wa_token_enc" text,
	"wa_display_number" text,
	"wa_verified_name" text,
	"wa_connected_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"name" text NOT NULL,
	"channel" text DEFAULT 'both' NOT NULL,
	"template_id" uuid,
	"email_subject" text DEFAULT '' NOT NULL,
	"email_body" text DEFAULT '' NOT NULL,
	"tag" text DEFAULT '' NOT NULL,
	"send_at" timestamp with time zone NOT NULL,
	"status" "campaign_status" DEFAULT 'scheduled' NOT NULL,
	"audience" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"email" text,
	"language" text DEFAULT 'en' NOT NULL,
	"birthday_month" smallint,
	"birthday_day" smallint,
	"anniversary_month" smallint,
	"anniversary_day" smallint,
	"tags" text DEFAULT '' NOT NULL,
	"consent_at" timestamp with time zone,
	"consent_source" text,
	"wa_opt_out_at" timestamp with time zone,
	"email_opt_out_at" timestamp with time zone,
	"unsubscribe_token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wa_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"name" text NOT NULL,
	"language" text NOT NULL,
	"category" text NOT NULL,
	"status" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"param_count" smallint DEFAULT 0 NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "automations" ADD CONSTRAINT "automations_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automations" ADD CONSTRAINT "automations_template_id_wa_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."wa_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "biz_messages" ADD CONSTRAINT "biz_messages_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "biz_messages" ADD CONSTRAINT "biz_messages_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "biz_messages" ADD CONSTRAINT "biz_messages_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_template_id_wa_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."wa_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wa_templates" ADD CONSTRAINT "wa_templates_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "automations_unique_idx" ON "automations" USING btree ("business_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "biz_messages_dedupe_idx" ON "biz_messages" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "biz_messages_queue_idx" ON "biz_messages" USING btree ("status","send_at");--> statement-breakpoint
CREATE INDEX "biz_messages_business_idx" ON "biz_messages" USING btree ("business_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "biz_messages_provider_idx" ON "biz_messages" USING btree ("provider_id");--> statement-breakpoint
CREATE UNIQUE INDEX "businesses_owner_idx" ON "businesses" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "businesses_wa_phone_idx" ON "businesses" USING btree ("wa_phone_number_id");--> statement-breakpoint
CREATE INDEX "campaigns_due_idx" ON "campaigns" USING btree ("status","send_at");--> statement-breakpoint
CREATE INDEX "customers_business_idx" ON "customers" USING btree ("business_id");--> statement-breakpoint
CREATE UNIQUE INDEX "customers_phone_idx" ON "customers" USING btree ("business_id","phone");--> statement-breakpoint
CREATE UNIQUE INDEX "customers_email_idx" ON "customers" USING btree ("business_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "customers_unsub_idx" ON "customers" USING btree ("unsubscribe_token");--> statement-breakpoint
CREATE INDEX "customers_birthday_idx" ON "customers" USING btree ("birthday_month","birthday_day");--> statement-breakpoint
CREATE INDEX "customers_anniv_idx" ON "customers" USING btree ("anniversary_month","anniversary_day");--> statement-breakpoint
CREATE UNIQUE INDEX "wa_templates_unique_idx" ON "wa_templates" USING btree ("business_id","name","language");