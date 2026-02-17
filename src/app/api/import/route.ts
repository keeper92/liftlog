import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { matchExercises } from '@/lib/utils/exerciseMatcher';
import { toStorageWeight } from '@/lib/utils/units';

interface ImportSet {
  weight: number | null;
  reps: number | null;
  time: number | null;
  distance: number | null;
  isWarmup?: boolean;
}

interface ImportExercise {
  name: string;
  exerciseId?: string; // If already matched
  sets: ImportSet[];
}

interface ImportWorkout {
  date: string;
  name?: string;
  exercises: ImportExercise[];
}

interface MatchRequest {
  action: 'match';
  exerciseNames: string[];
}

interface ImportRequest {
  action: 'import';
  workouts: ImportWorkout[];
  unitSystem: 'metric' | 'imperial';
}

type RequestBody = MatchRequest | ImportRequest;

export async function POST(request: Request) {
  const supabase = await createClient();

  // Check authentication
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json() as RequestBody;

  if (body.action === 'match') {
    return handleMatch(supabase, body.exerciseNames);
  } else if (body.action === 'import') {
    return handleImport(supabase, user.id, body.workouts, body.unitSystem);
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

async function handleMatch(
  supabase: Awaited<ReturnType<typeof createClient>>,
  exerciseNames: string[]
): Promise<NextResponse> {
  const matches = await matchExercises(supabase, exerciseNames);
  return NextResponse.json({ matches });
}

async function handleImport(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  workouts: ImportWorkout[],
  unitSystem: 'metric' | 'imperial'
): Promise<NextResponse> {
  const importedWorkoutIds: string[] = [];
  let totalSets = 0;

  // First, collect all unique exercise names that need matching
  const exerciseNames = new Set<string>();
  for (const workout of workouts) {
    for (const exercise of workout.exercises) {
      if (!exercise.exerciseId) {
        exerciseNames.add(exercise.name);
      }
    }
  }

  // Match exercises if needed
  const exerciseIdMap = new Map<string, string>();
  if (exerciseNames.size > 0) {
    const matches = await matchExercises(supabase, Array.from(exerciseNames));
    for (const match of matches) {
      if (match.matchedExercise && match.confidence >= 0.5) {
        exerciseIdMap.set(match.inputName.toLowerCase(), match.matchedExercise.id);
      }
    }
  }

  // Add pre-matched exercise IDs
  for (const workout of workouts) {
    for (const exercise of workout.exercises) {
      if (exercise.exerciseId) {
        exerciseIdMap.set(exercise.name.toLowerCase(), exercise.exerciseId);
      }
    }
  }

  // Import each workout
  for (const workout of workouts) {
    const workoutDate = new Date(workout.date);
    const endTime = new Date(workoutDate);
    endTime.setHours(endTime.getHours() + 1); // Default 1 hour duration

    // Create workout record
    const { data: workoutData, error: workoutError } = await supabase
      .from('workouts')
      .insert({
        user_id: userId,
        name: workout.name || 'Imported Workout',
        date: workoutDate.toISOString(),
        start_time: workoutDate.toISOString(),
        end_time: endTime.toISOString(),
        notes: 'Imported via AI trainer',
      })
      .select()
      .single();

    if (workoutError || !workoutData) {
      console.error('Failed to create workout:', workoutError);
      continue;
    }

    importedWorkoutIds.push(workoutData.id);

    // Prepare sets for bulk insert
    const setsToInsert = [];
    for (const exercise of workout.exercises) {
      const exerciseId = exercise.exerciseId || exerciseIdMap.get(exercise.name.toLowerCase());
      if (!exerciseId) {
        console.warn(`Skipping exercise "${exercise.name}" - no match found`);
        continue;
      }

      for (let i = 0; i < exercise.sets.length; i++) {
        const set = exercise.sets[i];
        // Convert weight from user's unit system to storage (kg)
        const storageWeight = set.weight !== null
          ? toStorageWeight(set.weight, unitSystem)
          : null;

        setsToInsert.push({
          workout_id: workoutData.id,
          exercise_id: exerciseId,
          set_number: i + 1,
          weight: storageWeight,
          reps: set.reps,
          time: set.time,
          distance: set.distance,
          is_warmup: set.isWarmup || false,
          is_completed: true,
        });
      }
    }

    if (setsToInsert.length > 0) {
      const { error: setsError } = await supabase.from('sets').insert(setsToInsert);
      if (setsError) {
        console.error('Failed to insert sets:', setsError);
      } else {
        totalSets += setsToInsert.length;
      }
    }
  }

  // Calculate date range
  const dates = workouts.map((w) => new Date(w.date).getTime());
  const minDate = new Date(Math.min(...dates)).toISOString().split('T')[0];
  const maxDate = new Date(Math.max(...dates)).toISOString().split('T')[0];

  return NextResponse.json({
    success: true,
    imported: importedWorkoutIds.length,
    workoutIds: importedWorkoutIds,
    summary: {
      totalWorkouts: importedWorkoutIds.length,
      totalSets,
      dateRange: {
        from: minDate,
        to: maxDate,
      },
    },
  });
}
