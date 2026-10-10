-- New governed documents are separate from legacy articles: no approval is inferred.
CREATE TABLE cultural_documents (
 id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
 slug VARCHAR(120) NOT NULL UNIQUE,
 designated_approver_id UUID REFERENCES user_accounts(id),
 published_revision INT,
 version INT NOT NULL DEFAULT 1 CHECK(version > 0),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE cultural_revisions (
 document_id UUID NOT NULL REFERENCES cultural_documents(id),
 revision INT NOT NULL CHECK(revision > 0),
 state VARCHAR(20) NOT NULL CHECK(state IN ('DRAFT','REVIEW','APPROVED','PUBLISHED','ARCHIVED','SUPERSEDED')),
 title_nepali VARCHAR(255) NOT NULL,
 title_english VARCHAR(255),
 content_nepali TEXT NOT NULL,
 content_english TEXT,
 category VARCHAR(50) NOT NULL,
 keywords TEXT[] NOT NULL DEFAULT '{}',
 provenance TEXT NOT NULL,
 author_id UUID NOT NULL REFERENCES user_accounts(id),
 reviewer_id UUID REFERENCES user_accounts(id),
 reviewed_at TIMESTAMPTZ,
 approved_by UUID REFERENCES user_accounts(id),
 approved_at TIMESTAMPTZ,
 published_by UUID REFERENCES user_accounts(id),
 published_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(document_id,revision),
 CHECK(reviewer_id IS NULL OR reviewer_id<>author_id),
 CHECK(approved_by IS NULL OR (approved_by<>author_id AND approved_by<>reviewer_id)),
 CHECK(state NOT IN ('APPROVED','PUBLISHED','SUPERSEDED') OR
   (reviewer_id IS NOT NULL AND approved_by IS NOT NULL AND approved_at IS NOT NULL)),
 CHECK(state NOT IN ('PUBLISHED','SUPERSEDED') OR published_at IS NOT NULL)
);
CREATE UNIQUE INDEX cultural_one_pending_revision ON cultural_revisions(document_id) WHERE state IN ('DRAFT','REVIEW','APPROVED');
CREATE UNIQUE INDEX cultural_one_published_revision ON cultural_revisions(document_id) WHERE state='PUBLISHED';
ALTER TABLE cultural_documents ADD CONSTRAINT cultural_published_revision_fk FOREIGN KEY(id,published_revision) REFERENCES cultural_revisions(document_id,revision);
CREATE TABLE cultural_revision_events (
 sequence BIGSERIAL PRIMARY KEY,
 document_id UUID NOT NULL,
 revision INT NOT NULL,
 action VARCHAR(40) NOT NULL,
 actor_id UUID NOT NULL REFERENCES user_accounts(id),
 reason TEXT NOT NULL,
 designated_approver_id UUID REFERENCES user_accounts(id),
 document_version INT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 FOREIGN KEY(document_id,revision) REFERENCES cultural_revisions(document_id,revision)
);
CREATE INDEX cultural_published_search ON cultural_revisions USING GIN
 (to_tsvector('simple',coalesce(title_nepali,'')||' '||coalesce(title_english,'')||' '||coalesce(content_nepali,'')||' '||coalesce(content_english,''))) WHERE state='PUBLISHED';
