-- Rollback Migration 005
DROP INDEX IF EXISTS idx_person_names_aliases;
DROP INDEX IF EXISTS idx_person_names_unique_primary;
ALTER TABLE person_names ADD CONSTRAINT person_names_person_id_language_is_primary_key UNIQUE (person_id, language, is_primary);
