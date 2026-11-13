DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM audit_delivery_recovery_requests) OR EXISTS(SELECT 1 FROM audit_delivery_recovery_decisions) THEN
  RAISE EXCEPTION 'Audit recovery evidence exists; export and reconcile before rollback';
 END IF;
END $$;
DROP TABLE audit_delivery_recovery_decisions;
DROP TABLE audit_delivery_recovery_requests;
DROP FUNCTION protect_audit_delivery_recovery();
