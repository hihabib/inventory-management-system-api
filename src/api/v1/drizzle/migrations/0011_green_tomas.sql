ALTER TABLE "sale" ADD COLUMN "sale_unit_id" uuid DEFAULT null;--> statement-breakpoint
ALTER TABLE "sale" ADD COLUMN "stock_batch_id" uuid DEFAULT null;--> statement-breakpoint
ALTER TABLE "sale" ADD CONSTRAINT "sale_sale_unit_id_units_id_fk" FOREIGN KEY ("sale_unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale" ADD CONSTRAINT "sale_stock_batch_id_stock_batch_id_fk" FOREIGN KEY ("stock_batch_id") REFERENCES "public"."stock_batch"("id") ON DELETE no action ON UPDATE no action;