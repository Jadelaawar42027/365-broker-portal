CREATE TABLE "commission_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"broker_id" uuid NOT NULL,
	"in_house_pct" integer,
	"self_generated_pct" integer,
	"effective_from" date DEFAULT CURRENT_DATE NOT NULL,
	"changed_by" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "commission_history_in_house_range" CHECK ("commission_history"."in_house_pct" IS NULL OR "commission_history"."in_house_pct" BETWEEN 0 AND 100),
	CONSTRAINT "commission_history_self_generated_range" CHECK ("commission_history"."self_generated_pct" IS NULL OR "commission_history"."self_generated_pct" BETWEEN 0 AND 100)
);
--> statement-breakpoint
ALTER TABLE "commission_history" ADD CONSTRAINT "commission_history_broker_id_brokers_id_fk" FOREIGN KEY ("broker_id") REFERENCES "public"."brokers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_history" ADD CONSTRAINT "commission_history_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "commission_history_broker_idx" ON "commission_history" USING btree ("broker_id","effective_from","created_at");