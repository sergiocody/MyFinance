-- Add is_remunerated flag to accounts
ALTER TABLE accounts ADD COLUMN is_remunerated BOOLEAN NOT NULL DEFAULT false;
