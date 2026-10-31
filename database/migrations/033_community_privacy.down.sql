DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM community_posts WHERE locality IS NOT NULL OR contact_consent)
 OR EXISTS(SELECT 1 FROM community_post_revisions WHERE locality IS NOT NULL OR contact_consent) THEN
  RAISE EXCEPTION 'Export and reconcile retained community privacy evidence before rollback';
 END IF;
END $$;
ALTER TABLE community_post_revisions DROP COLUMN locality,DROP COLUMN locality_visibility,DROP COLUMN contact_visibility,DROP COLUMN contact_consent;
ALTER TABLE community_posts DROP CONSTRAINT community_contact_consent,DROP COLUMN locality,DROP COLUMN locality_visibility,DROP COLUMN contact_visibility,DROP COLUMN contact_consent;
