CREATE TABLE "broker_persona_tags" (
	"broker_id" uuid PRIMARY KEY NOT NULL,
	"background_tags" jsonb,
	"story_keywords" text[],
	"boat_types" text[],
	"price_bands" text[],
	"buyer_types_click" text[],
	"strengths" text[],
	"avoid_notes" text[],
	"languages" jsonb,
	"follow_up_style" text,
	"response_speed" text,
	"channels" text[],
	"selling_style" text,
	"max_leads_per_week" integer,
	"availability_text" text,
	"do_not_mention" text[],
	"source_hash" text,
	"extracted_at" timestamp with time zone,
	"extraction_model" text,
	"extraction_error" text,
	"manual_overrides" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "broker_persona_tags_max_leads_range" CHECK ("broker_persona_tags"."max_leads_per_week" IS NULL OR "broker_persona_tags"."max_leads_per_week" BETWEEN 1 AND 50)
);
--> statement-breakpoint
CREATE TABLE "match_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" text NOT NULL,
	"lead_name" text NOT NULL,
	"request" jsonb NOT NULL,
	"recommendations" jsonb NOT NULL,
	"excluded" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"weights" jsonb NOT NULL,
	"health_source" text NOT NULL,
	"fit_method" text NOT NULL,
	"chosen_broker_id" uuid,
	"chosen_at" timestamp with time zone,
	"chosen_by" text,
	"chosen_ghl_user_id" text,
	"chosen_broker_name" text,
	"chosen_off_list" boolean DEFAULT false NOT NULL,
	"choice_timestamp" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "match_weights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fit" integer NOT NULL,
	"performance" integer NOT NULL,
	"availability" integer NOT NULL,
	"follow_up_points" integer NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_weights_range" CHECK ("match_weights"."fit" BETWEEN 0 AND 100 AND "match_weights"."performance" BETWEEN 0 AND 100 AND "match_weights"."availability" BETWEEN 0 AND 100 AND "match_weights"."follow_up_points" BETWEEN 0 AND 30),
	CONSTRAINT "match_weights_not_all_zero" CHECK ("match_weights"."fit" + "match_weights"."performance" + "match_weights"."availability" > 0)
);
--> statement-breakpoint
ALTER TABLE "broker_persona_tags" ADD CONSTRAINT "broker_persona_tags_broker_id_brokers_id_fk" FOREIGN KEY ("broker_id") REFERENCES "public"."brokers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_log" ADD CONSTRAINT "match_log_chosen_broker_id_brokers_id_fk" FOREIGN KEY ("chosen_broker_id") REFERENCES "public"."brokers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_weights" ADD CONSTRAINT "match_weights_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "match_log_chosen_broker_idx" ON "match_log" USING btree ("chosen_broker_id","chosen_at");--> statement-breakpoint
CREATE INDEX "match_log_contact_idx" ON "match_log" USING btree ("contact_id","created_at");--> statement-breakpoint
CREATE INDEX "match_weights_created_at_idx" ON "match_weights" USING btree ("created_at");