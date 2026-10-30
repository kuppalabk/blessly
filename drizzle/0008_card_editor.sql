CREATE TABLE "card_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"occasion" text NOT NULL,
	"doc" text NOT NULL,
	"favourite" boolean DEFAULT false NOT NULL,
	"front_file_id" uuid,
	"inside_file_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"key" text NOT NULL,
	"mime" text NOT NULL,
	"bytes" integer NOT NULL,
	"width" integer,
	"height" integer,
	"duration_sec" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "wishes" ADD COLUMN "card_draft_id" uuid;--> statement-breakpoint
ALTER TABLE "wishes" ADD COLUMN "message_file_id" uuid;--> statement-breakpoint
ALTER TABLE "card_drafts" ADD CONSTRAINT "card_drafts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_drafts" ADD CONSTRAINT "card_drafts_front_file_id_files_id_fk" FOREIGN KEY ("front_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_drafts" ADD CONSTRAINT "card_drafts_inside_file_id_files_id_fk" FOREIGN KEY ("inside_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "card_drafts_user_idx" ON "card_drafts" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "files_owner_idx" ON "files" USING btree ("owner_id");--> statement-breakpoint
ALTER TABLE "wishes" ADD CONSTRAINT "wishes_card_draft_id_card_drafts_id_fk" FOREIGN KEY ("card_draft_id") REFERENCES "public"."card_drafts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishes" ADD CONSTRAINT "wishes_message_file_id_files_id_fk" FOREIGN KEY ("message_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;