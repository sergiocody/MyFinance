-- Replace is_remunerated boolean with account_class enum-like text field
ALTER TABLE accounts ADD COLUMN account_class TEXT NOT NULL DEFAULT 'standard'
  CHECK (account_class IN ('standard', 'remunerated', 'investment'));

-- Migrate existing data
UPDATE accounts SET account_class = 'remunerated' WHERE is_remunerated = true;

-- Drop old column
ALTER TABLE accounts DROP COLUMN is_remunerated;
