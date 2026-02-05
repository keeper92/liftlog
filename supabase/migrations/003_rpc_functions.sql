-- Get progress summary (streak, weekly stats)
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
  SELECT COALESCE(SUM(s.weight * s.reps), 0) INTO week_volume
  FROM sets s
  JOIN workouts w ON s.workout_id = w.id
  WHERE w.user_id = user_uuid
    AND w.date >= date_trunc('week', CURRENT_TIMESTAMP)
    AND s.is_completed = true
    AND s.weight IS NOT NULL
    AND s.reps IS NOT NULL;

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

-- Get exercise progress (1RM over time)
CREATE OR REPLACE FUNCTION get_exercise_progress(user_uuid UUID, exercise_uuid UUID)
RETURNS JSON AS $$
BEGIN
  RETURN (
    SELECT json_agg(row_data ORDER BY workout_date)
    FROM (
      SELECT
        w.date::date AS workout_date,
        MAX(s.weight * (1 + s.reps::real / 30)) AS estimated_1rm,
        SUM(s.weight * s.reps) AS total_volume,
        MAX(s.weight) AS best_weight,
        MAX(s.reps) AS best_reps
      FROM sets s
      JOIN workouts w ON s.workout_id = w.id
      WHERE w.user_id = user_uuid
        AND s.exercise_id = exercise_uuid
        AND s.is_completed = true
        AND s.is_warmup = false
        AND s.weight IS NOT NULL
        AND s.weight > 0
        AND s.reps IS NOT NULL
        AND s.reps > 0
      GROUP BY w.date::date
    ) AS row_data
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get personal records
CREATE OR REPLACE FUNCTION get_personal_records(user_uuid UUID)
RETURNS JSON AS $$
BEGIN
  RETURN (
    SELECT json_agg(row_data)
    FROM (
      SELECT
        e.id AS exercise_id,
        e.name AS exercise_name,
        MAX(s.weight) AS max_weight,
        MAX(s.reps) AS max_reps,
        MAX(s.weight * s.reps) AS max_volume,
        MAX(s.weight * (1 + s.reps::real / 30)) AS estimated_1rm
      FROM sets s
      JOIN workouts w ON s.workout_id = w.id
      JOIN exercises e ON s.exercise_id = e.id
      WHERE w.user_id = user_uuid
        AND s.is_completed = true
        AND s.is_warmup = false
        AND s.weight IS NOT NULL
        AND s.weight > 0
      GROUP BY e.id, e.name
      ORDER BY MAX(s.weight * (1 + s.reps::real / 30)) DESC
    ) AS row_data
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
