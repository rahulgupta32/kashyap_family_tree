-- Owned-history keyset reads must not scan/sort every claimant's records.
-- Migration rollout requires the normal reviewed maintenance/locking window.
CREATE INDEX IF NOT EXISTS idx_profile_claims_owner_history
  ON profile_claims (claimant_user_id, created_at DESC, id DESC);
