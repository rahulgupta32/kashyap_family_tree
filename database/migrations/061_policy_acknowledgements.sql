-- Approved content must be provisioned through the owner's reviewed data process.
-- This migration publishes no legal text and backfills no historical consent.
CREATE TABLE policy_documents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 kind text NOT NULL CHECK(kind IN ('PRIVACY','TERMS')),
 version integer NOT NULL CHECK(version>0),
 title_ne text NOT NULL CHECK(length(btrim(title_ne)) BETWEEN 1 AND 255),
 title_en text NOT NULL CHECK(length(btrim(title_en)) BETWEEN 1 AND 255),
 body_ne text NOT NULL CHECK(length(btrim(body_ne)) BETWEEN 1 AND 50000),
 body_en text NOT NULL CHECK(length(btrim(body_en)) BETWEEN 1 AND 50000),
 content_hash text NOT NULL,
 approved_by uuid NOT NULL REFERENCES user_accounts(id),
 approval_reference text NOT NULL CHECK(length(btrim(approval_reference)) BETWEEN 1 AND 500),
 effective_at timestamptz NOT NULL,
 expires_at timestamptz CHECK(expires_at>effective_at),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(kind,version)
);
CREATE FUNCTION immutable_policy_document() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'POLICY_DOCUMENT_IMMUTABLE'; END IF;
 NEW.content_hash=encode(sha256(convert_to(jsonb_build_array(NEW.kind,NEW.version,NEW.title_ne,NEW.title_en,NEW.body_ne,NEW.body_en)::text,'UTF8')),'hex');
 RETURN NEW;
END $$;
CREATE TRIGGER policy_document_immutable BEFORE INSERT OR UPDATE OR DELETE ON policy_documents FOR EACH ROW EXECUTE FUNCTION immutable_policy_document();
CREATE TABLE policy_acknowledgements (
 account_id uuid NOT NULL REFERENCES user_accounts(id),
 document_id uuid NOT NULL REFERENCES policy_documents(id),
 content_hash text NOT NULL CHECK(content_hash ~ '^[a-f0-9]{64}$'),
 accepted_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(account_id,document_id)
);
CREATE FUNCTION immutable_policy_acknowledgement() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'POLICY_ACKNOWLEDGEMENT_IMMUTABLE'; END IF;
 IF NOT EXISTS(SELECT 1 FROM policy_documents WHERE id=NEW.document_id AND content_hash=NEW.content_hash) THEN RAISE EXCEPTION 'POLICY_HASH_MISMATCH'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER policy_acknowledgement_immutable BEFORE INSERT OR UPDATE OR DELETE ON policy_acknowledgements FOR EACH ROW EXECUTE FUNCTION immutable_policy_acknowledgement();
