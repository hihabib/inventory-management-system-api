-- Manual migration: Backfill customer_due_updates from customer_due
-- Inserts a snapshot row for customer_due records where paid_amount > 0
-- created_at of customer_due_updates is set to customer_due.updated_at
-- updated_by is set to customer_due.created_by (best available historical actor)
-- collected_amount is set to paid_amount snapshot for baseline rows

BEGIN;

-- Ensure index exists for efficient lookups (optional but helpful)
CREATE INDEX IF NOT EXISTS idx_customer_due_updates_customer_due_id
  ON "customer_due_updates" ("customer_due_id");

INSERT INTO "customer_due_updates" (
  "customer_due_id",
  "updated_by",
  "total_amount",
  "paid_amount",
  "collected_amount",
  "created_at",
  "updated_at"
)
SELECT
  cd."id" AS customer_due_id,
  cd."created_by" AS updated_by,
  cd."total_amount" AS total_amount,
  cd."paid_amount" AS paid_amount,
  cd."paid_amount" AS collected_amount,
  cd."updated_at" AS created_at,
  cd."updated_at" AS updated_at
FROM "customer_due" cd
WHERE cd."paid_amount" > 0
  AND NOT EXISTS (
    SELECT 1 FROM "customer_due_updates" u
    WHERE u."customer_due_id" = cd."id"
      AND u."created_at" = cd."updated_at"
  );

COMMIT;