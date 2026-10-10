-- Opt-in map entries contain only generalized locality coordinates, never GPS fixes.
CREATE TABLE household_locations (
 id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
 owner_user_id UUID NOT NULL UNIQUE REFERENCES user_accounts(id),
 person_id UUID NOT NULL REFERENCES persons(id),
 branch_id UUID NOT NULL REFERENCES branches(id),
 title VARCHAR(150) NOT NULL,
 district VARCHAR(100) NOT NULL,
 municipality VARCHAR(100) NOT NULL,
 approx_latitude NUMERIC(5,2) CHECK(approx_latitude BETWEEN -90 AND 90),
 approx_longitude NUMERIC(6,2) CHECK(approx_longitude BETWEEN -180 AND 180),
 visibility VARCHAR(30) NOT NULL DEFAULT 'PRIVATE' CHECK(visibility IN('PRIVATE','IMMEDIATE_FAMILY','BRANCH','VERIFIED_COMMUNITY','PUBLIC_AGGREGATE')),
 map_consent BOOLEAN NOT NULL DEFAULT false,
 status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK(status IN('PENDING','APPROVED','REJECTED','WITHDRAWN')),
 protected_location BOOLEAN NOT NULL DEFAULT false,
 version INT NOT NULL DEFAULT 1,
 reviewed_by UUID REFERENCES user_accounts(id),
 review_reason TEXT,
 reviewed_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CHECK((approx_latitude IS NULL)=(approx_longitude IS NULL)),
 CHECK(map_consent OR (approx_latitude IS NULL AND approx_longitude IS NULL)),
 CHECK(approx_latitude IS NULL OR mod(approx_latitude,0.1)=0),
 CHECK(approx_longitude IS NULL OR mod(approx_longitude,0.1)=0)
);
CREATE INDEX idx_household_locations_map ON household_locations(status,map_consent,branch_id);
CREATE INDEX idx_household_locations_bounds ON household_locations(approx_latitude,approx_longitude) WHERE status='APPROVED' AND map_consent;
