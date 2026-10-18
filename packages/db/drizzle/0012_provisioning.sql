CREATE TYPE "public"."provisioning_action" AS ENUM('create', 'suspend', 'unsuspend', 'link');--> statement-breakpoint
CREATE TYPE "public"."provisioning_system" AS ENUM('google', 'ghl');--> statement-breakpoint
CREATE TYPE "public"."provisioning_task_status" AS ENUM('pending', 'running', 'done', 'failed');--> statement-breakpoint
CREATE TABLE "provisioning_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"broker_id" uuid NOT NULL,
	"system" "provisioning_system" NOT NULL,
	"action" "provisioning_action" NOT NULL,
	"status" "provisioning_task_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provisioning_tasks_attempts_range" CHECK ("provisioning_tasks"."attempts" >= 0)
);
--> statement-breakpoint
ALTER TABLE "brokers" ADD COLUMN "corporate_email" text;--> statement-breakpoint
ALTER TABLE "brokers" ADD COLUMN "crm_phone" text;--> statement-breakpoint
ALTER TABLE "brokers" ADD COLUMN "google_user_id" text;--> statement-breakpoint
ALTER TABLE "brokers" ADD COLUMN "ghl_user_id" text;--> statement-breakpoint
ALTER TABLE "provisioning_tasks" ADD CONSTRAINT "provisioning_tasks_broker_id_brokers_id_fk" FOREIGN KEY ("broker_id") REFERENCES "public"."brokers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provisioning_tasks" ADD CONSTRAINT "provisioning_tasks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "provisioning_tasks_due_idx" ON "provisioning_tasks" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "provisioning_tasks_broker_idx" ON "provisioning_tasks" USING btree ("broker_id","system","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "provisioning_tasks_one_open_idx" ON "provisioning_tasks" USING btree ("broker_id","system","action") WHERE "provisioning_tasks"."status" IN ('pending', 'running');--> statement-breakpoint
ALTER TABLE "brokers" ADD CONSTRAINT "brokers_corporate_email_unique" UNIQUE("corporate_email");