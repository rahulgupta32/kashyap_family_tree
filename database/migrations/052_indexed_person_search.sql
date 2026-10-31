-- Source-preserving candidate selection. Outer repository predicates retain privacy.
CREATE INDEX idx_persons_mool_ghar_trgm ON persons USING gin (mool_ghar gin_trgm_ops);
CREATE INDEX idx_persons_birth_place_trgm ON persons USING gin (birth_place gin_trgm_ops);

-- Function-local configuration preserves the former similarity >= 0.3 rule
-- without relying on or changing pooled connections' ambient thresholds.
-- SET prevents SQL inlining and keeps the indexed operator inside this scope.
CREATE FUNCTION public.person_search_candidates(search_query text,literal_pattern text)
RETURNS TABLE(person_id uuid) LANGUAGE sql STABLE SECURITY INVOKER
SET pg_trgm.similarity_threshold = '0.3'
AS $$
 SELECT pn.person_id FROM public.person_names pn
 WHERE lower(btrim(regexp_replace(normalize(pn.full_name,NFKC),'[[:space:]]+',' ','g'))) LIKE literal_pattern
    OR lower(btrim(regexp_replace(normalize(pn.full_name,NFKC),'[[:space:]]+',' ','g'))) % search_query
 UNION
 SELECT p.id FROM public.persons p WHERE p.mool_ghar ILIKE literal_pattern
 UNION
 SELECT p.id FROM public.persons p WHERE p.birth_place ILIKE literal_pattern
$$;
