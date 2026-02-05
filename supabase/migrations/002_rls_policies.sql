-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE workouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE body_measurements ENABLE ROW LEVEL SECURITY;

-- Profiles
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Exercises: everyone reads non-custom, users CRUD their own custom
CREATE POLICY "Anyone can view non-custom exercises" ON exercises FOR SELECT USING (is_custom = false);
CREATE POLICY "Users can view own custom exercises" ON exercises FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create custom exercises" ON exercises FOR INSERT WITH CHECK (auth.uid() = user_id AND is_custom = true);
CREATE POLICY "Users can update own custom exercises" ON exercises FOR UPDATE USING (auth.uid() = user_id AND is_custom = true);
CREATE POLICY "Users can delete own custom exercises" ON exercises FOR DELETE USING (auth.uid() = user_id AND is_custom = true);

-- Workouts
CREATE POLICY "Users can view own workouts" ON workouts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own workouts" ON workouts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own workouts" ON workouts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own workouts" ON workouts FOR DELETE USING (auth.uid() = user_id);

-- Sets (access through workout ownership)
CREATE POLICY "Users can view own sets" ON sets FOR SELECT
  USING (EXISTS (SELECT 1 FROM workouts WHERE workouts.id = sets.workout_id AND workouts.user_id = auth.uid()));
CREATE POLICY "Users can create own sets" ON sets FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM workouts WHERE workouts.id = sets.workout_id AND workouts.user_id = auth.uid()));
CREATE POLICY "Users can update own sets" ON sets FOR UPDATE
  USING (EXISTS (SELECT 1 FROM workouts WHERE workouts.id = sets.workout_id AND workouts.user_id = auth.uid()));
CREATE POLICY "Users can delete own sets" ON sets FOR DELETE
  USING (EXISTS (SELECT 1 FROM workouts WHERE workouts.id = sets.workout_id AND workouts.user_id = auth.uid()));

-- Body Measurements
CREATE POLICY "Users can view own measurements" ON body_measurements FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own measurements" ON body_measurements FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own measurements" ON body_measurements FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own measurements" ON body_measurements FOR DELETE USING (auth.uid() = user_id);
