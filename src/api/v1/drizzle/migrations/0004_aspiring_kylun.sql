CREATE TABLE "cash_sending" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"maintains_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"note" text DEFAULT '',
	"cash_amount" numeric NOT NULL,
	"sending_time" timestamp with time zone NOT NULL,
	"cash_of" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customer" DROP CONSTRAINT "customer_email_unique";--> statement-breakpoint
ALTER TABLE "customer" ALTER COLUMN "email" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "customer" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "cash_sending" ADD CONSTRAINT "cash_sending_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_sending" ADD CONSTRAINT "cash_sending_maintains_id_maintains_id_fk" FOREIGN KEY ("maintains_id") REFERENCES "public"."maintains"("id") ON DELETE no action ON UPDATE no action;