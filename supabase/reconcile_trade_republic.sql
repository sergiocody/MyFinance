-- ============================================================
-- RECONCILIATION: Trade Republic account
-- Account ID: c4ae1d34-5117-4f1b-aa0a-ec7fd51800a3
-- User ID: fe186538-8830-46c3-ae06-866517a37158
-- Generated: 2026-06-30
-- ============================================================

-- ============================================================
-- PART 1: UPDATEs - Fix date/amount mismatches
-- ============================================================

-- Hotel Londres: 555.21 -> 555.25, date 2026-06-10 -> 2026-06-09
UPDATE transactions
SET amount = 555.25, date = '2026-06-09',
    transaction_hash = '2026-06-09|expense|555.25|hotel londres'
WHERE id = 'bd3104ae-5f3a-477f-81d3-74da019e0546';

-- Tren Glasgow: date 2026-06-30 -> 2026-06-19
UPDATE transactions
SET date = '2026-06-19',
    transaction_hash = '2026-06-19|expense|338.17|'
WHERE id = 'e5eb92ab-fb1f-4744-ba2f-58a4b8f1fddd';

-- Cafes Nespreso: date 2026-01-26 -> 2026-01-22
UPDATE transactions
SET date = '2026-01-22',
    transaction_hash = '2026-01-22|expense|3.40|cafes nespreso'
WHERE id = 'd3f98fed-6afb-4213-8c0b-337ad2551776';

-- Curso voley: date 2025-12-25 -> 2025-12-21
UPDATE transactions
SET date = '2025-12-21',
    transaction_hash = '2025-12-21|expense|85.00|curso voley'
WHERE id = 'f2de076e-5189-44a6-8b05-a641cf9e167c';

-- ============================================================
-- PART 2: INSERTs - Missing Helios parking entries (28)
-- ============================================================

