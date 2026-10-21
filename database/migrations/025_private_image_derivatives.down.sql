DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM media_derivatives) OR EXISTS(SELECT 1 FROM media_image_jobs) THEN
  RAISE EXCEPTION 'Export/reconcile private image jobs and derivative provenance before rollback';
 END IF;
END $$;
DROP TRIGGER media_derivative_retention ON media_assets;
DROP FUNCTION propagate_media_derivative_retention();
DROP TABLE media_derivatives;
DROP TABLE media_image_jobs;
