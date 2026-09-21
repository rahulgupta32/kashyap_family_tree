-- Migration 010 Rollback: Unlinked Account Profile Metadata Persistence
ALTER TABLE user_accounts
  DROP COLUMN IF EXISTS unlinked_profile;
