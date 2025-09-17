CREATE TYPE "public"."transaction_status" AS ENUM('Pending', 'Canceled', 'Received', 'Shipped');--> statement-breakpoint
CREATE TYPE "public"."transaction_type" AS ENUM('Order', 'Return');--> statement-breakpoint
CREATE TYPE "public"."maintains_type" AS ENUM('Outlet', 'Production');--> statement-breakpoint
CREATE TABLE "inner_transaction" (
	"id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"transaction_type" "transaction_type" DEFAULT 'Order' NOT NULL,
	"status" "transaction_status" DEFAULT 'Pending' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "maintains" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"name" varchar NOT NULL,
	"description" text DEFAULT '',
	"type" "maintains_type" DEFAULT 'Outlet' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product" (
	"id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"name" varchar NOT NULL,
	"bengaliName" varchar NOT NULL,
	"low_stock_thres_hold" numeric DEFAULT 5 NOT NULL,
	"sku" varchar DEFAULT '',
	"main_unit_id" uuid
);
--> statement-breakpoint
CREATE TABLE "product_category" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"name" varchar NOT NULL,
	"description" text,
	"parent_id" uuid DEFAULT null
);
--> statement-breakpoint
CREATE TABLE "product_category_in_product" (
	"product_category_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	CONSTRAINT "product_category_in_product_product_category_id_product_id_pk" PRIMARY KEY("product_category_id","product_id"),
	CONSTRAINT "product_category_in_product_product_category_id_unique" UNIQUE("product_category_id"),
	CONSTRAINT "product_category_in_product_product_id_unique" UNIQUE("product_id")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar NOT NULL,
	"description" text DEFAULT '',
	"default_route" varchar DEFAULT '/admin' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"unit_id" uuid,
	"product_id" uuid,
	"maintains_id" uuid,
	"price_per_quantity" numeric NOT NULL,
	"quantity" numeric NOT NULL
);
--> statement-breakpoint
CREATE TABLE "units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"name" varchar NOT NULL,
	"description" text DEFAULT ''
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
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "inner_transaction" ADD CONSTRAINT "inner_transaction_id_users_id_fk" FOREIGN KEY ("id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product" ADD CONSTRAINT "product_id_users_id_fk" FOREIGN KEY ("id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product" ADD CONSTRAINT "product_main_unit_id_units_id_fk" FOREIGN KEY ("main_unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_category" ADD CONSTRAINT "product_category_parent_id_product_category_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."product_category"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_category_in_product" ADD CONSTRAINT "product_category_in_product_product_category_id_product_category_id_fk" FOREIGN KEY ("product_category_id") REFERENCES "public"."product_category"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_category_in_product" ADD CONSTRAINT "product_category_in_product_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock" ADD CONSTRAINT "stock_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock" ADD CONSTRAINT "stock_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock" ADD CONSTRAINT "stock_maintains_id_maintains_id_fk" FOREIGN KEY ("maintains_id") REFERENCES "public"."maintains"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_in_product" ADD CONSTRAINT "unit_in_product_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_in_product" ADD CONSTRAINT "unit_in_product_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_maintains_id_maintains_id_fk" FOREIGN KEY ("maintains_id") REFERENCES "public"."maintains"("id") ON DELETE no action ON UPDATE no action;