INSERT INTO transactions (account_id, type, amount, description, date, user_id, source)
VALUES
  ('c4ae1d34-5117-4f1b-aa0a-ec7fd51800a3', 'expense', 1.00, 'Helios parking', '2025-10-18', 'fe186538-8830-46c3-ae06-866517a37158', 'manual'),
  ('c4ae1d34-5117-4f1b-aa0a-ec7fd51800a3', 'expense', 1.00, 'Helios parking', '2025-10-21', 'fe186538-8830-46c3-ae06-866517a37158', 'manual'),
  ('c4ae1d34-5117-4f1b-aa0a-ec7fd51800a3', 'expense', 1.00, 'Helios parking', '2025-10-25', 'fe186538-8830-46c3-ae06-866517a37158', 'manual'),
  ('c4ae1d34-5117-4f1b-aa0a-ec7fd51800a3', 'expense', 1.00, 'Helios parking', '2025-11-09', 'fe186538-8830-46c3-ae06-866517a37158', 'manual'),
  ('c4ae1d34-5117-4f1b-aa0a-ec7fd51800a3', 'expense', 1.00, 'Helios parking', '2025-12-22', 'fe186538-8830-46c3-ae06-866517a37158', 'manual'),
  ('c4ae1d34-5117-4f1b-aa0a-ec7fd51800a3', 'expense', 1.00, 'Helios parking', '2025-12-23', 'fe186538-8830-46c3-ae06-866517a37158', 'manual'),
  ('c4ae1d34-5117-4f1b-aa0a-ec7fd51800a3', 'expense', 1.00, 'Helios parking', '2025-12-27', 'fe186538-8830-46c3-ae06-866517a37158', 'manual'),
  ('c4ae1d34-5117-4f1b-aa0a-ec7fd51800a3', 'expense', 1.00, 'Helios parking', '2026-02-17', 'fe186538-8830-46c3-ae06-866517a37158', 'manual'),
  ('c4ae1d34-5117-4f1b-aa0a-ec7fd51800a3', 'expense', 1.50, 'Helios parking', '2026-02-23', 'fe186538-8830-46c3-ae06-866517a37158', 'manual'),
  ('c4ae1d34-5117-4f1b-aa0a-ec7fd51800a3', 'expense', 1.00, 'Helios parking', '2026-03-01', 'fe186538-8830-46c3-ae06-866517a37158', 'manual'),
  ('c4ae1d34-5117-4f1b-aa0a-ec7fd51800a3', 'expense', 1.00, 'Helios parking', '2026-03-04', 'fe186538-8830-46c3-ae06-866517a37158', 'manual'),
  ('c4ae1d34-5117-4f1b-aa0a-ec7fd51800a3', 'expense', 4.00, 'Helios parking', '2026-03-08', 'fe186538-8830-46c3-ae06-866517a37158', 'manual'),
  ('c4ae1d34-5117-4f1b-aa0a-ec7fd51800a3', 'expense', 1.00, 'Helios parking', '2026-03-14', 'fe186538-8830-46c3-ae06-866517a37158', 'manual'),
  ('c4ae1d34-5117-4f1b-aa0a-ec7fd51800a3', 'expense', 1.00, 'Helios parking', '2026-03-22', 'fe186538-8830-46c3-ae06-866517a37158', 'manual'),
  ('c4ae1d34-5117-4f1b-aa0a-ec7fd51800a3', 'expense', 1.00, 'Helios parking', '2026-04-11', 'fe186538-8830-46c3-ae06-866517a37158', 'manual'),
  ('c4ae1d34-5117-4f1b-aa0a-ec7fd51800a3', 'expense', 1.00, 'Helios parking', '2026-04-14', 'fe186538-8830-46c3-ae06-866517a37158', 'manual'),
  ('c4ae1d34-5117-4f1b-aa0a-ec7fd51800a3', 'expense', 0.50, 'Helios parking', '2026-04-18', 'fe186538-8830-46c3-ae06-866517a37158', 'manual'),
  ('c4ae1d34-5117-4f1b-aa0a-ec7fd51800a3', 'expense', 1.00, 'Helios parking', '2026-04-21', 'fe186538-8830-46c3-ae06-866517a37158', 'manual'),
  ('c4ae1d34-5117-4f1b-aa0a-ec7fd51800a3', 'expense', 0.50, 'Helios parking', '2026-04-28', 'fe186538-8830-46c3-ae06-866517a37158', 'manual'),
  ('c4ae1d34-5117-4f1b-aa0a-ec7fd51800a3', 'expense', 2.50, 'Helios parking', '2026-05-02', 'fe186538-8830-46c3-ae06-866517a37158', 'manual'),
  ('c4ae1d34-5117-4f1b-aa0a-ec7fd51800a3', 'expense', 1.00, 'Helios parking', '2026-05-02', 'fe186538-8830-46c3-ae06-866517a37158', 'manual'),
  ('c4ae1d34-5117-4f1b-aa0a-ec7fd51800a3', 'expense', 1.00, 'Helios parking', '2026-05-04', 'fe186538-8830-46c3-ae06-866517a37158', 'manual'),
  ('c4ae1d34-5117-4f1b-aa0a-ec7fd51800a3', 'expense', 1.00, 'Helios parking', '2026-05-24', 'fe186538-8830-46c3-ae06-866517a37158', 'manual'),
  ('c4ae1d34-5117-4f1b-aa0a-ec7fd51800a3', 'expense', 0.50, 'Helios parking', '2026-05-27', 'fe186538-8830-46c3-ae06-866517a37158', 'manual'),
  ('c4ae1d34-5117-4f1b-aa0a-ec7fd51800a3', 'expense', 1.50, 'Helios parking', '2026-05-31', 'fe186538-8830-46c3-ae06-866517a37158', 'manual'),
  ('c4ae1d34-5117-4f1b-aa0a-ec7fd51800a3', 'expense', 0.50, 'Helios parking', '2026-06-02', 'fe186538-8830-46c3-ae06-866517a37158', 'manual'),
  ('c4ae1d34-5117-4f1b-aa0a-ec7fd51800a3', 'expense', 1.00, 'Helios parking', '2026-06-15', 'fe186538-8830-46c3-ae06-866517a37158', 'manual'),
  ('c4ae1d34-5117-4f1b-aa0a-ec7fd51800a3', 'expense', 0.50, 'Helios parking', '2026-06-27', 'fe186538-8830-46c3-ae06-866517a37158', 'manual');

-- ============================================================
-- PART 3: INSERTs - Missing card expenses & income (16)
-- ============================================================

