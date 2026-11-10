-- Proposal only. Audit existing duplicate approvals before applying; never remove evidence.
BEGIN;
CREATE UNIQUE INDEX IF NOT EXISTS expenses_one_approved_receipt_source
  ON cockpit.expenses (organization_id, receipt_storage_path)
  WHERE status = '승인 완료' AND receipt_storage_path IS NOT NULL AND hipass_tx_key IS NULL;

CREATE OR REPLACE FUNCTION cockpit.expense_approval_integrity()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, cockpit AS $$
BEGIN
  IF NEW.status = '승인 완료' THEN
    IF NEW.amount <= 0 OR btrim(COALESCE(NEW.merchant,'')) = ''
       OR COALESCE(NEW.category,'') NOT IN ('fuel','meal','parking','toll','stay','wash','transit','other')
       OR COALESCE(NEW.payment_method,'') NOT IN ('company_card','driver_personal','client_card','cash','other')
       OR NOT (NULLIF(btrim(NEW.receipt_storage_path),'') IS NOT NULL
               OR (NEW.category = 'toll' AND NULLIF(btrim(NEW.hipass_tx_key),'') IS NOT NULL)) THEN
      RAISE EXCEPTION 'Approval requires reviewed amount, category, merchant, payment and evidence' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION cockpit.expense_approval_integrity() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS expense_approval_integrity ON cockpit.expenses;
CREATE TRIGGER expense_approval_integrity BEFORE INSERT OR UPDATE ON cockpit.expenses
  FOR EACH ROW EXECUTE FUNCTION cockpit.expense_approval_integrity();
COMMIT;
