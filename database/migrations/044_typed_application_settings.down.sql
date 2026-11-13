DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM application_settings WHERE version>1) THEN
  RAISE EXCEPTION 'Export and reconcile setting changes before rollback';
 END IF;
END $$;
DROP TABLE application_setting_revisions;
DROP TABLE application_settings;
DROP FUNCTION protect_application_setting_history();
DROP FUNCTION record_application_setting_revision();
DROP FUNCTION protect_application_setting_update();
