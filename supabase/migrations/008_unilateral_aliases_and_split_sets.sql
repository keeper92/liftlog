-- Add canonical exercise mapping fields.
ALTER TABLE exercises
  ADD COLUMN IF NOT EXISTS canonical_exercise_id UUID REFERENCES exercises(id) ON DELETE SET NULL;

ALTER TABLE exercises
  ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN DEFAULT FALSE NOT NULL;

CREATE INDEX IF NOT EXISTS idx_exercises_canonical_exercise_id
  ON exercises(canonical_exercise_id);

CREATE INDEX IF NOT EXISTS idx_exercises_is_hidden
  ON exercises(is_hidden);

-- Hide seeded unilateral/alternating variants and link to canonical exercise when a direct base-name match exists.
WITH normalized_aliases AS (
  SELECT
    e.id AS alias_id,
    trim(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            lower(e.name),
            '[()]',
            ' ',
            'g'
          ),
          '(one[- ]arm|single[- ]arm|one[- ]hand|single[- ]hand|alternat(e|ing)|unilateral|see[- ]saw)',
          ' ',
          'gi'
        ),
        '\s+',
        ' ',
        'g'
      )
    ) AS canonical_name
  FROM exercises e
  WHERE e.is_custom = FALSE
    AND lower(e.name) ~ '(one[- ]arm|single[- ]arm|one[- ]hand|single[- ]hand|alternat(e|ing)|unilateral|see[- ]saw)'
),
canonical_matches AS (
  SELECT
    a.alias_id,
    c.id AS canonical_id,
    ROW_NUMBER() OVER (
      PARTITION BY a.alias_id
      ORDER BY length(c.name), c.name
    ) AS rank
  FROM normalized_aliases a
  JOIN exercises c
    ON c.is_custom = FALSE
   AND c.id <> a.alias_id
   AND lower(c.name) = a.canonical_name
)
UPDATE exercises e
SET canonical_exercise_id = m.canonical_id,
    is_hidden = TRUE
FROM canonical_matches m
WHERE e.id = m.alias_id
  AND m.rank = 1;

-- Hide all seeded unilateral/alternating variants in picker/search even when no canonical match exists.
UPDATE exercises
SET is_hidden = TRUE
WHERE is_custom = FALSE
  AND lower(name) ~ '(one[- ]arm|single[- ]arm|one[- ]hand|single[- ]hand|alternat(e|ing)|unilateral|see[- ]saw)';

-- Split L/R logging support on sets.
ALTER TABLE sets
  ADD COLUMN IF NOT EXISTS is_split_lr BOOLEAN DEFAULT FALSE NOT NULL,
  ADD COLUMN IF NOT EXISTS left_weight REAL,
  ADD COLUMN IF NOT EXISTS left_reps INTEGER,
  ADD COLUMN IF NOT EXISTS right_weight REAL,
  ADD COLUMN IF NOT EXISTS right_reps INTEGER;

-- Update fuzzy matcher to ignore hidden alias variants.
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
  WHERE e.is_hidden = FALSE
    AND similarity(lower(e.name), lower(search_name)) > 0.2
  ORDER BY similarity DESC
  LIMIT 5;
$$;

-- Update progress summary to include split L/R volume.
CREATE OR REPLACE FUNCTION get_progress_summary(user_uuid UUID)
RETURNS JSON AS $$
DECLARE
  total_workouts INTEGER;
  week_workouts INTEGER;
  week_volume REAL;
  current_streak INTEGER := 0;
  check_date DATE;
  found_workout BOOLEAN;
