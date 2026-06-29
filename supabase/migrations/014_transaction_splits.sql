-- Migration: allow splitting a single transaction into multiple analytic children
-- Parent stays intact for bank reconciliation; children carry the per-category amounts
-- consumed by dashboards. Children never affect account balances (trigger ignores them).

ALTER TABLE transactions
  ADD COLUMN parent_transaction_id UUID REFERENCES transactions(id) ON DELETE CASCADE,
  ADD COLUMN is_split BOOLEAN NOT NULL DEFAULT FALSE;

-- A split row cannot itself have a parent (1 level of nesting only).
ALTER TABLE transactions
  ADD CONSTRAINT transactions_no_nested_splits
  CHECK (NOT (is_split AND parent_transaction_id IS NOT NULL));

CREATE INDEX idx_transactions_parent
  ON transactions(parent_transaction_id)
  WHERE parent_transaction_id IS NOT NULL;

-- Trigger must ignore child rows: balances were already moved by the parent.
CREATE OR REPLACE FUNCTION update_account_balance()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.parent_transaction_id IS NOT NULL THEN
      RETURN NULL;
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
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.parent_transaction_id IS NULL THEN
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
    IF NEW.parent_transaction_id IS NULL THEN
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
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.parent_transaction_id IS NOT NULL THEN
      RETURN NULL;
    END IF;
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

-- RPC: split a parent transaction into children. Atomically:
--  1. Validates ownership, parent not already split, parent not a transfer.
--  2. Validates SUM(children.amount) == parent.amount (1 cent tolerance).
--  3. Inserts children inheriting account_id/date/type/source-flagged-manual.
--  4. Marks parent is_split=true.
-- p_children: jsonb array of { category_id uuid?, amount numeric, description text?, notes text?, label_ids uuid[]? }
CREATE OR REPLACE FUNCTION split_transaction(
  p_parent_id UUID,
  p_children JSONB
)
RETURNS SETOF transactions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parent transactions%ROWTYPE;
  v_uid UUID := auth.uid();
  v_sum NUMERIC := 0;
  v_child JSONB;
  v_count INT;
  v_new_id UUID;
  v_label_id UUID;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_parent FROM transactions WHERE id = p_parent_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaction not found';
  END IF;
  IF v_parent.user_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF v_parent.is_split THEN
    RAISE EXCEPTION 'Transaction is already split';
  END IF;
  IF v_parent.parent_transaction_id IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot split a child transaction';
  END IF;
  IF v_parent.type = 'transfer' THEN
    RAISE EXCEPTION 'Transfers cannot be split';
  END IF;

  IF jsonb_typeof(p_children) <> 'array' THEN
    RAISE EXCEPTION 'children must be a JSON array';
  END IF;

  SELECT COUNT(*) INTO v_count FROM jsonb_array_elements(p_children);
  IF v_count < 2 THEN
    RAISE EXCEPTION 'At least two splits are required';
  END IF;

  FOR v_child IN SELECT jsonb_array_elements(p_children) LOOP
    v_sum := v_sum + COALESCE((v_child->>'amount')::numeric, 0);
  END LOOP;

  IF ABS(v_sum - v_parent.amount) > 0.01 THEN
    RAISE EXCEPTION 'Split total (%) does not match transaction amount (%)', v_sum, v_parent.amount;
  END IF;

  FOR v_child IN SELECT jsonb_array_elements(p_children) LOOP
    INSERT INTO transactions (
      user_id, account_id, category_id, type, amount, description, notes,
      date, source, parent_transaction_id
    ) VALUES (
      v_parent.user_id,
      v_parent.account_id,
      NULLIF(v_child->>'category_id', '')::uuid,
      v_parent.type,
      (v_child->>'amount')::numeric,
      NULLIF(v_child->>'description', ''),
      NULLIF(v_child->>'notes', ''),
      v_parent.date,
      'manual',
      v_parent.id
    )
    RETURNING id INTO v_new_id;

    IF v_child ? 'label_ids' AND jsonb_typeof(v_child->'label_ids') = 'array' THEN
      FOR v_label_id IN SELECT (value::text)::uuid FROM jsonb_array_elements_text(v_child->'label_ids') AS value LOOP
        INSERT INTO transaction_labels (transaction_id, label_id) VALUES (v_new_id, v_label_id);
      END LOOP;
    END IF;
  END LOOP;

  UPDATE transactions SET is_split = TRUE, updated_at = now() WHERE id = v_parent.id;

  RETURN QUERY SELECT * FROM transactions WHERE parent_transaction_id = v_parent.id ORDER BY created_at;
END;
$$;

-- RPC: undo a split. Deletes children (CASCADE handles labels) and clears the parent flag.
CREATE OR REPLACE FUNCTION unsplit_transaction(p_parent_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_owner UUID;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  SELECT user_id INTO v_owner FROM transactions WHERE id = p_parent_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaction not found';
  END IF;
  IF v_owner IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  DELETE FROM transactions WHERE parent_transaction_id = p_parent_id;
  UPDATE transactions SET is_split = FALSE, updated_at = now() WHERE id = p_parent_id;
END;
$$;
