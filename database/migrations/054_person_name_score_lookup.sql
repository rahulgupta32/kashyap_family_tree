-- All recorded names, including aliases, participate in a Person's score.
-- Existing primary/alias partial indexes cannot serve the unqualified owner lookup.
CREATE INDEX idx_person_names_person_lookup ON person_names(person_id);
