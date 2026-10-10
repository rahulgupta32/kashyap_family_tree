-- Search-only index: authoritative names and alias strings are never rewritten.
CREATE INDEX idx_person_names_normalized_trgm ON person_names USING gin
 ((lower(btrim(regexp_replace(normalize(full_name, NFKC), '[[:space:]]+', ' ', 'g')))) gin_trgm_ops);
