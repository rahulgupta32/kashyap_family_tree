-- Staging is isolated from accepted genealogy; there is deliberately no promotion writer.
CREATE TABLE genealogy_import_batches (
 id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
 dataset_key VARCHAR(80) NOT NULL,
 branch_id UUID NOT NULL REFERENCES branches(id),
 source_hash CHAR(64) NOT NULL,
 source_description TEXT NOT NULL,
 payload JSONB,
 person_count INT NOT NULL CHECK(person_count BETWEEN 1 AND 200),
 parent_count INT NOT NULL CHECK(parent_count BETWEEN 0 AND 400),
 created_by UUID NOT NULL REFERENCES user_accounts(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(dataset_key,source_hash),
 CHECK(octet_length(payload::text)<=1048576)
);
CREATE TABLE genealogy_import_runs (
 id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
 batch_id UUID NOT NULL REFERENCES genealogy_import_batches(id),
 sequence INT NOT NULL CHECK(sequence>0),
 request_key UUID NOT NULL,
 actor_id UUID NOT NULL REFERENCES user_accounts(id),
 reason TEXT NOT NULL CHECK(char_length(reason) BETWEEN 10 AND 1000),
 report JSONB NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(batch_id,sequence),UNIQUE(batch_id,request_key)
);
CREATE FUNCTION protect_genealogy_import_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='genealogy_import_batches' AND TG_OP='UPDATE' AND NEW.payload IS NULL
 AND (to_jsonb(NEW)-'payload')=(to_jsonb(OLD)-'payload') THEN RETURN NEW; END IF;
 RAISE EXCEPTION 'Genealogy import evidence is append-only';
END $$;
CREATE TRIGGER genealogy_import_batch_immutable BEFORE UPDATE OR DELETE ON genealogy_import_batches FOR EACH ROW EXECUTE FUNCTION protect_genealogy_import_evidence();
CREATE TRIGGER genealogy_import_run_immutable BEFORE UPDATE OR DELETE ON genealogy_import_runs FOR EACH ROW EXECUTE FUNCTION protect_genealogy_import_evidence();
