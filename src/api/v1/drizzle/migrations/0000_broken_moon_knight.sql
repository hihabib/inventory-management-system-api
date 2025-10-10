CREATE TYPE "public"."discount_type" AS ENUM('Fixed', 'Percentage');--> statement-breakpoint
CREATE TYPE "public"."delivery_status" AS ENUM('Order-Placed', 'Order-Shipped', 'Order-Completed', 'Order-Cancelled', 'Return-Placed', 'Return-Completed', 'Return-Cancelled');--> statement-breakpoint
CREATE TYPE "public"."transaction_status" AS ENUM('Pending', 'Canceled', 'Received', 'Shipped');--> statement-breakpoint
CREATE TYPE "public"."transaction_type" AS ENUM('Order', 'Return');--> statement-breakpoint
CREATE TYPE "public"."maintains_type" AS ENUM('Outlet', 'Production');--> statement-breakpoint
CREATE TABLE "customer" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"category_id" uuid DEFAULT null,
	"name" varchar NOT NULL,
	"email" varchar NOT NULL,
	"phone" varchar NOT NULL,
	"about" text DEFAULT '',
	"discount_type" "discount_type" DEFAULT null,
	"discount_amount" numeric DEFAULT null,
	CONSTRAINT "customer_email_unique" UNIQUE("email"),
	CONSTRAINT "customer_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
