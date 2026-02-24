import type { SupabaseClient } from '@supabase/supabase-js';
import { isMissingSplitSetColumnsError } from '@/lib/supabase/schemaCompat';

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
  endTime?: string | null;
  templateId: string | null;
  exercises: WorkoutUploadExercise[];
}

let splitSetColumnsSupported: boolean | null = null;

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
          end_time: snapshot.endTime ?? new Date().toISOString(),
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

  const completedSets = snapshot.exercises.flatMap((exercise) =>
    exercise.sets
      .filter((set) => set.isCompleted)
      .map((set) => ({ exercise, set })),
  );

  if (completedSets.length === 0) return;

  const splitSetsToInsert = completedSets.map(({ exercise, set }) => ({
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
  }));

  if (splitSetColumnsSupported !== false) {
    const { error: splitSetsError } = await withTimeout(
      supabase.from('sets').insert(splitSetsToInsert),
      timeoutMs,
      'Set save',
    );

    if (!splitSetsError) {
      splitSetColumnsSupported = true;
      return;
    }

    if (!isMissingSplitSetColumnsError(splitSetsError)) {
      throw splitSetsError;
    }

    splitSetColumnsSupported = false;
  }

  const legacySetsToInsert = completedSets.map(({ exercise, set }) => {
    let weight = set.weight;
    let reps = set.reps;

    if (exercise.logMode === 'split_lr') {
      const leftWeight = set.leftWeight ?? 0;
      const rightWeight = set.rightWeight ?? 0;
      const leftReps = set.leftReps ?? 0;
      const rightReps = set.rightReps ?? 0;

      if (leftWeight > rightWeight) {
        weight = set.leftWeight;
        reps = set.leftReps;
      } else if (rightWeight > leftWeight) {
        weight = set.rightWeight;
        reps = set.rightReps;
      } else {
        const maxWeight = Math.max(leftWeight, rightWeight);
        const maxReps = Math.max(leftReps, rightReps);
        weight = maxWeight > 0 ? maxWeight : null;
        reps = maxReps > 0 ? maxReps : null;
      }
    }

    return {
        workout_id: snapshot.workoutId,
        exercise_id: exercise.exerciseId,
        set_number: set.setNumber,
        weight,
        reps,
        time: set.time,
        distance: set.distance,
        is_warmup: set.isWarmup,
        is_completed: true,
    };
  });

  const { error: legacySetsError } = await withTimeout(
    supabase.from('sets').insert(legacySetsToInsert),
    timeoutMs,
    'Set save',
  );
  if (legacySetsError) throw legacySetsError;
}
