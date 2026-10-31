-- Member-selected follow targets. Type-specific shape checks make it impossible
-- to smuggle a different person's family group or a cross-branch generation.
CREATE TABLE notification_follows (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE,
  target_type VARCHAR(24) NOT NULL CHECK (target_type IN
    ('PERSON','IMMEDIATE_FAMILY','BRANCH','GENERATION','RELATIONSHIP_GROUP')),
  target_key VARCHAR(160) NOT NULL,
  person_id UUID REFERENCES persons(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
  generation INT CHECK (generation BETWEEN 1 AND 100),
  relationship_group VARCHAR(20) CHECK (relationship_group IN ('PARENTS','CHILDREN','SPOUSES','SIBLINGS')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_notification_follow_user_target UNIQUE(user_id,target_type,target_key),
  CONSTRAINT chk_notification_follow_shape CHECK (
    (target_type='PERSON' AND person_id IS NOT NULL AND branch_id IS NULL AND generation IS NULL AND relationship_group IS NULL)
    OR (target_type='IMMEDIATE_FAMILY' AND person_id IS NOT NULL AND branch_id IS NULL AND generation IS NULL AND relationship_group IS NULL)
    OR (target_type='BRANCH' AND person_id IS NULL AND branch_id IS NOT NULL AND generation IS NULL AND relationship_group IS NULL)
    OR (target_type='GENERATION' AND person_id IS NULL AND branch_id IS NOT NULL AND generation IS NOT NULL AND relationship_group IS NULL)
    OR (target_type='RELATIONSHIP_GROUP' AND person_id IS NOT NULL AND branch_id IS NULL AND generation IS NULL AND relationship_group IS NOT NULL)
  )
);
CREATE INDEX idx_notification_follow_person ON notification_follows(person_id,target_type);
CREATE INDEX idx_notification_follow_branch ON notification_follows(branch_id,generation,target_type);
