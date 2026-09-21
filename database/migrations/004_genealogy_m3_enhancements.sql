-- ============================================================================
-- Migration: 004_genealogy_m3_enhancements.sql
-- Description: Indexes, Optimistic Locking, and Graph Constraints for Milestone 3
-- Author: Jyphra Technology Pvt. Ltd.
-- ============================================================================

-- 1. Optimistic Locking on Persons
ALTER TABLE persons ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1;

-- 2. Indexes for Directed Genealogy Graph Traversal
CREATE INDEX IF NOT EXISTS idx_parent_links_child_id ON parent_links(child_id);
CREATE INDEX IF NOT EXISTS idx_spouse_links_spouse_id ON spouse_links(spouse_id);

-- 3. Indexes for Duplicate Management and Resolution
CREATE INDEX IF NOT EXISTS idx_duplicate_candidates_status ON duplicate_candidates(status);
CREATE INDEX IF NOT EXISTS idx_duplicate_merges_surviving ON duplicate_merges(surviving_person_id);
CREATE INDEX IF NOT EXISTS idx_duplicate_merges_merged ON duplicate_merges(merged_person_id);

-- 4. Indexes for Person Filtering and Search
CREATE INDEX IF NOT EXISTS idx_persons_archived_status ON persons(is_archived, living_status);
CREATE INDEX IF NOT EXISTS idx_persons_generation ON persons(generation);
CREATE INDEX IF NOT EXISTS idx_persons_branch_id ON persons(branch_id);
