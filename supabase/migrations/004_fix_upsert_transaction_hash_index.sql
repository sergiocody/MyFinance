-- Migration 004: Make transaction hash uniqueness compatible with ON CONFLICT
--
-- PostgREST/Supabase upsert inference does not reliably target the partial
-- unique index created in previous migrations:
--   ON transactions (account_id, transaction_hash) WHERE transaction_hash IS NOT NULL
--
-- A regular unique index still allows multiple NULL transaction_hash values in
-- PostgreSQL, while also making ON CONFLICT(account_id, transaction_hash) work.

-- Remove duplicate non-null hashes before rebuilding the index.
DELETE FROM transactions
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY account_id, transaction_hash
             ORDER BY created_at ASC
           ) AS rn
    FROM transactions
    WHERE transaction_hash IS NOT NULL
  ) ranked
  WHERE rn > 1
);

DROP INDEX IF EXISTS idx_transactions_account_hash_unique;

CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_account_hash_unique
  ON transactions (account_id, transaction_hash);