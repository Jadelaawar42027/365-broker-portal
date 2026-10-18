CREATE TYPE "public"."company_sign_method" AS ENUM('auto', 'manual', 'outside');--> statement-breakpoint
CREATE TYPE "public"."contract_status" AS ENUM('pending', 'broker_signed', 'fully_signed', 'signed_outside', 'voided');--> statement-breakpoint
CREATE TABLE "company_signatures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"image_storage_key" text NOT NULL,
	"image_sha256" text NOT NULL,
	"authorization_text" text NOT NULL,
	"authorized_at" timestamp with time zone NOT NULL,
	"authorized_ip" text,
	"authorized_user_agent" text,
	"auto_sign" boolean DEFAULT true NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contract_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"broker_id" uuid NOT NULL,
	"template_id" uuid NOT NULL,
	"template_key" text NOT NULL,
	"status" "contract_status" DEFAULT 'pending' NOT NULL,
	"values" jsonb,
	"unsigned_storage_key" text,
	"unsigned_sha256" text,
	"broker_signed_storage_key" text,
	"broker_signed_sha256" text,
	"final_storage_key" text,
	"final_sha256" text,
	"final_file_id" uuid,
	"broker_signature_storage_key" text,
	"broker_signature_method" text,
	"broker_signed_at" timestamp with time zone,
	"broker_ip" text,
	"broker_user_agent" text,
	"consent_text" text,
	"company_signature_id" uuid,
	"company_signed_by" uuid,
	"company_signed_at" timestamp with time zone,
	"company_sign_method" "company_sign_method",
	"outside_signed_on" date,
	"viewed_at" timestamp with time zone,
	"voided_at" timestamp with time zone,
	"voided_by" uuid,
	"void_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contract_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"version" integer NOT NULL,
	"title" text NOT NULL,
	"pdf" "bytea" NOT NULL,
	"pdf_sha256" text NOT NULL,
	"fields" jsonb NOT NULL,
	"font" text NOT NULL,
	"font_file" "bytea",
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contract_templates_key_version_unique" UNIQUE("key","version")
);
--> statement-breakpoint
ALTER TABLE "brokers" ADD COLUMN "mailing_address" text;--> statement-breakpoint
ALTER TABLE "brokers" ADD COLUMN "florida_license_no" text;--> statement-breakpoint
ALTER TABLE "company_signatures" ADD CONSTRAINT "company_signatures_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_documents" ADD CONSTRAINT "contract_documents_broker_id_brokers_id_fk" FOREIGN KEY ("broker_id") REFERENCES "public"."brokers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_documents" ADD CONSTRAINT "contract_documents_template_id_contract_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."contract_templates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_documents" ADD CONSTRAINT "contract_documents_final_file_id_files_id_fk" FOREIGN KEY ("final_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_documents" ADD CONSTRAINT "contract_documents_company_signature_id_company_signatures_id_fk" FOREIGN KEY ("company_signature_id") REFERENCES "public"."company_signatures"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_documents" ADD CONSTRAINT "contract_documents_company_signed_by_users_id_fk" FOREIGN KEY ("company_signed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_documents" ADD CONSTRAINT "contract_documents_voided_by_users_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "company_signatures_user_idx" ON "company_signatures" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "contract_documents_broker_idx" ON "contract_documents" USING btree ("broker_id","template_key","created_at");