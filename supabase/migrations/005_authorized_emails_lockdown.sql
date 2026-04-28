-- Migration 005: lock application access to an explicit email allowlist.
--
-- Why:
--   Existing RLS policies isolate each authenticated user to their own rows.
--   For a single-user deployment that is not enough, because any extra user
--   who manages to sign up could still create and read their own dataset.
--
-- This migration adds a hard gate: only authenticated users whose email is in
--   public.authorized_emails can use the finance tables.

CREATE TABLE IF NOT EXISTS public.authorized_emails (
  email TEXT PRIMARY KEY,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT authorized_emails_lowercase CHECK (email = lower(email))
);

ALTER TABLE public.authorized_emails ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.authorized_emails FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.is_allowed_email()
RETURNS BOOLEAN
STABLE
SECURITY DEFINER
SET search_path = public
LANGUAGE sql AS $func$
  SELECT EXISTS (
    SELECT 1
    FROM public.authorized_emails
    WHERE email = lower(coalesce(auth.jwt() ->> 'email', ''))
      AND is_active = true
  );
$func$;

DROP POLICY IF EXISTS accounts_select_own ON accounts;
DROP POLICY IF EXISTS accounts_insert_own ON accounts;
DROP POLICY IF EXISTS accounts_update_own ON accounts;
DROP POLICY IF EXISTS accounts_delete_own ON accounts;
CREATE POLICY accounts_select_own ON accounts FOR SELECT TO authenticated USING (public.is_allowed_email() AND auth.uid() = user_id);
CREATE POLICY accounts_insert_own ON accounts FOR INSERT TO authenticated WITH CHECK (public.is_allowed_email() AND auth.uid() = user_id);
CREATE POLICY accounts_update_own ON accounts FOR UPDATE TO authenticated USING (public.is_allowed_email() AND auth.uid() = user_id) WITH CHECK (public.is_allowed_email() AND auth.uid() = user_id);
CREATE POLICY accounts_delete_own ON accounts FOR DELETE TO authenticated USING (public.is_allowed_email() AND auth.uid() = user_id);

DROP POLICY IF EXISTS categories_select_visible ON categories;
DROP POLICY IF EXISTS categories_insert_own ON categories;
DROP POLICY IF EXISTS categories_update_own ON categories;
DROP POLICY IF EXISTS categories_delete_own ON categories;
CREATE POLICY categories_select_visible ON categories FOR SELECT TO authenticated USING (public.is_allowed_email() AND (user_id IS NULL OR auth.uid() = user_id));
CREATE POLICY categories_insert_own ON categories FOR INSERT TO authenticated WITH CHECK (public.is_allowed_email() AND auth.uid() = user_id);
CREATE POLICY categories_update_own ON categories FOR UPDATE TO authenticated USING (public.is_allowed_email() AND auth.uid() = user_id) WITH CHECK (public.is_allowed_email() AND auth.uid() = user_id);
CREATE POLICY categories_delete_own ON categories FOR DELETE TO authenticated USING (public.is_allowed_email() AND auth.uid() = user_id);

DROP POLICY IF EXISTS labels_select_visible ON labels;
DROP POLICY IF EXISTS labels_insert_own ON labels;
DROP POLICY IF EXISTS labels_update_own ON labels;
DROP POLICY IF EXISTS labels_delete_own ON labels;
CREATE POLICY labels_select_visible ON labels FOR SELECT TO authenticated USING (public.is_allowed_email() AND (user_id IS NULL OR auth.uid() = user_id));
CREATE POLICY labels_insert_own ON labels FOR INSERT TO authenticated WITH CHECK (public.is_allowed_email() AND auth.uid() = user_id);
CREATE POLICY labels_update_own ON labels FOR UPDATE TO authenticated USING (public.is_allowed_email() AND auth.uid() = user_id) WITH CHECK (public.is_allowed_email() AND auth.uid() = user_id);
CREATE POLICY labels_delete_own ON labels FOR DELETE TO authenticated USING (public.is_allowed_email() AND auth.uid() = user_id);

DROP POLICY IF EXISTS transactions_select_own ON transactions;
DROP POLICY IF EXISTS transactions_insert_own ON transactions;
DROP POLICY IF EXISTS transactions_update_own ON transactions;
DROP POLICY IF EXISTS transactions_delete_own ON transactions;
CREATE POLICY transactions_select_own ON transactions FOR SELECT TO authenticated USING (public.is_allowed_email() AND auth.uid() = user_id);
CREATE POLICY transactions_insert_own ON transactions FOR INSERT TO authenticated WITH CHECK (public.is_allowed_email() AND auth.uid() = user_id);
CREATE POLICY transactions_update_own ON transactions FOR UPDATE TO authenticated USING (public.is_allowed_email() AND auth.uid() = user_id) WITH CHECK (public.is_allowed_email() AND auth.uid() = user_id);
CREATE POLICY transactions_delete_own ON transactions FOR DELETE TO authenticated USING (public.is_allowed_email() AND auth.uid() = user_id);

DROP POLICY IF EXISTS imports_select_own ON imports;
DROP POLICY IF EXISTS imports_insert_own ON imports;
DROP POLICY IF EXISTS imports_update_own ON imports;
DROP POLICY IF EXISTS imports_delete_own ON imports;
CREATE POLICY imports_select_own ON imports FOR SELECT TO authenticated USING (public.is_allowed_email() AND auth.uid() = user_id);
CREATE POLICY imports_insert_own ON imports FOR INSERT TO authenticated WITH CHECK (public.is_allowed_email() AND auth.uid() = user_id);
CREATE POLICY imports_update_own ON imports FOR UPDATE TO authenticated USING (public.is_allowed_email() AND auth.uid() = user_id) WITH CHECK (public.is_allowed_email() AND auth.uid() = user_id);
CREATE POLICY imports_delete_own ON imports FOR DELETE TO authenticated USING (public.is_allowed_email() AND auth.uid() = user_id);

DROP POLICY IF EXISTS transaction_labels_select_own ON transaction_labels;
DROP POLICY IF EXISTS transaction_labels_insert_own ON transaction_labels;
DROP POLICY IF EXISTS transaction_labels_delete_own ON transaction_labels;
CREATE POLICY transaction_labels_select_own ON transaction_labels FOR SELECT TO authenticated USING (
  public.is_allowed_email()
  AND EXISTS (
    SELECT 1 FROM transactions
    WHERE transactions.id = transaction_labels.transaction_id
      AND transactions.user_id = auth.uid()
  )
);
CREATE POLICY transaction_labels_insert_own ON transaction_labels FOR INSERT TO authenticated WITH CHECK (
  public.is_allowed_email()
  AND EXISTS (
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
  public.is_allowed_email()
  AND EXISTS (
    SELECT 1 FROM transactions
    WHERE transactions.id = transaction_labels.transaction_id
      AND transactions.user_id = auth.uid()
  )
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.authorized_emails WHERE is_active = true) THEN
    RAISE WARNING 'authorized_emails is empty. Add your owner email before using the app.';
  END IF;
END;
$$;