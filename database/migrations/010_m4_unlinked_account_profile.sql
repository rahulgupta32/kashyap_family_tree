-- Migration 010: Unlinked Account Profile Metadata Persistence (M4 Requirement 2)
ALTER TABLE user_accounts
  ADD COLUMN IF NOT EXISTS unlinked_profile JSONB DEFAULT '{}'::jsonb;
