-- Catalogue metadata only. Person assignments and graph links retain their review workflow.
ALTER TABLE branches ADD COLUMN metadata_version INT NOT NULL DEFAULT 1 CHECK(metadata_version>0);
CREATE TABLE branch_generation_catalogue (
 branch_id UUID NOT NULL REFERENCES branches(id),
 generation INT NOT NULL CHECK(generation BETWEEN 1 AND 100),
 name_nepali VARCHAR(100) NOT NULL CHECK(char_length(trim(name_nepali))>0),
 name_english VARCHAR(100) NOT NULL CHECK(char_length(trim(name_english))>0),
 description TEXT CHECK(description IS NULL OR char_length(description)<=3000),
 version INT NOT NULL DEFAULT 1 CHECK(version>0),
 PRIMARY KEY(branch_id,generation)
);
CREATE TABLE branch_administration_revisions (
 branch_id UUID NOT NULL REFERENCES branches(id),
 generation INT NOT NULL CHECK(generation BETWEEN 0 AND 100), -- zero denotes branch metadata
 version INT NOT NULL CHECK(version>0),
 old_value JSONB,
 new_value JSONB NOT NULL,
 actor_id UUID REFERENCES user_accounts(id),
 reason TEXT NOT NULL CHECK(char_length(reason) BETWEEN 10 AND 1000),
 changed_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(branch_id,generation,version)
);
CREATE FUNCTION protect_branch_administration_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Branch administration history is append-only'; END $$;
CREATE TRIGGER branch_administration_history_immutable BEFORE UPDATE OR DELETE ON branch_administration_revisions
 FOR EACH ROW EXECUTE FUNCTION protect_branch_administration_history();