CREATE TABLE "customer_category" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"name" varchar NOT NULL,
	"discount_type" "discount_type" DEFAULT 'Fixed' NOT NULL,
	"discount_amount" numeric DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_due" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"maintains_id" uuid NOT NULL,
	"total_amount" numeric NOT NULL,
	"paid_amount" numeric NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delivery_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"status" "delivery_status" DEFAULT 'Order-Shipped',
	"maintains_id" uuid NOT NULL,
	"unit_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"price_per_quantity" numeric NOT NULL,
	"sent_quantity" numeric NOT NULL,
	"received_quantity" numeric NOT NULL,
	"ordered_quantity" numeric NOT NULL,
	"ordered_unit" varchar DEFAULT '',
	"order_note" text DEFAULT '',
	"needed_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"ordered_at" timestamp with time zone,
	"received_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "inner_transaction" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"transaction_type" "transaction_type" DEFAULT 'Order' NOT NULL,
	"status" "transaction_status" DEFAULT 'Pending' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "maintains" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" varchar NOT NULL,
	"description" text DEFAULT '',
	"type" "maintains_type" DEFAULT 'Outlet' NOT NULL,
	"location" text DEFAULT '',
	"phone" jsonb DEFAULT '[]'::jsonb
);
--> statement-breakpoint
CREATE TABLE "payment" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "payment_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 100 CACHE 1),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"maintains_id" uuid NOT NULL,
	"payments" jsonb NOT NULL,
	"total_amount" numeric NOT NULL,
	"customer_due_id" uuid DEFAULT null
);
--> statement-breakpoint
CREATE TABLE "payment_sale" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "payment_sale_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"payment_id" integer NOT NULL,
	"sale_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"name" varchar NOT NULL,
	"bengaliName" varchar NOT NULL,
	"low_stock_thres_hold" numeric DEFAULT 5 NOT NULL,
	"sku" varchar DEFAULT '',
	"main_unit_id" uuid,
	CONSTRAINT "product_sku_unique" UNIQUE("sku")
);
--> statement-breakpoint
CREATE TABLE "product_category" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" varchar NOT NULL,
	"description" text,
	"parent_id" uuid DEFAULT null
);
--> statement-breakpoint
CREATE TABLE "product_category_in_product" (
	"product_category_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	CONSTRAINT "product_category_in_product_pk" PRIMARY KEY("product_category_id","product_id")
);
--> statement-breakpoint
CREATE TABLE "related_stock" (

);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar NOT NULL,
	"description" text DEFAULT '',
	"default_route" varchar DEFAULT '/admin' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sale" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"maintains_id" uuid NOT NULL,
	"customer_category_id" uuid DEFAULT null,
	"customer_id" uuid DEFAULT null,
	"product_id" uuid NOT NULL,
	"product_name" varchar NOT NULL,
	"discount_type" "discount_type" DEFAULT 'Fixed' NOT NULL,
	"discount_amount" numeric DEFAULT 0 NOT NULL,
	"discount_note" text DEFAULT '',
	"sale_quantity" numeric NOT NULL,
	"sale_amount" numeric NOT NULL,
	"price_per_unit" numeric NOT NULL,
	"unit" varchar(20) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"unit_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"maintains_id" uuid NOT NULL,
	"stock_batch_id" uuid,
	"price_per_quantity" numeric NOT NULL,
	"quantity" numeric NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_batch" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"product_id" uuid NOT NULL,
	"maintains_id" uuid NOT NULL,
	"batch_number" varchar NOT NULL,
	"production_date" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" varchar NOT NULL,
	"description" text DEFAULT ''
);
--> statement-breakpoint
CREATE TABLE "unit_conversion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"product_id" uuid NOT NULL,
	"unit_id" uuid NOT NULL,
	"conversion_factor" numeric NOT NULL,
	CONSTRAINT "unit_conversion_product_id_unit_id_pk" PRIMARY KEY("product_id","unit_id")
);
--> statement-breakpoint
CREATE TABLE "unit_in_product" (
	"unit_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	CONSTRAINT "unit_in_product_product_id_unit_id_pk" PRIMARY KEY("product_id","unit_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" varchar NOT NULL,
	"password" varchar NOT NULL,
	"email" varchar NOT NULL,
	"full_name" varchar NOT NULL,
	"role_id" uuid NOT NULL,
	"maintains_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "customer" ADD CONSTRAINT "customer_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer" ADD CONSTRAINT "customer_category_id_customer_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."customer_category"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_category" ADD CONSTRAINT "customer_category_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_due" ADD CONSTRAINT "customer_due_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_due" ADD CONSTRAINT "customer_due_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_due" ADD CONSTRAINT "customer_due_maintains_id_maintains_id_fk" FOREIGN KEY ("maintains_id") REFERENCES "public"."maintains"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_history" ADD CONSTRAINT "delivery_history_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_history" ADD CONSTRAINT "delivery_history_maintains_id_maintains_id_fk" FOREIGN KEY ("maintains_id") REFERENCES "public"."maintains"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_history" ADD CONSTRAINT "delivery_history_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_history" ADD CONSTRAINT "delivery_history_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inner_transaction" ADD CONSTRAINT "inner_transaction_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_maintains_id_maintains_id_fk" FOREIGN KEY ("maintains_id") REFERENCES "public"."maintains"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_customer_due_id_customer_due_id_fk" FOREIGN KEY ("customer_due_id") REFERENCES "public"."customer_due"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_sale" ADD CONSTRAINT "payment_sale_payment_id_payment_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_sale" ADD CONSTRAINT "payment_sale_sale_id_sale_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sale"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product" ADD CONSTRAINT "product_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product" ADD CONSTRAINT "product_main_unit_id_units_id_fk" FOREIGN KEY ("main_unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_category" ADD CONSTRAINT "product_category_parent_id_product_category_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."product_category"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_category_in_product" ADD CONSTRAINT "product_category_in_product_product_category_id_product_category_id_fk" FOREIGN KEY ("product_category_id") REFERENCES "public"."product_category"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_category_in_product" ADD CONSTRAINT "product_category_in_product_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale" ADD CONSTRAINT "sale_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale" ADD CONSTRAINT "sale_maintains_id_maintains_id_fk" FOREIGN KEY ("maintains_id") REFERENCES "public"."maintains"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale" ADD CONSTRAINT "sale_customer_category_id_customer_category_id_fk" FOREIGN KEY ("customer_category_id") REFERENCES "public"."customer_category"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale" ADD CONSTRAINT "sale_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale" ADD CONSTRAINT "sale_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock" ADD CONSTRAINT "stock_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock" ADD CONSTRAINT "stock_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock" ADD CONSTRAINT "stock_maintains_id_maintains_id_fk" FOREIGN KEY ("maintains_id") REFERENCES "public"."maintains"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock" ADD CONSTRAINT "stock_stock_batch_id_stock_batch_id_fk" FOREIGN KEY ("stock_batch_id") REFERENCES "public"."stock_batch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_batch" ADD CONSTRAINT "stock_batch_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_batch" ADD CONSTRAINT "stock_batch_maintains_id_maintains_id_fk" FOREIGN KEY ("maintains_id") REFERENCES "public"."maintains"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_conversion" ADD CONSTRAINT "unit_conversion_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_conversion" ADD CONSTRAINT "unit_conversion_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_in_product" ADD CONSTRAINT "unit_in_product_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_in_product" ADD CONSTRAINT "unit_in_product_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_maintains_id_maintains_id_fk" FOREIGN KEY ("maintains_id") REFERENCES "public"."maintains"("id") ON DELETE no action ON UPDATE no action;