INSERT INTO transactions (account_id, type, amount, description, date, user_id, source, transfer_to_account_id)
VALUES
  -- ATM withdrawal Dec 1 (to cash account)
  ('c4ae1d34-5117-4f1b-aa0a-ec7fd51800a3', 'transfer', 160.00, 'Retirada cajero IBERCAJA', '2025-12-01', 'fe186538-8830-46c3-ae06-866517a37158', 'manual', 'd17c004c-db78-4299-9dc9-d621184fcf64'),
  -- Expenses
  ('c4ae1d34-5117-4f1b-aa0a-ec7fd51800a3', 'expense', 50.00, 'Federacion Aragonesa Voley', '2026-02-27', 'fe186538-8830-46c3-ae06-866517a37158', 'manual', NULL),
  ('c4ae1d34-5117-4f1b-aa0a-ec7fd51800a3', 'expense', 6.70, 'Bar El Badulake', '2026-02-28', 'fe186538-8830-46c3-ae06-866517a37158', 'manual', NULL),
  ('c4ae1d34-5117-4f1b-aa0a-ec7fd51800a3', 'expense', 73.80, 'La Tagliatella', '2026-03-01', 'fe186538-8830-46c3-ae06-866517a37158', 'manual', NULL),
  ('c4ae1d34-5117-4f1b-aa0a-ec7fd51800a3', 'expense', 223.00, 'Virginia Lyons English', '2026-03-09', 'fe186538-8830-46c3-ae06-866517a37158', 'manual', NULL),
  ('c4ae1d34-5117-4f1b-aa0a-ec7fd51800a3', 'expense', 47.00, 'Federacion Aragonesa Voley', '2026-03-09', 'fe186538-8830-46c3-ae06-866517a37158', 'manual', NULL),
  ('c4ae1d34-5117-4f1b-aa0a-ec7fd51800a3', 'expense', 346.57, 'Adidas', '2026-03-16', 'fe186538-8830-46c3-ae06-866517a37158', 'manual', NULL),
  ('c4ae1d34-5117-4f1b-aa0a-ec7fd51800a3', 'expense', 90.00, 'Stop Spine Pain', '2026-03-25', 'fe186538-8830-46c3-ae06-866517a37158', 'manual', NULL),
  ('c4ae1d34-5117-4f1b-aa0a-ec7fd51800a3', 'expense', 97.50, 'Pizzeria Sapri Salou', '2026-04-04', 'fe186538-8830-46c3-ae06-866517a37158', 'manual', NULL),
  -- Refund (income)
  ('c4ae1d34-5117-4f1b-aa0a-ec7fd51800a3', 'income', 268.80, 'Devolucion Adidas', '2026-04-14', 'fe186538-8830-46c3-ae06-866517a37158', 'manual', NULL),
  -- More expenses
  ('c4ae1d34-5117-4f1b-aa0a-ec7fd51800a3', 'expense', 26.46, 'Amazon', '2026-04-21', 'fe186538-8830-46c3-ae06-866517a37158', 'manual', NULL),
  ('c4ae1d34-5117-4f1b-aa0a-ec7fd51800a3', 'expense', 799.00, 'Amazon', '2026-04-28', 'fe186538-8830-46c3-ae06-866517a37158', 'manual', NULL),
  ('c4ae1d34-5117-4f1b-aa0a-ec7fd51800a3', 'expense', 1.40, 'Fundacion Educacion Sa', '2026-05-10', 'fe186538-8830-46c3-ae06-866517a37158', 'manual', NULL),
  ('c4ae1d34-5117-4f1b-aa0a-ec7fd51800a3', 'expense', 49.98, 'Fleurop Interflora', '2026-05-20', 'fe186538-8830-46c3-ae06-866517a37158', 'manual', NULL),
  ('c4ae1d34-5117-4f1b-aa0a-ec7fd51800a3', 'expense', 0.50, 'Adidas app', '2026-05-21', 'fe186538-8830-46c3-ae06-866517a37158', 'manual', NULL),
  ('c4ae1d34-5117-4f1b-aa0a-ec7fd51800a3', 'expense', 412.75, 'The Royal Edinburgh Military Tattoo', '2026-05-24', 'fe186538-8830-46c3-ae06-866517a37158', 'manual', NULL);

-- ============================================================
-- PART 4: INSERTs - Missing inbound transfers (from Ibercaja)
-- These are transfers FROM Ibercaja TO Trade Republic
-- ============================================================

INSERT INTO transactions (account_id, type, amount, description, date, user_id, source, transfer_to_account_id)
VALUES
  ('bd5a8735-ab51-4b08-9e31-1d495b27a2ec', 'transfer', 1000.00, 'Transferencia emitida a SERGIO CODONAL VAZQUEZ Traspaso a Trade Republic', '2025-12-01', 'fe186538-8830-46c3-ae06-866517a37158', 'manual', 'c4ae1d34-5117-4f1b-aa0a-ec7fd51800a3'),
  ('bd5a8735-ab51-4b08-9e31-1d495b27a2ec', 'transfer', 1000.00, 'Transferencia emitida a SERGIO CODONAL VAZQUEZ Traspaso a Trade Republic', '2025-12-12', 'fe186538-8830-46c3-ae06-866517a37158', 'manual', 'c4ae1d34-5117-4f1b-aa0a-ec7fd51800a3'),
  ('bd5a8735-ab51-4b08-9e31-1d495b27a2ec', 'transfer', 2800.00, 'Transferencia emitida a SERGIO CODONAL VAZQUEZ Traspaso a Trade Republic', '2025-12-24', 'fe186538-8830-46c3-ae06-866517a37158', 'manual', 'c4ae1d34-5117-4f1b-aa0a-ec7fd51800a3'),
  ('bd5a8735-ab51-4b08-9e31-1d495b27a2ec', 'transfer', 300.00, 'Transferencia emitida a SERGIO CODONAL VAZQUEZ Traspaso a Trade Republic', '2026-01-01', 'fe186538-8830-46c3-ae06-866517a37158', 'manual', 'c4ae1d34-5117-4f1b-aa0a-ec7fd51800a3'),
  ('bd5a8735-ab51-4b08-9e31-1d495b27a2ec', 'transfer', 2400.00, 'Transferencia emitida a SERGIO CODONAL VAZQUEZ Traspaso a Trade Republic', '2026-01-29', 'fe186538-8830-46c3-ae06-866517a37158', 'manual', 'c4ae1d34-5117-4f1b-aa0a-ec7fd51800a3'),
  ('bd5a8735-ab51-4b08-9e31-1d495b27a2ec', 'transfer', 2500.00, 'Transferencia emitida a SERGIO CODONAL VAZQUEZ Traspaso a Trade Republic', '2026-02-27', 'fe186538-8830-46c3-ae06-866517a37158', 'manual', 'c4ae1d34-5117-4f1b-aa0a-ec7fd51800a3');

