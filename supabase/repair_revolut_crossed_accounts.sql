-- ============================================================================
-- Repair: Revolut EUR/GBP accounts got cross-linked (mixed balances)
-- ----------------------------------------------------------------------------
-- Symptom: the GBP (libras) account shows the EUR account's balance (e.g. 417.02
-- instead of 0.29) and the EUR account's transactions. Root cause: a previous
-- reconnect matched the GBP MyFinance account to the EUR *bank* account by
-- position, so the GBP connection's `external_account_uid` (and the balance,
-- transactions and even the backfilled IBAN) all point to the EUR account.
--
-- Run STEP 1 first and confirm the rows. Then run STEP 2 to repair, and finally
-- reconnect Revolut from the app (authorising BOTH accounts) and press Sync.
-- ============================================================================

-- STEP 1 — INSPECT (read-only). Confirm which account is the GBP one and that
-- its connection wrongly points at the EUR bank account.
SELECT
  a.id            AS account_id,
  a.name          AS account_name,
  a.currency,
  a.iban,
  a.current_balance,
  bc.id           AS connection_id,
  bc.institution_name,
  bc.status,
  bc.external_account_uid,
  bc.last_synced_at
FROM accounts a
JOIN bank_connections bc ON bc.account_id = a.id
WHERE bc.institution_name ILIKE '%revolut%'
   OR a.name ILIKE '%revolut%'
ORDER BY a.currency;

-- Also count the synced transactions currently attached to the GBP account
-- (these belong to the EUR account and will be removed in STEP 2):
SELECT a.id AS gbp_account_id, a.name, COUNT(t.id) AS synced_tx_to_delete
FROM accounts a
LEFT JOIN transactions t
  ON t.account_id = a.id AND t.source = 'sync'
JOIN bank_connections bc ON bc.account_id = a.id
WHERE a.currency = 'GBP'
  AND (bc.institution_name ILIKE '%revolut%' OR a.name ILIKE '%revolut%')
GROUP BY a.id, a.name;

-- ============================================================================
-- STEP 2 — REPAIR (destructive: deletes the wrongly-imported synced rows on the
-- GBP account only). Review STEP 1 output first. The filters below target the
-- Revolut GBP account exclusively; the EUR account (currency='EUR') is untouched.
-- ============================================================================
BEGIN;

-- 2a) Clear the IBAN the crossed sync backfilled onto the GBP account (it holds
--     the EUR account's IBAN, which would keep re-matching it to the EUR account).
UPDATE accounts a
SET iban = NULL
FROM bank_connections bc
WHERE bc.account_id = a.id
  AND a.currency = 'GBP'
  AND (bc.institution_name ILIKE '%revolut%' OR a.name ILIKE '%revolut%');

-- 2b) Delete every auto-synced transaction on the GBP account (they are the EUR
--     account's transactions). Manual/imported rows are left intact.
DELETE FROM transactions t
USING accounts a, bank_connections bc
WHERE t.account_id = a.id
  AND bc.account_id = a.id
  AND t.source = 'sync'
  AND a.currency = 'GBP'
  AND (bc.institution_name ILIKE '%revolut%' OR a.name ILIKE '%revolut%');

-- 2c) Reset the crossed session link so the next reconnect re-links cleanly and
--     the next sync rebuilds full history from scratch. Status 'expired' makes
--     the app show a "Reconnect" button for this account.
UPDATE bank_connections bc
SET external_account_uid = NULL,
    session_id           = NULL,
    session_expires_at   = NULL,
    last_synced_at       = NULL,
    status               = 'expired',
    updated_at           = NOW()
FROM accounts a
WHERE bc.account_id = a.id
  AND a.currency = 'GBP'
  AND (bc.institution_name ILIKE '%revolut%' OR a.name ILIKE '%revolut%');

-- 2d) Reset the wrong balance (corrected automatically on the next sync).
UPDATE accounts a
SET current_balance = 0,
    updated_at = NOW()
FROM bank_connections bc
WHERE bc.account_id = a.id
  AND a.currency = 'GBP'
  AND (bc.institution_name ILIKE '%revolut%' OR a.name ILIKE '%revolut%');

COMMIT;

-- ============================================================================
-- AFTER STEP 2
--  1. Make sure the RPC update in supabase/migrations/015_sibling_bank_connections_rpc.sql
--     (now returning `currency`) has been re-run in this SQL editor.
--  2. In the app, open the GBP Revolut account and press "Reconnect".
--     Authorise BOTH Revolut accounts in the bank screen.
--     -> EUR re-links by IBAN, GBP re-links by its unique currency (no more mixing).
--  3. Press "Sync" on each account. Balances should read EUR ~417 and GBP ~0.29.
-- ============================================================================
