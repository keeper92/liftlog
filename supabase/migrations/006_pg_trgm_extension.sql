-- Enable pg_trgm extension for fuzzy text matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Add trigram index on exercise names for efficient fuzzy matching
CREATE INDEX IF NOT EXISTS exercises_name_trgm_idx ON exercises USING gin (name gin_trgm_ops);

-- RPC function for fuzzy exercise name matching
CREATE OR REPLACE FUNCTION match_exercise_name(search_name TEXT)
RETURNS TABLE (
  id UUID,
  name VARCHAR(200),
  category exercise_category,
  similarity REAL
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    e.id,
    e.name,
    e.category,
    similarity(lower(e.name), lower(search_name)) AS similarity
  FROM exercises e
  WHERE similarity(lower(e.name), lower(search_name)) > 0.2
  ORDER BY similarity DESC
  LIMIT 5;
$$;
