-- Multi-user auth, row-level security, and duplicate transaction protection

ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_name_key;
ALTER TABLE labels DROP CONSTRAINT IF EXISTS labels_name_key;

ALTER TABLE categories ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid();
ALTER TABLE labels ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid();
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid();
ALTER TABLE imports ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid();
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid();
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS transaction_hash TEXT;

UPDATE imports AS i
SET user_id = a.user_id
FROM accounts AS a
WHERE i.account_id = a.id
  AND i.user_id IS NULL;

UPDATE transactions AS t
SET user_id = a.user_id
FROM accounts AS a
WHERE t.account_id = a.id
  AND t.user_id IS NULL;

UPDATE transactions
SET transaction_hash = md5(
  concat_ws(
    '|',
    date::text,
    type,
    trim(to_char(amount::numeric, 'FM999999999999990.00')),
    lower(regexp_replace(coalesce(description, ''), '\s+', ' ', 'g'))
  )
)
WHERE transaction_hash IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_owner_name
ON categories (coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));

CREATE UNIQUE INDEX IF NOT EXISTS idx_labels_owner_name
ON labels (coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));

CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_account_hash_unique
ON transactions (account_id, transaction_hash)
WHERE transaction_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_categories_user_id ON categories(user_id);
CREATE INDEX IF NOT EXISTS idx_labels_user_id ON labels(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_imports_user_id ON imports(user_id);

CREATE OR REPLACE FUNCTION update_account_balance()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
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
$$ LANGUAGE plpgsql;

ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE imports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS accounts_select_own ON accounts;
DROP POLICY IF EXISTS accounts_insert_own ON accounts;
DROP POLICY IF EXISTS accounts_update_own ON accounts;
DROP POLICY IF EXISTS accounts_delete_own ON accounts;
CREATE POLICY accounts_select_own ON accounts FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY accounts_insert_own ON accounts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY accounts_update_own ON accounts FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY accounts_delete_own ON accounts FOR DELETE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS categories_select_visible ON categories;
DROP POLICY IF EXISTS categories_insert_own ON categories;
DROP POLICY IF EXISTS categories_update_own ON categories;
DROP POLICY IF EXISTS categories_delete_own ON categories;
CREATE POLICY categories_select_visible ON categories FOR SELECT TO authenticated USING (user_id IS NULL OR auth.uid() = user_id);
CREATE POLICY categories_insert_own ON categories FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY categories_update_own ON categories FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY categories_delete_own ON categories FOR DELETE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS labels_select_visible ON labels;
DROP POLICY IF EXISTS labels_insert_own ON labels;
DROP POLICY IF EXISTS labels_update_own ON labels;
DROP POLICY IF EXISTS labels_delete_own ON labels;
CREATE POLICY labels_select_visible ON labels FOR SELECT TO authenticated USING (user_id IS NULL OR auth.uid() = user_id);
CREATE POLICY labels_insert_own ON labels FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY labels_update_own ON labels FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY labels_delete_own ON labels FOR DELETE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS transactions_select_own ON transactions;
DROP POLICY IF EXISTS transactions_insert_own ON transactions;
DROP POLICY IF EXISTS transactions_update_own ON transactions;
DROP POLICY IF EXISTS transactions_delete_own ON transactions;
CREATE POLICY transactions_select_own ON transactions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY transactions_insert_own ON transactions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY transactions_update_own ON transactions FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY transactions_delete_own ON transactions FOR DELETE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS imports_select_own ON imports;
DROP POLICY IF EXISTS imports_insert_own ON imports;
DROP POLICY IF EXISTS imports_update_own ON imports;
DROP POLICY IF EXISTS imports_delete_own ON imports;
CREATE POLICY imports_select_own ON imports FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY imports_insert_own ON imports FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY imports_update_own ON imports FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY imports_delete_own ON imports FOR DELETE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS transaction_labels_select_own ON transaction_labels;
DROP POLICY IF EXISTS transaction_labels_insert_own ON transaction_labels;
DROP POLICY IF EXISTS transaction_labels_delete_own ON transaction_labels;
CREATE POLICY transaction_labels_select_own ON transaction_labels FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM transactions
    WHERE transactions.id = transaction_labels.transaction_id
      AND transactions.user_id = auth.uid()
  )
);
CREATE POLICY transaction_labels_insert_own ON transaction_labels FOR INSERT TO authenticated WITH CHECK (
  EXISTS (
    SELECT 1 FROM transactions
    WHERE transactions.id = transaction_labels.transaction_id
      AND transactions.user_id = auth.uid()
  )
  AND EXISTS (
    SELECT 1 FROM labels
    WHERE labels.id = transaction_labels.label_id
      AND (labels.user_id IS NULL OR labels.user_id = auth.uid())
  )
);
CREATE POLICY transaction_labels_delete_own ON transaction_labels FOR DELETE TO authenticated USING (
  EXISTS (
    SELECT 1 FROM transactions
    WHERE transactions.id = transaction_labels.transaction_id
      AND transactions.user_id = auth.uid()
  )
);