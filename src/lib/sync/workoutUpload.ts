import type { SupabaseClient } from '@supabase/supabase-js';

export interface WorkoutUploadSet {
  setNumber: number;
  weight: number | null;
  reps: number | null;
  leftWeight: number | null;
  leftReps: number | null;
  rightWeight: number | null;
  rightReps: number | null;
  time: number | null;
  distance: number | null;
  isWarmup: boolean;
  isCompleted: boolean;
}

export interface WorkoutUploadExercise {
  exerciseId: string;
  logMode: 'combined' | 'split_lr';
  sets: WorkoutUploadSet[];
}

export interface WorkoutUploadSnapshot {
  workoutId: string;
  workoutName: string;
  startTime: string;
  templateId: string | null;
  exercises: WorkoutUploadExercise[];
}

export async function withTimeout<T>(promise: PromiseLike<T>, timeoutMs: number, label: string): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs);
    }),
  ]);
}

export async function uploadWorkoutSnapshot(
  supabase: SupabaseClient,
  userId: string,
  snapshot: WorkoutUploadSnapshot,
  timeoutMs: number,
) {
  const { error: workoutError } = await withTimeout(
    supabase
      .from('workouts')
      .upsert(
        {
          id: snapshot.workoutId,
          user_id: userId,
          name: snapshot.workoutName,
          date: snapshot.startTime,
          start_time: snapshot.startTime,
          end_time: new Date().toISOString(),
        },
        { onConflict: 'id' },
      ),
    timeoutMs,
    'Workout save',
  );
  if (workoutError) throw workoutError;

  // Make retries idempotent if a previous attempt partially inserted sets.
  const { error: deleteSetsError } = await withTimeout(
    supabase.from('sets').delete().eq('workout_id', snapshot.workoutId),
    timeoutMs,
    'Set cleanup',
  );
  if (deleteSetsError) throw deleteSetsError;

  const setsToInsert = snapshot.exercises.flatMap((exercise) =>
    exercise.sets
      .filter((set) => set.isCompleted)
      .map((set) => ({
        workout_id: snapshot.workoutId,
        exercise_id: exercise.exerciseId,
        set_number: set.setNumber,
        weight: set.weight,
        reps: set.reps,
        left_weight: exercise.logMode === 'split_lr' ? set.leftWeight : null,
        left_reps: exercise.logMode === 'split_lr' ? set.leftReps : null,
        right_weight: exercise.logMode === 'split_lr' ? set.rightWeight : null,
        right_reps: exercise.logMode === 'split_lr' ? set.rightReps : null,
        is_split_lr: exercise.logMode === 'split_lr',
        time: set.time,
        distance: set.distance,
        is_warmup: set.isWarmup,
        is_completed: true,
      })),
  );

  if (setsToInsert.length === 0) return;

  const { error: setsError } = await withTimeout(
    supabase.from('sets').insert(setsToInsert),
    timeoutMs,
    'Set save',
  );
  if (setsError) throw setsError;
}

