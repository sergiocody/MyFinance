-- Allow bank callbacks to store the IBAN for an already-linked account without a user JWT
CREATE OR REPLACE FUNCTION update_connected_account_iban(
  p_connection_id UUID,
  p_iban TEXT
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE accounts AS a
  SET iban = NULLIF(btrim(p_iban), ''),
      updated_at = now()
  FROM bank_connections AS bc
  WHERE bc.id = p_connection_id
    AND bc.account_id = a.id
    AND p_iban IS NOT NULL
    AND btrim(p_iban) <> '';
$$;