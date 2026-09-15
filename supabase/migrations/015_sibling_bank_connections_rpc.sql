-- Migration: RPC to fetch all bank connections that share a session with a reconnected account.
--
-- When a user re-authorizes a bank (e.g. Revolut), the Enable Banking session usually
-- covers every account they granted access to. During a reconnect we only receive the
-- accountId of the single account that triggered the flow, but we want to refresh the
-- session for ALL of that user's already-linked accounts at the same institution so the
-- user doesn't have to reconnect them one by one.
--
-- This SECURITY DEFINER function returns the sibling connections (same user + same
-- institution) together with the IBAN of their MyFinance account, so the callback can
-- match each account returned by the session (by IBAN) and update every connection.

CREATE OR REPLACE FUNCTION get_sibling_bank_connections(p_account_id UUID)
RETURNS TABLE (
  connection_id UUID,
  account_id UUID,
  iban TEXT,
  external_account_uid TEXT,
  institution_name TEXT,
  status TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH anchor AS (
    SELECT user_id, institution_name
    FROM bank_connections
    WHERE account_id = p_account_id
    LIMIT 1
  )
  SELECT
    bc.id AS connection_id,
    bc.account_id,
    a.iban,
    bc.external_account_uid,
    bc.institution_name,
    bc.status::text
  FROM bank_connections bc
  JOIN accounts a ON a.id = bc.account_id
  JOIN anchor ON TRUE
  WHERE bc.user_id IS NOT DISTINCT FROM anchor.user_id
    AND bc.institution_name IS NOT DISTINCT FROM anchor.institution_name;
$$;