BEGIN
  -- Total workouts
  SELECT COUNT(*) INTO total_workouts
  FROM workouts WHERE user_id = user_uuid;

  -- This week's workouts
  SELECT COUNT(*) INTO week_workouts
  FROM workouts
  WHERE user_id = user_uuid
    AND date >= date_trunc('week', CURRENT_TIMESTAMP);

  -- This week's volume
  SELECT COALESCE(SUM(
    CASE
      WHEN s.is_split_lr THEN
        (COALESCE(s.left_weight, 0) * COALESCE(s.left_reps, 0))
        + (COALESCE(s.right_weight, 0) * COALESCE(s.right_reps, 0))
      ELSE
        COALESCE(s.weight, 0) * COALESCE(s.reps, 0)
    END
  ), 0) INTO week_volume
  FROM sets s
  JOIN workouts w ON s.workout_id = w.id
  WHERE w.user_id = user_uuid
    AND w.date >= date_trunc('week', CURRENT_TIMESTAMP)
    AND s.is_completed = true;

  -- Calculate streak (consecutive days with workouts, starting from today)
  check_date := CURRENT_DATE;
  LOOP
    SELECT EXISTS(
      SELECT 1 FROM workouts
      WHERE user_id = user_uuid AND date::date = check_date
    ) INTO found_workout;

    IF found_workout THEN
      current_streak := current_streak + 1;
      check_date := check_date - 1;
    ELSE
      -- Allow skipping today if no workout yet
      IF check_date = CURRENT_DATE THEN
        check_date := check_date - 1;
      ELSE
        EXIT;
      END IF;
    END IF;
  END LOOP;

  RETURN json_build_object(
    'totalWorkouts', total_workouts,
    'weekWorkouts', week_workouts,
    'weekVolume', week_volume,
    'currentStreak', current_streak
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update exercise progress to include split L/R sets.
CREATE OR REPLACE FUNCTION get_exercise_progress(user_uuid UUID, exercise_uuid UUID)
RETURNS JSON AS $$
BEGIN
  RETURN (
    SELECT json_agg(row_data ORDER BY workout_date)
    FROM (
      SELECT
        w.date::date AS workout_date,
        MAX(
          CASE
            WHEN s.is_split_lr THEN GREATEST(
              CASE
                WHEN COALESCE(s.left_weight, 0) > 0 AND COALESCE(s.left_reps, 0) > 0
                  THEN s.left_weight * (1 + s.left_reps::real / 30)
                ELSE 0
              END,
              CASE
                WHEN COALESCE(s.right_weight, 0) > 0 AND COALESCE(s.right_reps, 0) > 0
                  THEN s.right_weight * (1 + s.right_reps::real / 30)
                ELSE 0
              END
            )
            ELSE
              CASE
                WHEN COALESCE(s.weight, 0) > 0 AND COALESCE(s.reps, 0) > 0
                  THEN s.weight * (1 + s.reps::real / 30)
                ELSE 0
              END
          END
        ) AS estimated_1rm,
        SUM(
          CASE
            WHEN s.is_split_lr THEN
              (COALESCE(s.left_weight, 0) * COALESCE(s.left_reps, 0))
              + (COALESCE(s.right_weight, 0) * COALESCE(s.right_reps, 0))
            ELSE
              COALESCE(s.weight, 0) * COALESCE(s.reps, 0)
          END
        ) AS total_volume,
        MAX(
          CASE
            WHEN s.is_split_lr THEN GREATEST(COALESCE(s.left_weight, 0), COALESCE(s.right_weight, 0))
            ELSE COALESCE(s.weight, 0)
          END
        ) AS best_weight,
        MAX(
          CASE
            WHEN s.is_split_lr THEN GREATEST(COALESCE(s.left_reps, 0), COALESCE(s.right_reps, 0))
            ELSE COALESCE(s.reps, 0)
          END
        ) AS best_reps
      FROM sets s
      JOIN workouts w ON s.workout_id = w.id
      WHERE w.user_id = user_uuid
        AND s.exercise_id = exercise_uuid
        AND s.is_completed = true
        AND s.is_warmup = false
        AND (
          (s.is_split_lr = false AND s.weight IS NOT NULL AND s.weight > 0 AND s.reps IS NOT NULL AND s.reps > 0)
          OR
          (s.is_split_lr = true AND (
            (s.left_weight IS NOT NULL AND s.left_weight > 0 AND s.left_reps IS NOT NULL AND s.left_reps > 0)
            OR
            (s.right_weight IS NOT NULL AND s.right_weight > 0 AND s.right_reps IS NOT NULL AND s.right_reps > 0)
          ))
        )
      GROUP BY w.date::date
    ) AS row_data
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update personal records to include split L/R sets.
CREATE OR REPLACE FUNCTION get_personal_records(user_uuid UUID)
RETURNS JSON AS $$
BEGIN
  RETURN (
    SELECT json_agg(row_data)
    FROM (
      SELECT
        e.id AS exercise_id,
        e.name AS exercise_name,
        MAX(
          CASE
            WHEN s.is_split_lr THEN GREATEST(COALESCE(s.left_weight, 0), COALESCE(s.right_weight, 0))
            ELSE COALESCE(s.weight, 0)
          END
        ) AS max_weight,
        MAX(
          CASE
            WHEN s.is_split_lr THEN GREATEST(COALESCE(s.left_reps, 0), COALESCE(s.right_reps, 0))
            ELSE COALESCE(s.reps, 0)
          END
        ) AS max_reps,
        MAX(
          CASE
            WHEN s.is_split_lr THEN
              (COALESCE(s.left_weight, 0) * COALESCE(s.left_reps, 0))
              + (COALESCE(s.right_weight, 0) * COALESCE(s.right_reps, 0))
            ELSE
              COALESCE(s.weight, 0) * COALESCE(s.reps, 0)
          END
        ) AS max_volume,
        MAX(
          CASE
            WHEN s.is_split_lr THEN GREATEST(
              CASE
                WHEN COALESCE(s.left_weight, 0) > 0 AND COALESCE(s.left_reps, 0) > 0
                  THEN s.left_weight * (1 + s.left_reps::real / 30)
                ELSE 0
              END,
              CASE
                WHEN COALESCE(s.right_weight, 0) > 0 AND COALESCE(s.right_reps, 0) > 0
                  THEN s.right_weight * (1 + s.right_reps::real / 30)
                ELSE 0
              END
            )
            ELSE
              CASE
                WHEN COALESCE(s.weight, 0) > 0 AND COALESCE(s.reps, 0) > 0
                  THEN s.weight * (1 + s.reps::real / 30)
                ELSE 0
              END
          END
        ) AS estimated_1rm
      FROM sets s
      JOIN workouts w ON s.workout_id = w.id
      JOIN exercises e ON s.exercise_id = e.id
      WHERE w.user_id = user_uuid
        AND s.is_completed = true
        AND s.is_warmup = false
        AND (
          (s.is_split_lr = false AND s.weight IS NOT NULL AND s.weight > 0 AND s.reps IS NOT NULL AND s.reps > 0)
          OR
          (s.is_split_lr = true AND (
            (s.left_weight IS NOT NULL AND s.left_weight > 0 AND s.left_reps IS NOT NULL AND s.left_reps > 0)
            OR
            (s.right_weight IS NOT NULL AND s.right_weight > 0 AND s.right_reps IS NOT NULL AND s.right_reps > 0)
          ))
        )
      GROUP BY e.id, e.name
      ORDER BY MAX(
        CASE
          WHEN s.is_split_lr THEN GREATEST(
            CASE
              WHEN COALESCE(s.left_weight, 0) > 0 AND COALESCE(s.left_reps, 0) > 0
                THEN s.left_weight * (1 + s.left_reps::real / 30)
              ELSE 0
            END,
            CASE
              WHEN COALESCE(s.right_weight, 0) > 0 AND COALESCE(s.right_reps, 0) > 0
                THEN s.right_weight * (1 + s.right_reps::real / 30)
              ELSE 0
            END
          )
          ELSE
            CASE
              WHEN COALESCE(s.weight, 0) > 0 AND COALESCE(s.reps, 0) > 0
                THEN s.weight * (1 + s.reps::real / 30)
              ELSE 0
            END
        END
      ) DESC
    ) AS row_data
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

