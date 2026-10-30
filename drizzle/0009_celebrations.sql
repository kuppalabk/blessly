CREATE TABLE "celebration_guests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"celebration_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"token" text NOT NULL,
	"status" text DEFAULT 'invited' NOT NULL,
	"party_size" smallint DEFAULT 1 NOT NULL,
	"diet" text,
	"access" text,
	"note" text,
	"self_added" boolean DEFAULT false NOT NULL,
	"user_id" uuid,
	"invited_at" timestamp with time zone,
	"responded_at" timestamp with time zone,
	"reminded_at" timestamp with time zone,
	"day_before_at" timestamp with time zone,
	"thanked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "celebration_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"celebration_id" uuid NOT NULL,
	"guest_id" uuid,
	"user_id" uuid,
	"name" text NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"file_id" uuid,
	"kind" text DEFAULT 'wish' NOT NULL,
	"approved" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "celebration_updates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"celebration_id" uuid NOT NULL,
	"body" text NOT NULL,
	"emailed" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "celebrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"occasion" text NOT NULL,
	"honoree" text,
	"description" text,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"timezone" text NOT NULL,
	"place" text,
	"address" text,
	"online_url" text,
	"design_index" smallint DEFAULT 0 NOT NULL,
	"visibility" text DEFAULT 'link' NOT NULL,
	"rsvp_enabled" boolean DEFAULT true NOT NULL,
	"rsvp_deadline" timestamp with time zone,
	"ask_diet" boolean DEFAULT false NOT NULL,
	"ask_access" boolean DEFAULT false NOT NULL,
	"max_party_size" smallint DEFAULT 1 NOT NULL,
	"guest_posts" boolean DEFAULT true NOT NULL,
	"moderate_posts" boolean DEFAULT false NOT NULL,
	"show_guest_list" boolean DEFAULT false NOT NULL,
	"wishlist_id" uuid,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wishlist_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wishlist_id" uuid NOT NULL,
	"title" text NOT NULL,
	"url" text,
	"price" integer,
	"currency" text,
	"notes" text,
	"priority" smallint DEFAULT 2 NOT NULL,
	"quantity" smallint DEFAULT 1 NOT NULL,
	"file_id" uuid,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wishlist_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"user_id" uuid,
	"quantity" smallint DEFAULT 1 NOT NULL,
	"token" text NOT NULL,
	"purchased" boolean DEFAULT false NOT NULL,
	"thanked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wishlists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"occasion" text DEFAULT 'birthday' NOT NULL,
	"event_date" date,
	"surprise" boolean DEFAULT true NOT NULL,
	"revealed_at" timestamp with time zone,
	"shipping_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "celebration_guests" ADD CONSTRAINT "celebration_guests_celebration_id_celebrations_id_fk" FOREIGN KEY ("celebration_id") REFERENCES "public"."celebrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "celebration_guests" ADD CONSTRAINT "celebration_guests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "celebration_posts" ADD CONSTRAINT "celebration_posts_celebration_id_celebrations_id_fk" FOREIGN KEY ("celebration_id") REFERENCES "public"."celebrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "celebration_posts" ADD CONSTRAINT "celebration_posts_guest_id_celebration_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."celebration_guests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "celebration_posts" ADD CONSTRAINT "celebration_posts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "celebration_posts" ADD CONSTRAINT "celebration_posts_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "celebration_updates" ADD CONSTRAINT "celebration_updates_celebration_id_celebrations_id_fk" FOREIGN KEY ("celebration_id") REFERENCES "public"."celebrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "celebrations" ADD CONSTRAINT "celebrations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "celebrations" ADD CONSTRAINT "celebrations_wishlist_id_wishlists_id_fk" FOREIGN KEY ("wishlist_id") REFERENCES "public"."wishlists"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_wishlist_id_wishlists_id_fk" FOREIGN KEY ("wishlist_id") REFERENCES "public"."wishlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlist_reservations" ADD CONSTRAINT "wishlist_reservations_item_id_wishlist_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."wishlist_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlist_reservations" ADD CONSTRAINT "wishlist_reservations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlists" ADD CONSTRAINT "wishlists_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "celebration_guests_token_idx" ON "celebration_guests" USING btree ("token");--> statement-breakpoint
CREATE INDEX "celebration_guests_cel_idx" ON "celebration_guests" USING btree ("celebration_id");--> statement-breakpoint
CREATE INDEX "celebration_posts_cel_idx" ON "celebration_posts" USING btree ("celebration_id","created_at");--> statement-breakpoint
CREATE INDEX "celebration_updates_cel_idx" ON "celebration_updates" USING btree ("celebration_id");--> statement-breakpoint
CREATE UNIQUE INDEX "celebrations_slug_idx" ON "celebrations" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "celebrations_user_idx" ON "celebrations" USING btree ("user_id","starts_at");--> statement-breakpoint
CREATE INDEX "wishlist_items_list_idx" ON "wishlist_items" USING btree ("wishlist_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "wishlist_res_token_idx" ON "wishlist_reservations" USING btree ("token");--> statement-breakpoint
CREATE INDEX "wishlist_res_item_idx" ON "wishlist_reservations" USING btree ("item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "wishlists_slug_idx" ON "wishlists" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "wishlists_user_idx" ON "wishlists" USING btree ("user_id");