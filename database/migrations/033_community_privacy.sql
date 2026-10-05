ALTER TABLE community_posts
 ADD COLUMN locality JSONB,
 ADD COLUMN locality_visibility VARCHAR(24) NOT NULL DEFAULT 'PRIVATE' CHECK(locality_visibility IN ('PRIVATE','VERIFIED_COMMUNITY')),
 ADD COLUMN contact_visibility VARCHAR(24) NOT NULL DEFAULT 'PRIVATE' CHECK(contact_visibility IN ('PRIVATE','VERIFIED_COMMUNITY')),
 ADD COLUMN contact_consent BOOLEAN NOT NULL DEFAULT FALSE,
 ADD CONSTRAINT community_contact_consent CHECK((contact_visibility='VERIFIED_COMMUNITY')=contact_consent);
ALTER TABLE community_post_revisions
 ADD COLUMN locality JSONB,
 ADD COLUMN locality_visibility VARCHAR(24) NOT NULL DEFAULT 'PRIVATE',
 ADD COLUMN contact_visibility VARCHAR(24) NOT NULL DEFAULT 'PRIVATE',
 ADD COLUMN contact_consent BOOLEAN NOT NULL DEFAULT FALSE;
