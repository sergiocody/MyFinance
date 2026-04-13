-- Migration 003: Fix transaction hash format + deduplicate + recalculate balances + SECURITY DEFINER trigger
--
-- PROBLEM 1: Migration 002 computed hashes as MD5.
--   The JS client generates plain-text hashes ("2026-02-15|expense|20.00|lidl").
--   Because the formats differ, the unique constraint never catches duplicates
--   between seeded data and CSV-imported data, and filtering by account shows
--   only the original seed rows (not newly imported ones) if they were
--   inserted into the wrong account.
--
-- PROBLEM 2: The trigger update_account_balance() runs as SECURITY INVOKER,
--   which can fail under RLS because the calling role (anon/authenticated) may
--   not have UPDATE on accounts. SECURITY DEFINER fixes that.
--
-- Steps:
--   1. Convert all existing hashes to plain-text format matching the JS client
--   2. Remove duplicate rows (same account + plain hash), keeping the oldest
--   3. Rebuild the unique index on the new format
--   4. Recalculate current_balance for every account from scratch
--   5. Replace the trigger function with SECURITY DEFINER

-- -------------------------------------------------------------------------
-- Step 1: Compute plain-text hashes into a temp column
-- -------------------------------------------------------------------------
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS _plain_hash TEXT;

UPDATE transactions
SET _plain_hash = concat_ws('|',
  date::text,
  type,
  trim(to_char(amount::numeric, 'FM999999999999990.00')),
  lower(regexp_replace(coalesce(description, ''), '\s+', ' ', 'g'))
);

-- -------------------------------------------------------------------------
-- Step 2: Deduplicate — keep only the oldest row per (account_id, _plain_hash)
-- -------------------------------------------------------------------------
DELETE FROM transactions
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY account_id, _plain_hash
             ORDER BY created_at ASC
           ) AS rn
    FROM transactions
    WHERE _plain_hash IS NOT NULL
  ) ranked
  WHERE rn > 1
);

-- -------------------------------------------------------------------------
-- Step 3: Replace stored hashes with plain-text and rebuild unique index
-- -------------------------------------------------------------------------
DROP INDEX IF EXISTS idx_transactions_account_hash_unique;

UPDATE transactions
SET transaction_hash = _plain_hash
WHERE _plain_hash IS NOT NULL;

CREATE UNIQUE INDEX idx_transactions_account_hash_unique
  ON transactions (account_id, transaction_hash)
  WHERE transaction_hash IS NOT NULL;

ALTER TABLE transactions DROP COLUMN _plain_hash;

-- -------------------------------------------------------------------------
-- Step 4: Recalculate current_balance for all accounts from scratch
--         initial_balance + sum of all income/expense/transfer transactions
-- -------------------------------------------------------------------------
UPDATE accounts a
SET current_balance = a.initial_balance + COALESCE((
  SELECT
    SUM(
      CASE
        WHEN t.type = 'income'   THEN  t.amount
        WHEN t.type = 'expense'  THEN -t.amount
        WHEN t.type = 'transfer' THEN -t.amount
        ELSE 0
      END
    )
  FROM transactions t
  WHERE t.account_id = a.id
), 0),
updated_at = now();

-- Credit the destination side of transfers
UPDATE accounts a
SET current_balance = a.current_balance + COALESCE((
  SELECT SUM(t.amount)
  FROM transactions t
  WHERE t.transfer_to_account_id = a.id
    AND t.type = 'transfer'
), 0),
updated_at = now();

-- -------------------------------------------------------------------------
-- Step 5: Replace trigger function with SECURITY DEFINER so it can always
--         UPDATE accounts regardless of the caller's RLS context
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_account_balance()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $func$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Reverse old values
    IF OLD.type = 'income' THEN
      UPDATE accounts SET current_balance = current_balance - OLD.amount, updated_at = now() WHERE id = OLD.account_id;
    ELSIF OLD.type = 'expense' THEN
      UPDATE accounts SET current_balance = current_balance + OLD.amount, updated_at = now() WHERE id = OLD.account_id;
    ELSIF OLD.type = 'transfer' THEN
      UPDATE accounts SET current_balance = current_balance + OLD.amount, updated_at = now() WHERE id = OLD.account_id;
      IF OLD.transfer_to_account_id IS NOT NULL THEN
        UPDATE accounts SET current_balance = current_balance - OLD.amount, updated_at = now() WHERE id = OLD.transfer_to_account_id;
      END IF;
    END IF;
    -- Apply new values
    IF NEW.type = 'income' THEN
      UPDATE accounts SET current_balance = current_balance + NEW.amount, updated_at = now() WHERE id = NEW.account_id;
    ELSIF NEW.type = 'expense' THEN
      UPDATE accounts SET current_balance = current_balance - NEW.amount, updated_at = now() WHERE id = NEW.account_id;
    ELSIF NEW.type = 'transfer' THEN
      UPDATE accounts SET current_balance = current_balance - NEW.amount, updated_at = now() WHERE id = NEW.account_id;
      IF NEW.transfer_to_account_id IS NOT NULL THEN
        UPDATE accounts SET current_balance = current_balance + NEW.amount, updated_at = now() WHERE id = NEW.transfer_to_account_id;
      END IF;
    END IF;
    RETURN NULL;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.type = 'income' THEN
      UPDATE accounts SET current_balance = current_balance + NEW.amount, updated_at = now() WHERE id = NEW.account_id;
    ELSIF NEW.type = 'expense' THEN
      UPDATE accounts SET current_balance = current_balance - NEW.amount, updated_at = now() WHERE id = NEW.account_id;
    ELSIF NEW.type = 'transfer' THEN
      UPDATE accounts SET current_balance = current_balance - NEW.amount, updated_at = now() WHERE id = NEW.account_id;
      IF NEW.transfer_to_account_id IS NOT NULL THEN
        UPDATE accounts SET current_balance = current_balance + NEW.amount, updated_at = now() WHERE id = NEW.transfer_to_account_id;
      END IF;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.type = 'income' THEN
      UPDATE accounts SET current_balance = current_balance - OLD.amount, updated_at = now() WHERE id = OLD.account_id;
    ELSIF OLD.type = 'expense' THEN
      UPDATE accounts SET current_balance = current_balance + OLD.amount, updated_at = now() WHERE id = OLD.account_id;
    ELSIF OLD.type = 'transfer' THEN
      UPDATE accounts SET current_balance = current_balance + OLD.amount, updated_at = now() WHERE id = OLD.account_id;
      IF OLD.transfer_to_account_id IS NOT NULL THEN
        UPDATE accounts SET current_balance = current_balance - OLD.amount, updated_at = now() WHERE id = OLD.transfer_to_account_id;
      END IF;
    END IF;
  END IF;

  RETURN NULL;
END;
$func$;

-- -------------------------------------------------------------------------
-- Verification notice
-- -------------------------------------------------------------------------
DO $$
DECLARE
  tx_count   INTEGER;
  acct_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO tx_count   FROM transactions;
  SELECT COUNT(*) INTO acct_count FROM accounts;
  RAISE NOTICE 'Migration 003 complete: % transactions, % accounts with recalculated balances', tx_count, acct_count;
END;
$$;
