-- ============================================================================
-- Kashyap Adhikari Family Tree — Migration 005: Person Names Alias Constraint
-- Allows multiple non-primary aliases per person and language
-- ============================================================================

-- Drop the old multi-column unique constraint that prevented multiple non-primary aliases
ALTER TABLE person_names DROP CONSTRAINT IF EXISTS person_names_person_id_language_is_primary_key;

-- Enforce exactly one primary name per language per person using a partial unique index
CREATE UNIQUE INDEX IF NOT EXISTS idx_person_names_unique_primary 
ON person_names (person_id, language) 
WHERE is_primary = TRUE;

-- Covering index on non-primary aliases for fast lookup
CREATE INDEX IF NOT EXISTS idx_person_names_aliases 
ON person_names (person_id, language) 
WHERE is_primary = FALSE;
