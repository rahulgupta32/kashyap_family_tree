-- Migration 008: M4 Privacy, Governance, Authentication Challenges & Post-Commit Media Deletion Hardening

-- 1. Persons: profile_visibility column for independent profile visibility enforcement
ALTER TABLE persons
  ADD COLUMN IF NOT EXISTS profile_visibility VARCHAR(30) DEFAULT 'VERIFIED_COMMUNITY' NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_persons_profile_visibility'
  ) THEN
    ALTER TABLE persons
      ADD CONSTRAINT chk_persons_profile_visibility
      CHECK (profile_visibility IN ('PUBLIC', 'VERIFIED_COMMUNITY', 'IMMEDIATE_FAMILY', 'PRIVATE'));
  END IF;
END $$;

-- 2. Auth Challenges: Durable, cryptographically secured, single-use reauthentication challenges
CREATE TABLE IF NOT EXISTS auth_challenges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE,
    action VARCHAR(50) NOT NULL,
    challenge_id VARCHAR(100) NOT NULL UNIQUE,
    code_hash VARCHAR(128) NOT NULL,
    salt VARCHAR(64) NOT NULL,
    phone_number VARCHAR(30) NOT NULL,
    attempts INT DEFAULT 0 NOT NULL,
    max_attempts INT DEFAULT 5 NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_auth_challenges_user_action ON auth_challenges(user_id, action, expires_at);
CREATE INDEX IF NOT EXISTS idx_auth_challenges_lookup ON auth_challenges(challenge_id);

-- 3. Media Assets: Real scan evidence tracking
ALTER TABLE media_assets
  ADD COLUMN IF NOT EXISTS scan_evidence JSONB;

-- 4. Media Deletion Queue: Durable post-commit physical file deletion queue
CREATE TABLE IF NOT EXISTS media_deletion_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    asset_id UUID NOT NULL,
    storage_path VARCHAR(500) NOT NULL,
    status VARCHAR(30) DEFAULT 'PENDING' NOT NULL,
    attempts INT DEFAULT 0 NOT NULL,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_media_deletion_queue_status ON media_deletion_queue(status, created_at);

-- 5. Data Retention Records: Hold review and release handling
ALTER TABLE data_retention_records ADD COLUMN IF NOT EXISTS released_at TIMESTAMPTZ;
ALTER TABLE data_retention_records ADD COLUMN IF NOT EXISTS released_by UUID REFERENCES user_accounts(id);
ALTER TABLE data_retention_records ADD COLUMN IF NOT EXISTS review_scheduled_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_data_retention_records_expires ON data_retention_records(expires_at, released_at);
