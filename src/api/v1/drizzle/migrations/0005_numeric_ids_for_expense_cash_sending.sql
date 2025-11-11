-- Convert UUID primary keys to integer identity for expenses and cash_sending
-- WARNING: This regenerates IDs; ensure no external FKs depend on old UUIDs.

BEGIN;

-- expenses table conversion
ALTER TABLE "expenses" ADD COLUMN "id_int" integer;
ALTER TABLE "expenses" ALTER COLUMN "id_int" SET NOT NULL;
CREATE SEQUENCE IF NOT EXISTS "expenses_id_seq" OWNED BY "expenses"."id_int";
UPDATE "expenses" SET "id_int" = nextval('expenses_id_seq');
ALTER TABLE "expenses" DROP CONSTRAINT IF EXISTS "expenses_pkey";
ALTER TABLE "expenses" DROP COLUMN "id";
ALTER TABLE "expenses" RENAME COLUMN "id_int" TO "id";
ALTER TABLE "expenses" ADD PRIMARY KEY ("id");
ALTER TABLE "expenses" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY;

-- cash_sending table conversion
ALTER TABLE "cash_sending" ADD COLUMN "id_int" integer;
ALTER TABLE "cash_sending" ALTER COLUMN "id_int" SET NOT NULL;
CREATE SEQUENCE IF NOT EXISTS "cash_sending_id_seq" OWNED BY "cash_sending"."id_int";
UPDATE "cash_sending" SET "id_int" = nextval('cash_sending_id_seq');
ALTER TABLE "cash_sending" DROP CONSTRAINT IF EXISTS "cash_sending_pkey";
ALTER TABLE "cash_sending" DROP COLUMN "id";
ALTER TABLE "cash_sending" RENAME COLUMN "id_int" TO "id";
ALTER TABLE "cash_sending" ADD PRIMARY KEY ("id");
ALTER TABLE "cash_sending" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY;

COMMIT;