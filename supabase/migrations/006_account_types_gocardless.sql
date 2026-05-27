-- Migration: Account Types + GoCardless Bank Connections
-- Splits accounts into manual (cash, investments) and automated (bank-connected) modes.

-- 1. Add account_mode to accounts
ALTER TABLE accounts
  ADD COLUMN account_mode TEXT NOT NULL DEFAULT 'manual'
    CHECK (account_mode IN ('manual', 'automated'));

-- 2. Separate table for GoCardless bank connection details (1:1 with automated accounts)
CREATE TABLE bank_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL UNIQUE REFERENCES accounts(id) ON DELETE CASCADE,
  institution_id TEXT NOT NULL,         -- GoCardless institution ID (e.g., "REVOLUT_REVOGB21")
  institution_name TEXT,                -- Human-readable bank name
  requisition_id TEXT,                  -- GoCardless requisition/link ID
  gocardless_account_id TEXT,           -- The linked external bank account ID
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'linked', 'expired', 'error', 'suspended')),
  last_synced_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Mark transaction source (manual entry vs bank sync)
ALTER TABLE transactions
  ADD COLUMN source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'sync'));

-- 4. Store external bank transaction ID for deduplication during sync
ALTER TABLE transactions
  ADD COLUMN external_id TEXT;

-- 5. Unique constraint: one external_id per account (prevents duplicate synced transactions)
CREATE UNIQUE INDEX idx_transactions_external_id
  ON transactions(account_id, external_id)
  WHERE external_id IS NOT NULL;

-- 6. Index for bank_connections lookups
CREATE INDEX idx_bank_connections_account ON bank_connections(account_id);
CREATE INDEX idx_bank_connections_user ON bank_connections(user_id);

-- 7. Table to cache GoCardless API tokens (single-row, service-level)
CREATE TABLE gocardless_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  access_expires_at TIMESTAMPTZ NOT NULL,
  refresh_token TEXT NOT NULL,
  refresh_expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 8. RLS for new tables
ALTER TABLE bank_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE gocardless_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_manage_own_bank_connections" ON bank_connections
  FOR ALL USING (is_allowed_email() AND auth.uid() = user_id);

CREATE POLICY "users_manage_own_tokens" ON gocardless_tokens
  FOR ALL USING (is_allowed_email() AND auth.uid() = user_id);
