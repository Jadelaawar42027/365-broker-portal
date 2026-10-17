CREATE TYPE "public"."broker_level" AS ENUM('junior', 'senior');--> statement-breakpoint
CREATE TYPE "public"."broker_status" AS ENUM('invited', 'onboarding', 'active', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."step_kind" AS ENUM('upload', 'text', 'choice', 'confirm', 'checklist', 'admin');--> statement-breakpoint
CREATE TYPE "public"."step_stage" AS ENUM('paperwork', 'florida_license', 'your_tools');--> statement-breakpoint
CREATE TYPE "public"."step_status" AS ENUM('todo', 'submitted', 'approved', 'changes_requested');--> statement-breakpoint
CREATE TYPE "public"."token_purpose" AS ENUM('invite', 'password_reset');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('broker', 'admin', 'owner');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"phone" text,
	"role" "user_role" DEFAULT 'broker' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"purpose" "token_purpose" NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "broker_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"broker_id" uuid NOT NULL,
	"step_id" uuid NOT NULL,
	"status" "step_status" DEFAULT 'todo' NOT NULL,
	"form_data" jsonb,
	"attempts" integer DEFAULT 0 NOT NULL,
	"submitted_at" timestamp with time zone,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"review_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "broker_steps_broker_step_unique" UNIQUE("broker_id","step_id")
);
--> statement-breakpoint
CREATE TABLE "brokers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"level" "broker_level" DEFAULT 'junior' NOT NULL,
	"status" "broker_status" DEFAULT 'invited' NOT NULL,
	"joined_at" date DEFAULT CURRENT_DATE NOT NULL,
	"onboarded_at" date,
	"left_at" date,
	"commission_tier" text,
	"persona_md" text,
	"persona_updated_at" timestamp with time zone,
	"persona_updated_by" uuid,
	"welcome_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brokers_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "brokers_left_after_joined" CHECK ("brokers"."left_at" IS NULL OR "brokers"."left_at" >= "brokers"."joined_at"),
	CONSTRAINT "brokers_onboarded_after_joined" CHECK ("brokers"."onboarded_at" IS NULL OR "brokers"."onboarded_at" >= "brokers"."joined_at")
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"broker_step_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"version" integer NOT NULL,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "files_storage_key_unique" UNIQUE("storage_key"),
	CONSTRAINT "files_size_positive" CHECK ("files"."size_bytes" > 0)
);
--> statement-breakpoint
CREATE TABLE "onboarding_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"position" integer NOT NULL,
	"stage" "step_stage" NOT NULL,
	"title" text NOT NULL,
	"short_title" text NOT NULL,
	"summary" text NOT NULL,
	"intro" text NOT NULL,
	"kind" "step_kind" NOT NULL,
	"needs_approval" boolean NOT NULL,
	"instructions_md" text NOT NULL,
	"template_file_key" text,
	"video_url" text,
	"accepted_types" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"max_size_bytes" integer DEFAULT 10485760 NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "onboarding_steps_key_unique" UNIQUE("key"),
	CONSTRAINT "onboarding_steps_position_unique" UNIQUE("position")
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_tokens" ADD CONSTRAINT "account_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_tokens" ADD CONSTRAINT "account_tokens_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broker_steps" ADD CONSTRAINT "broker_steps_broker_id_brokers_id_fk" FOREIGN KEY ("broker_id") REFERENCES "public"."brokers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broker_steps" ADD CONSTRAINT "broker_steps_step_id_onboarding_steps_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."onboarding_steps"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broker_steps" ADD CONSTRAINT "broker_steps_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brokers" ADD CONSTRAINT "brokers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brokers" ADD CONSTRAINT "brokers_persona_updated_by_users_id_fk" FOREIGN KEY ("persona_updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_broker_step_id_broker_steps_id_fk" FOREIGN KEY ("broker_step_id") REFERENCES "public"."broker_steps"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_user_id_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verifications_identifier_idx" ON "verifications" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "account_tokens_user_purpose_idx" ON "account_tokens" USING btree ("user_id","purpose");--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_log_created_at_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "broker_steps_status_idx" ON "broker_steps" USING btree ("status");--> statement-breakpoint
CREATE INDEX "brokers_status_idx" ON "brokers" USING btree ("status");--> statement-breakpoint
CREATE INDEX "files_broker_step_version_idx" ON "files" USING btree ("broker_step_id","version");