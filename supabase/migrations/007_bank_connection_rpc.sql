-- Migration: Add RPC functions for bank connection management (bypass RLS for server callbacks)

-- Function to get a bank connection by account_id (used in callback route)
CREATE OR REPLACE FUNCTION get_bank_connection_by_account(p_account_id UUID)
RETURNS SETOF bank_connections
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM bank_connections WHERE account_id = p_account_id LIMIT 1;
$$;

-- Function to update bank connection after successful authorization
CREATE OR REPLACE FUNCTION update_bank_connection_session(
  p_connection_id UUID,
  p_external_account_uid TEXT,
  p_session_id TEXT,
  p_session_expires_at TIMESTAMPTZ,
  p_status TEXT,
  p_error_message TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE bank_connections
  SET external_account_uid = p_external_account_uid,
      session_id = p_session_id,
      session_expires_at = p_session_expires_at,
      status = p_status,
      error_message = p_error_message,
      updated_at = now()
  WHERE id = p_connection_id;
$$;

-- Function to mark bank connection as error
CREATE OR REPLACE FUNCTION set_bank_connection_error(
  p_connection_id UUID,
  p_error_message TEXT
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE bank_connections
  SET status = 'error',
      error_message = p_error_message,
      updated_at = now()
  WHERE id = p_connection_id;
$$;
