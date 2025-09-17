-- Drop existing payment table and related constraints
DROP TABLE IF EXISTS "payment_sale";
DROP TABLE IF EXISTS "payment";

-- Create new payment table with integer ID starting from 100
CREATE TABLE "payment" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "payment_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 100 CACHE 1),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"maintains_id" uuid NOT NULL,
	"payments" jsonb NOT NULL,
	"total_amount" numeric NOT NULL,
	"customer_due_id" uuid DEFAULT null
);

-- Create new payment_sale junction table
CREATE TABLE "payment_sale" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "payment_sale_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"payment_id" integer NOT NULL,
	"sale_id" uuid NOT NULL
);

-- Add foreign key constraints
ALTER TABLE "customer" ADD CONSTRAINT "customer_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "customer" ADD CONSTRAINT "customer_category_id_customer_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "customer_category"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "customer_category" ADD CONSTRAINT "customer_category_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "customer_due" ADD CONSTRAINT "customer_due_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "customer_due" ADD CONSTRAINT "customer_due_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "customer"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "customer_due" ADD CONSTRAINT "customer_due_maintains_id_maintains_id_fk" FOREIGN KEY ("maintains_id") REFERENCES "maintains"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "payment" ADD CONSTRAINT "payment_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "payment" ADD CONSTRAINT "payment_maintains_id_maintains_id_fk" FOREIGN KEY ("maintains_id") REFERENCES "maintains"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "payment" ADD CONSTRAINT "payment_customer_due_id_customer_due_id_fk" FOREIGN KEY ("customer_due_id") REFERENCES "customer_due"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "payment_sale" ADD CONSTRAINT "payment_sale_payment_id_payment_id_fk" FOREIGN KEY ("payment_id") REFERENCES "payment"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "payment_sale" ADD CONSTRAINT "payment_sale_sale_id_sale_id_fk" FOREIGN KEY ("sale_id") REFERENCES "sale"("id") ON DELETE no action ON UPDATE no action;