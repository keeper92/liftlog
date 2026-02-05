-- Enums
CREATE TYPE exercise_category AS ENUM (
  'barbell', 'dumbbell', 'machine', 'cable', 'bodyweight',
  'cardio', 'stretching', 'plyometrics', 'strongman', 'olympic_weightlifting', 'other'
);

CREATE TYPE unit_system AS ENUM ('metric', 'imperial');

-- Profiles (extends auth.users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username VARCHAR(50) UNIQUE NOT NULL,
  unit_system unit_system DEFAULT 'metric' NOT NULL,
  preferences JSONB DEFAULT '{}' NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Exercises (873 seed + user custom)
CREATE TABLE exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  category exercise_category NOT NULL,
  primary_muscles TEXT[] NOT NULL,
  secondary_muscles TEXT[] DEFAULT '{}' NOT NULL,
  equipment VARCHAR(100),
  force VARCHAR(20),
  level VARCHAR(20),
  mechanic VARCHAR(20),
  instructions TEXT[] DEFAULT '{}',
  media_url TEXT,
  is_custom BOOLEAN DEFAULT FALSE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
CREATE INDEX idx_exercises_name ON exercises(name);
CREATE INDEX idx_exercises_category ON exercises(category);
CREATE INDEX idx_exercises_user_id ON exercises(user_id);

-- Workouts
CREATE TABLE workouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name VARCHAR(200),
  date TIMESTAMPTZ NOT NULL,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
CREATE INDEX idx_workouts_user_id ON workouts(user_id);
CREATE INDEX idx_workouts_date ON workouts(date);

-- Sets
CREATE TABLE sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_id UUID NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
  exercise_id UUID NOT NULL REFERENCES exercises(id),
  set_number INTEGER NOT NULL,
  weight REAL,
  reps INTEGER,
  time INTEGER,
  distance REAL,
  rpe REAL,
  notes TEXT,
  is_warmup BOOLEAN DEFAULT FALSE NOT NULL,
  is_completed BOOLEAN DEFAULT TRUE NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
CREATE INDEX idx_sets_workout_id ON sets(workout_id);
CREATE INDEX idx_sets_exercise_id ON sets(exercise_id);

-- Body Measurements
CREATE TABLE body_measurements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date TIMESTAMPTZ NOT NULL,
  body_weight REAL,
  body_fat_percentage REAL,
  measurements JSONB DEFAULT '{}' NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
CREATE INDEX idx_body_measurements_user_id ON body_measurements(user_id);
CREATE INDEX idx_body_measurements_date ON body_measurements(date);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
