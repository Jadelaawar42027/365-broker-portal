CREATE TABLE "step_question_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"label" text NOT NULL,
	"is_correct" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "step_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"step_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"prompt" text NOT NULL,
	"explanation" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "step_videos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"step_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"title" text NOT NULL,
	"source" "video_source",
	"provider" "video_provider",
	"storage_key" text,
	"embed_url" text,
	"file_name" text,
	"size_bytes" integer,
	"duration_seconds" integer,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "step_videos_source_fields" CHECK (("step_videos"."source" IS NULL AND "step_videos"."storage_key" IS NULL AND "step_videos"."embed_url" IS NULL) OR ("step_videos"."source" = 'upload' AND "step_videos"."storage_key" IS NOT NULL) OR ("step_videos"."source" = 'embed' AND "step_videos"."embed_url" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "onboarding_steps" ADD COLUMN "todo_items" text[];--> statement-breakpoint
ALTER TABLE "onboarding_steps" ADD COLUMN "callouts" jsonb;--> statement-breakpoint
ALTER TABLE "onboarding_steps" ADD COLUMN "full_text_md" text;--> statement-breakpoint
ALTER TABLE "lessons" ADD COLUMN "todo_items" text[];--> statement-breakpoint
ALTER TABLE "lessons" ADD COLUMN "callouts" jsonb;--> statement-breakpoint
ALTER TABLE "step_question_options" ADD CONSTRAINT "step_question_options_question_id_step_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."step_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "step_questions" ADD CONSTRAINT "step_questions_step_id_onboarding_steps_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."onboarding_steps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "step_videos" ADD CONSTRAINT "step_videos_step_id_onboarding_steps_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."onboarding_steps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "step_videos" ADD CONSTRAINT "step_videos_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "step_question_options_question_idx" ON "step_question_options" USING btree ("question_id","position");--> statement-breakpoint
CREATE INDEX "step_questions_step_idx" ON "step_questions" USING btree ("step_id","position");--> statement-breakpoint
CREATE INDEX "step_videos_step_position_idx" ON "step_videos" USING btree ("step_id","position");