ALTER TABLE "brokers" ADD COLUMN "in_house_split" integer;--> statement-breakpoint
ALTER TABLE "brokers" ADD COLUMN "self_generated_split" integer;--> statement-breakpoint
ALTER TABLE "brokers" ADD CONSTRAINT "brokers_in_house_split_range" CHECK ("brokers"."in_house_split" IS NULL OR "brokers"."in_house_split" BETWEEN 0 AND 100);--> statement-breakpoint
ALTER TABLE "brokers" ADD CONSTRAINT "brokers_self_generated_split_range" CHECK ("brokers"."self_generated_split" IS NULL OR "brokers"."self_generated_split" BETWEEN 0 AND 100);