-- ============================================================
-- PART 5: INSERTs - Missing outbound transfers
-- ============================================================

INSERT INTO transactions (account_id, category_id, type, amount, description, date, user_id, source, transfer_to_account_id)
VALUES
  ('c4ae1d34-5117-4f1b-aa0a-ec7fd51800a3', '1902877c-944c-4ae9-91cc-29089663586a', 'transfer', 2100.00, 'Traspaso a Bankinter', '2026-02-19', 'fe186538-8830-46c3-ae06-866517a37158', 'manual', '3fb38131-1457-411a-85cb-17007f9909bb'),
  ('c4ae1d34-5117-4f1b-aa0a-ec7fd51800a3', '1902877c-944c-4ae9-91cc-29089663586a', 'transfer', 1000.00, 'Traspaso a Bankinter', '2026-03-10', 'fe186538-8830-46c3-ae06-866517a37158', 'manual', '3fb38131-1457-411a-85cb-17007f9909bb'),
  ('c4ae1d34-5117-4f1b-aa0a-ec7fd51800a3', '1902877c-944c-4ae9-91cc-29089663586a', 'transfer', 500.00, 'Traspaso a Santander', '2026-03-31', 'fe186538-8830-46c3-ae06-866517a37158', 'manual', NULL),
  ('c4ae1d34-5117-4f1b-aa0a-ec7fd51800a3', '1902877c-944c-4ae9-91cc-29089663586a', 'transfer', 1000.00, 'Traspaso a Bankinter', '2026-04-16', 'fe186538-8830-46c3-ae06-866517a37158', 'manual', '3fb38131-1457-411a-85cb-17007f9909bb'),
  ('c4ae1d34-5117-4f1b-aa0a-ec7fd51800a3', '1902877c-944c-4ae9-91cc-29089663586a', 'transfer', 1000.00, 'Traspaso a Bankinter', '2026-04-30', 'fe186538-8830-46c3-ae06-866517a37158', 'manual', '3fb38131-1457-411a-85cb-17007f9909bb'),
  ('c4ae1d34-5117-4f1b-aa0a-ec7fd51800a3', '1902877c-944c-4ae9-91cc-29089663586a', 'transfer', 1000.00, 'Traspaso a Santander', '2026-04-30', 'fe186538-8830-46c3-ae06-866517a37158', 'manual', NULL);

-- ============================================================
-- PART 6: Suspicious entries to review (not auto-fixed)
-- ============================================================

-- [REVIEW] 2025-10-01 expense 10.18 "Intereses" (id: 8f9eac9d-5b56-4b22-b398-cf5ebd8b9ede)
-- Appears to be a DUPLICATE of income entry ba0f69ea (same date, same amount, "Intereses TR")
-- Uncomment the line below to delete it:
-- DELETE FROM transactions WHERE id = '8f9eac9d-5b56-4b22-b398-cf5ebd8b9ede';

-- [REVIEW] 2026-02-06 transfer 3200 "Traspaso a myInvestor" (id: 93f897e7-f15c-4f31-8f5a-7fa8b7f0c11e)
-- No corresponding bank outbound on that date. Bank shows 1000 on Feb 5 and 2100 on Feb 19.
-- The Feb 5 bank entry (-1000 to ES8001/Bankinter) is already covered by existing entry 459b8caf.
-- This 3200 entry may be incorrect. Uncomment to delete:
-- DELETE FROM transactions WHERE id = '93f897e7-f15c-4f31-8f5a-7fa8b7f0c11e';
