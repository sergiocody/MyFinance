-- Add parent_account_id for sub-account relationships
ALTER TABLE accounts ADD COLUMN parent_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL;
CREATE INDEX idx_accounts_parent ON accounts(parent_account_id);
