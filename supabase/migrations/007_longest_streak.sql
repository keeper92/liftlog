-- Update get_progress_summary to include longestStreak
CREATE OR REPLACE FUNCTION get_progress_summary(user_uuid UUID)
RETURNS JSON AS $$
DECLARE
  total_workouts INTEGER;
  week_workouts INTEGER;
  week_volume REAL;
  current_streak INTEGER := 0;
  longest_streak INTEGER := 0;
  check_date DATE;
  found_workout BOOLEAN;
  streak_count INTEGER;
  workout_dates DATE[];
  prev_date DATE;
  d DATE;
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

  -- Calculate current streak (consecutive days with workouts, starting from today)
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

  -- Calculate longest streak (all-time)
  SELECT ARRAY_AGG(DISTINCT date::date ORDER BY date::date)
  INTO workout_dates
  FROM workouts
  WHERE user_id = user_uuid;

  IF workout_dates IS NOT NULL AND array_length(workout_dates, 1) > 0 THEN
    streak_count := 1;
    longest_streak := 1;
    FOR i IN 2..array_length(workout_dates, 1) LOOP
      IF workout_dates[i] = workout_dates[i-1] + 1 THEN
        streak_count := streak_count + 1;
      ELSE
        streak_count := 1;
      END IF;
      IF streak_count > longest_streak THEN
        longest_streak := streak_count;
      END IF;
    END LOOP;
  END IF;

  RETURN json_build_object(
    'totalWorkouts', total_workouts,
    'weekWorkouts', week_workouts,
    'weekVolume', week_volume,
    'currentStreak', current_streak,
    'longestStreak', longest_streak
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
