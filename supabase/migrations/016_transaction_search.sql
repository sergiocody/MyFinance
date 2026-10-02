-- Migration: fuzzy free-text search over transaction descriptions.
-- Case/accent-insensitive; every word in the query must appear as a substring
-- or (for words of 4+ chars) be similar enough to tolerate typos.

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;

-- SECURITY INVOKER (default) so RLS on transactions still applies.
CREATE OR REPLACE FUNCTION public.search_transactions(p_query TEXT)
RETURNS SETOF public.transactions
LANGUAGE sql
STABLE
SET search_path = public, extensions
AS $$
  WITH q AS (
    SELECT array_remove(
      regexp_split_to_array(unaccent(lower(btrim(coalesce(p_query, '')))), '\s+'),
      ''
    ) AS words
  )
  SELECT t.*
  FROM public.transactions AS t
  CROSS JOIN q
  CROSS JOIN LATERAL (SELECT unaccent(lower(coalesce(t.description, ''))) AS d) AS n
  WHERE cardinality(q.words) > 0
    AND NOT EXISTS (
      SELECT 1
      FROM unnest(q.words) AS w
      WHERE strpos(n.d, w) = 0
        AND (char_length(w) < 4 OR word_similarity(w, n.d) < 0.5)
    );
$$;

GRANT EXECUTE ON FUNCTION public.search_transactions(TEXT) TO authenticated;
