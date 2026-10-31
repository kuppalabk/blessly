CREATE TABLE "album_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"album_id" uuid NOT NULL,
	"uploaded_by" uuid,
	"guest_name" text,
	"full_key" text NOT NULL,
	"thumb_key" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"bytes" integer NOT NULL,
	"caption" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "albums" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"family_id" uuid,
	"title" text NOT NULL,
	"occasion" text DEFAULT 'birthday' NOT NULL,
	"design_index" smallint DEFAULT 0 NOT NULL,
	"slug" text,
	"guest_uploads" boolean DEFAULT false NOT NULL,
	"cover_photo_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "announcements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"link" text,
	"audience" text NOT NULL,
	"recipients" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"event_id" text NOT NULL,
	"type" text NOT NULL,
	"payload" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"email" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "card_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"occasion" text NOT NULL,
	"design_index" smallint NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"featured" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "festival_dates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"festival_id" text NOT NULL,
	"name" text NOT NULL,
	"occasion" text,
	"regions" text DEFAULT 'GLOBAL' NOT NULL,
	"date" date NOT NULL,
	"approximate" boolean DEFAULT false NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"inr_monthly" integer DEFAULT 0 NOT NULL,
	"inr_yearly" integer DEFAULT 0 NOT NULL,
	"usd_monthly" integer DEFAULT 0 NOT NULL,
	"usd_yearly" integer DEFAULT 0 NOT NULL,
	"max_family_members" smallint NOT NULL,
	"max_albums" integer NOT NULL,
	"max_photos_per_album" integer NOT NULL,
	"business_messages" integer DEFAULT 0 NOT NULL,
	"business_seats" smallint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"plan_id" text NOT NULL,
	"interval" text NOT NULL,
	"currency" text NOT NULL,
	"amount" integer NOT NULL,
	"provider_price_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"plan_id" text NOT NULL,
	"interval" text NOT NULL,
	"currency" text NOT NULL,
	"amount" integer NOT NULL,
	"provider" text NOT NULL,
	"provider_subscription_id" text,
	"provider_customer_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"current_period_end" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "businesses" ALTER COLUMN "monthly_quota" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "businesses" ALTER COLUMN "monthly_quota" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "trial_ends_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "album_photos" ADD CONSTRAINT "album_photos_album_id_albums_id_fk" FOREIGN KEY ("album_id") REFERENCES "public"."albums"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "album_photos" ADD CONSTRAINT "album_photos_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "albums" ADD CONSTRAINT "albums_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "albums" ADD CONSTRAINT "albums_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_invites" ADD CONSTRAINT "business_invites_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_members" ADD CONSTRAINT "business_members_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_members" ADD CONSTRAINT "business_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "album_photos_album_idx" ON "album_photos" USING btree ("album_id","sort_order");--> statement-breakpoint
CREATE INDEX "albums_user_idx" ON "albums" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "albums_family_idx" ON "albums" USING btree ("family_id");--> statement-breakpoint
CREATE UNIQUE INDEX "albums_slug_idx" ON "albums" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_events_unique_idx" ON "billing_events" USING btree ("provider","event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "business_invites_token_idx" ON "business_invites" USING btree ("token");--> statement-breakpoint
CREATE INDEX "business_invites_business_idx" ON "business_invites" USING btree ("business_id");--> statement-breakpoint
CREATE UNIQUE INDEX "business_members_unique_idx" ON "business_members" USING btree ("business_id","user_id");--> statement-breakpoint
CREATE INDEX "business_members_user_idx" ON "business_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "card_overrides_unique_idx" ON "card_overrides" USING btree ("occasion","design_index");--> statement-breakpoint
CREATE UNIQUE INDEX "festival_dates_unique_idx" ON "festival_dates" USING btree ("festival_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_prices_unique_idx" ON "provider_prices" USING btree ("provider","plan_id","interval","currency","amount");--> statement-breakpoint
CREATE INDEX "subscriptions_user_idx" ON "subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_provider_idx" ON "subscriptions" USING btree ("provider","provider_subscription_id");--> statement-breakpoint
UPDATE "businesses" SET "monthly_quota" = NULL WHERE "monthly_quota" = 1000;--> statement-breakpoint
UPDATE "businesses" SET "trial_ends_at" = now() + interval '14 days' WHERE "trial_ends_at" IS NULL;--> statement-breakpoint
INSERT INTO "plans" ("id", "name", "inr_monthly", "inr_yearly", "usd_monthly", "usd_yearly", "max_family_members", "max_albums", "max_photos_per_album", "business_messages", "business_seats") VALUES
  ('free', 'Free', 0, 0, 0, 0, 3, 3, 50, 0, 0),
  ('family', 'Family', 9900, 95000, 300, 2900, 6, 100, 500, 0, 0),
  ('business', 'Business', 99900, 959000, 1900, 18200, 6, 100, 500, 1000, 3)
ON CONFLICT ("id") DO NOTHING;
