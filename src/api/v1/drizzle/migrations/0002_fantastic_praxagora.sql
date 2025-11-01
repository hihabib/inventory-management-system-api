CREATE TABLE "daily_stock_record" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"maintains_id" uuid NOT NULL,
	"unit_id" uuid NOT NULL,
	"quantity" numeric NOT NULL,
	"price_per_quantity" numeric NOT NULL
);
--> statement-breakpoint
ALTER TABLE "daily_stock_record" ADD CONSTRAINT "daily_stock_record_maintains_id_maintains_id_fk" FOREIGN KEY ("maintains_id") REFERENCES "public"."maintains"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_stock_record" ADD CONSTRAINT "daily_stock_record_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;