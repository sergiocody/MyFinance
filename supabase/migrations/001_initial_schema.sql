-- MyFinance Database Schema
-- Run this in your Supabase SQL editor

-- Categories for transactions (e.g., Food, Transport, Salary)
CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense', 'transfer')),
  icon TEXT,
  color TEXT DEFAULT '#6366f1',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Labels/tags for transactions
CREATE TABLE labels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  color TEXT DEFAULT '#8b5cf6',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Bank accounts / wallets
CREATE TABLE accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('checking', 'savings', 'credit_card', 'cash', 'investment', 'other')),
  currency TEXT DEFAULT 'EUR',
  initial_balance DECIMAL(12,2) DEFAULT 0,
  current_balance DECIMAL(12,2) DEFAULT 0,
  bank_name TEXT,
  color TEXT DEFAULT '#3b82f6',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Transactions
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense', 'transfer')),
  amount DECIMAL(12,2) NOT NULL,
  description TEXT,
  notes TEXT,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  transfer_to_account_id UUID REFERENCES accounts(id),
  import_id UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Many-to-many: transactions <-> labels
CREATE TABLE transaction_labels (
  transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  label_id UUID NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
  PRIMARY KEY (transaction_id, label_id)
);

-- Import history log
CREATE TABLE imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename TEXT NOT NULL,
  account_id UUID REFERENCES accounts(id),
  rows_imported INTEGER DEFAULT 0,
  rows_skipped INTEGER DEFAULT 0,
  status TEXT DEFAULT 'completed',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for performance
CREATE INDEX idx_transactions_account ON transactions(account_id);
CREATE INDEX idx_transactions_category ON transactions(category_id);
CREATE INDEX idx_transactions_date ON transactions(date);
CREATE INDEX idx_transactions_type ON transactions(type);
CREATE INDEX idx_transaction_labels_label ON transaction_labels(label_id);

-- Function to update account balance
CREATE OR REPLACE FUNCTION update_account_balance()
RETURNS TRIGGER AS $$
BEGIN
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
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_balance
AFTER INSERT OR DELETE ON transactions
FOR EACH ROW EXECUTE FUNCTION update_account_balance();

-- Seed default categories
INSERT INTO categories (name, type, icon, color) VALUES
  ('Salary', 'income', 'banknote', '#22c55e'),
  ('Freelance', 'income', 'laptop', '#10b981'),
  ('Investment Returns', 'income', 'trending-up', '#14b8a6'),
  ('Other Income', 'income', 'plus-circle', '#06b6d4'),
  ('Groceries', 'expense', 'shopping-cart', '#ef4444'),
  ('Restaurants', 'expense', 'utensils', '#f97316'),
  ('Transport', 'expense', 'car', '#f59e0b'),
  ('Housing', 'expense', 'home', '#eab308'),
  ('Utilities', 'expense', 'zap', '#84cc16'),
  ('Healthcare', 'expense', 'heart-pulse', '#ec4899'),
  ('Entertainment', 'expense', 'tv', '#a855f7'),
  ('Shopping', 'expense', 'shopping-bag', '#8b5cf6'),
  ('Education', 'expense', 'book-open', '#6366f1'),
  ('Travel', 'expense', 'plane', '#3b82f6'),
  ('Subscriptions', 'expense', 'repeat', '#0ea5e9'),
  ('Insurance', 'expense', 'shield', '#14b8a6'),
  ('Taxes', 'expense', 'landmark', '#64748b'),
  ('Other Expense', 'expense', 'circle-dot', '#94a3b8'),
  ('Transfer', 'transfer', 'arrow-right-left', '#6366f1');

-- Seed default labels
INSERT INTO labels (name, color) VALUES
  ('Essential', '#ef4444'),
  ('Recurring', '#f97316'),
  ('One-time', '#3b82f6'),
  ('Discretionary', '#8b5cf6'),
  ('Tax Deductible', '#22c55e');
