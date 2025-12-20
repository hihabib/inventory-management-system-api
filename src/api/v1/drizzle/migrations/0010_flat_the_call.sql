ALTER TABLE "cash_sending" ADD COLUMN "cash_sending_by" text DEFAULT 'By Bank' NOT NULL;--> statement-breakpoint
ALTER TABLE "unit_conversion" ADD COLUMN "id" uuid DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "unit_conversion" ADD CONSTRAINT "unit_conversion_id_unique" UNIQUE("id");