-- Workout Templates
CREATE TABLE workout_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
CREATE INDEX idx_workout_templates_user_id ON workout_templates(user_id);

-- Template Exercises
CREATE TABLE template_exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES workout_templates(id) ON DELETE CASCADE,
  exercise_id UUID NOT NULL REFERENCES exercises(id),
  order_index INTEGER NOT NULL,
  default_sets INTEGER DEFAULT 3 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
CREATE INDEX idx_template_exercises_template_id ON template_exercises(template_id);

-- Enable RLS
ALTER TABLE workout_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE template_exercises ENABLE ROW LEVEL SECURITY;

-- workout_templates policies
CREATE POLICY "Users can view own templates" ON workout_templates
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own templates" ON workout_templates
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own templates" ON workout_templates
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own templates" ON workout_templates
  FOR DELETE USING (auth.uid() = user_id);

-- template_exercises policies (cascade through template ownership)
CREATE POLICY "Users can view own template exercises" ON template_exercises
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM workout_templates
    WHERE workout_templates.id = template_exercises.template_id
    AND workout_templates.user_id = auth.uid()
  ));
CREATE POLICY "Users can create own template exercises" ON template_exercises
  FOR INSERT WITH CHECK (EXISTS (
    SELECT 1 FROM workout_templates
    WHERE workout_templates.id = template_exercises.template_id
    AND workout_templates.user_id = auth.uid()
  ));
CREATE POLICY "Users can delete own template exercises" ON template_exercises
  FOR DELETE USING (EXISTS (
    SELECT 1 FROM workout_templates
    WHERE workout_templates.id = template_exercises.template_id
    AND workout_templates.user_id = auth.uid()
  ));
