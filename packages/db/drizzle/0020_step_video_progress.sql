CREATE TABLE "step_video_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"broker_id" uuid NOT NULL,
	"step_video_id" uuid NOT NULL,
	"watched_seconds" integer DEFAULT 0 NOT NULL,
	"watched_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "step_video_progress_broker_video_unique" UNIQUE("broker_id","step_video_id")
);
--> statement-breakpoint
ALTER TABLE "step_video_progress" ADD CONSTRAINT "step_video_progress_broker_id_brokers_id_fk" FOREIGN KEY ("broker_id") REFERENCES "public"."brokers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "step_video_progress" ADD CONSTRAINT "step_video_progress_step_video_id_step_videos_id_fk" FOREIGN KEY ("step_video_id") REFERENCES "public"."step_videos"("id") ON DELETE cascade ON UPDATE no action;