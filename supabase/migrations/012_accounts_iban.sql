-- Store account IBAN/account number for matching imports and transfers
ALTER TABLE accounts ADD COLUMN iban TEXT;

CREATE UNIQUE INDEX accounts_user_iban_unique
  ON accounts (user_id, upper(regexp_replace(iban, '[^[:alnum:]]', '', 'g')))
  WHERE iban IS NOT NULL AND btrim(iban) <> '';