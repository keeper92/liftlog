import { NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import demoWorkoutHistory from '@/lib/demo/demo-workout-history.json';

type ExerciseCategory =
  | 'barbell'
  | 'dumbbell'
  | 'machine'
  | 'cable'
  | 'bodyweight'
  | 'cardio'
  | 'stretching'
  | 'plyometrics'
  | 'strongman'
  | 'olympic_weightlifting'
  | 'other';

interface DemoSet {
  weight: number | null;
  reps: number | null;
  time: number | null;
}

interface DemoExercise {
  name: string;
  sets: DemoSet[];
}

interface DemoWorkout {
  date: string; // YYYY-MM-DD
  name: string;
  exercises: DemoExercise[];
}

const DEMO_EMAIL = 'demo@reps.app';
const DEMO_PASSWORD = 'demo123456';
const DEMO_WORKOUTS = demoWorkoutHistory as DemoWorkout[];

export async function POST() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Check if demo user exists
  const { data: existingUsers } = await supabase.auth.admin.listUsers();
  const demoUser = existingUsers?.users?.find((u) => u.email === DEMO_EMAIL);

  let userId: string;

  if (demoUser) {
    // Delete existing demo user to get fresh seed data
    await supabase.auth.admin.deleteUser(demoUser.id);
  }

  {
    // Create demo user
    const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
      email_confirm: true,
    });

    if (createError || !newUser.user) {
      return NextResponse.json({ error: 'Failed to create demo user' }, { status: 500 });
    }

    userId = newUser.user.id;

    // Set demo user to imperial units
    await supabase
      .from('profiles')
      .update({ unit_system: 'imperial' })
      .eq('id', userId);

    // Seed demo data
    await seedDemoData(supabase, userId);
  }

  return NextResponse.json({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    importedWorkouts: DEMO_WORKOUTS.length,
  });
}

function inferExerciseCategory(name: string): ExerciseCategory {
  const lower = name.toLowerCase();
  if (/stair|run|bike|rower/.test(lower)) return 'cardio';
  if (/pushup|v-up/.test(lower)) return 'bodyweight';
  if (/\bdb\b|dumbbell/.test(lower)) return 'dumbbell';
  if (/machine|leg extension|thigh|ab crunch/.test(lower)) return 'machine';
  if (/cable|rope|pulldown|seated row|chop/.test(lower)) return 'cable';
  if (/deadlift|squat/.test(lower)) return 'barbell';
  return 'other';
}

function inferPrimaryMuscles(name: string): string[] {
  const lower = name.toLowerCase();
  if (/ab|core|v-up|chop/.test(lower)) return ['abdominals'];
  if (/triceps|tri\b|pushdown/.test(lower)) return ['triceps'];
  if (/curl/.test(lower)) return ['biceps'];
  if (/row|pulldown|deadlift/.test(lower)) return ['lats'];
  if (/raise|fly/.test(lower)) return ['shoulders'];
  if (/squat|lunge|thigh|leg/.test(lower)) return ['quadriceps'];
  if (/pushup/.test(lower)) return ['chest'];
  return ['other'];
}

async function upsertExercisesForDemo(
  supabase: SupabaseClient,
  userId: string,
  names: string[],
): Promise<Map<string, string>> {
  const uniqueNames = Array.from(new Set(names));

  const { data: existing, error: existingError } = await supabase
    .from('exercises')
    .select('id, name')
    .in('name', uniqueNames);

  if (existingError) {
    throw new Error(existingError.message || 'Failed to fetch exercises');
  }

  const exerciseMap = new Map<string, string>();
  for (const ex of existing || []) {
    exerciseMap.set(ex.name, ex.id);
  }

  const missing = uniqueNames.filter((name) => !exerciseMap.has(name));
  if (missing.length === 0) {
    return exerciseMap;
  }

  const payload = missing.map((name) => ({
    name,
    category: inferExerciseCategory(name),
    primary_muscles: inferPrimaryMuscles(name),
    secondary_muscles: [],
    is_custom: true,
    user_id: userId,
  }));

  const { data: inserted, error: insertError } = await supabase
    .from('exercises')
    .insert(payload)
    .select('id, name');

  if (insertError) {
    throw new Error(insertError.message || 'Failed to insert exercises');
  }

  for (const ex of inserted || []) {
    exerciseMap.set(ex.name, ex.id);
  }

  return exerciseMap;
}

async function seedDemoData(supabase: SupabaseClient, userId: string) {
  if (DEMO_WORKOUTS.length === 0) return;

  const allExerciseNames = DEMO_WORKOUTS.flatMap((workout) => workout.exercises.map((exercise) => exercise.name));
  const exerciseMap = await upsertExercisesForDemo(supabase, userId, allExerciseNames);

  for (const workout of DEMO_WORKOUTS) {
    // Use noon UTC so US timezones stay on the same calendar date.
    const startTime = new Date(`${workout.date}T12:00:00.000Z`);
    const endTime = new Date(startTime);
    endTime.setMinutes(endTime.getMinutes() + 60);

    const { data: workoutData, error: workoutError } = await supabase
      .from('workouts')
      .insert({
        user_id: userId,
        name: workout.name || 'Imported Workout',
        date: startTime.toISOString(),
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        notes: 'Imported from custom demo history',
      })
      .select('id')
      .single();

    if (workoutError || !workoutData) {
      throw new Error(workoutError?.message || `Failed to create workout on ${workout.date}`);
    }

    const setsToInsert: Array<{
      workout_id: string;
      exercise_id: string;
      set_number: number;
      weight: number | null;
      reps: number | null;
      time: number | null;
      is_warmup: boolean;
      is_completed: boolean;
    }> = [];

    for (const exercise of workout.exercises) {
      const exerciseId = exerciseMap.get(exercise.name);
      if (!exerciseId) continue;

      for (let i = 0; i < exercise.sets.length; i += 1) {
        const set = exercise.sets[i];
        if (set.weight === null && set.reps === null && set.time === null) {
          continue;
        }

        setsToInsert.push({
          workout_id: workoutData.id,
          exercise_id: exerciseId,
          set_number: i + 1,
          weight: set.weight,
          reps: set.reps,
          time: set.time,
          is_warmup: false,
          is_completed: true,
        });
      }
    }

    if (setsToInsert.length === 0) continue;

    const { error: setsError } = await supabase.from('sets').insert(setsToInsert);
    if (setsError) {
      throw new Error(setsError.message || `Failed to insert sets for ${workout.date}`);
    }
  }
}
