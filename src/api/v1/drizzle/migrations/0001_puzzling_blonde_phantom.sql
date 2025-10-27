ALTER TYPE "public"."delivery_status" ADD VALUE 'Reset-Requested';--> statement-breakpoint
ALTER TYPE "public"."delivery_status" ADD VALUE 'Reset-Completed';--> statement-breakpoint
ALTER TABLE "delivery_history" DROP CONSTRAINT "delivery_history_product_id_product_id_fk";
--> statement-breakpoint
ALTER TABLE "product_category_in_product" DROP CONSTRAINT "product_category_in_product_product_id_product_id_fk";
--> statement-breakpoint
ALTER TABLE "sale" DROP CONSTRAINT "sale_product_id_product_id_fk";
--> statement-breakpoint
ALTER TABLE "stock" DROP CONSTRAINT "stock_product_id_product_id_fk";
--> statement-breakpoint
ALTER TABLE "stock_batch" DROP CONSTRAINT "stock_batch_product_id_product_id_fk";
--> statement-breakpoint
ALTER TABLE "unit_conversion" DROP CONSTRAINT "unit_conversion_product_id_product_id_fk";
--> statement-breakpoint
ALTER TABLE "unit_in_product" DROP CONSTRAINT "unit_in_product_product_id_product_id_fk";
--> statement-breakpoint
ALTER TABLE "delivery_history" ALTER COLUMN "product_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "sale" ALTER COLUMN "product_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "stock" ALTER COLUMN "product_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_batch" ALTER COLUMN "product_id" DROP NOT NULL;--> statement-breakpoint
/* 
    Unfortunately in current drizzle-kit version we can't automatically get name for primary key.
    We are working on making it available!

    Meanwhile you can:
        1. Check pk name in your database, by running
            SELECT constraint_name FROM information_schema.table_constraints
            WHERE table_schema = 'public'
                AND table_name = 'unit_conversion'
                AND constraint_type = 'PRIMARY KEY';
        2. Uncomment code below and paste pk name manually
        
    Hope to release this update as soon as possible
*/

-- ALTER TABLE "unit_conversion" DROP CONSTRAINT "<constraint_name>";--> statement-breakpoint
ALTER TABLE "unit_conversion" ALTER COLUMN "id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "delivery_history" ADD COLUMN "latest_unit_price_data" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "product" ADD COLUMN "default_order_unit" varchar DEFAULT '';--> statement-breakpoint
ALTER TABLE "product" ADD COLUMN "is_deleted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "product" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "product_category" ADD COLUMN "is_deleted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "product_category" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sale" ADD COLUMN "quantity_in_main_unit" numeric;--> statement-breakpoint
ALTER TABLE "sale" ADD COLUMN "main_unit_price" numeric;--> statement-breakpoint
ALTER TABLE "stock_batch" ADD COLUMN "created_by" uuid;--> statement-breakpoint
ALTER TABLE "delivery_history" ADD CONSTRAINT "delivery_history_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_category_in_product" ADD CONSTRAINT "product_category_in_product_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale" ADD CONSTRAINT "sale_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock" ADD CONSTRAINT "stock_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_batch" ADD CONSTRAINT "stock_batch_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_batch" ADD CONSTRAINT "stock_batch_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_conversion" ADD CONSTRAINT "unit_conversion_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_in_product" ADD CONSTRAINT "unit_in_product_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_conversion" ADD CONSTRAINT "unit_conversion_id_unique" UNIQUE("id");