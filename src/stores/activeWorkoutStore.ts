'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import { formatAutoWorkoutName } from '@/lib/utils/workoutName';

export interface ActiveSet {
  id: string;
  exerciseId: string;
  setNumber: number;
  weight: number | null;
  reps: number | null;
  leftWeight: number | null;
  leftReps: number | null;
  rightWeight: number | null;
  rightReps: number | null;
  time: number | null;      // For cardio: duration in seconds
  distance: number | null;  // For cardio: distance in miles (stored as miles)
  isWarmup: boolean;
  isCompleted: boolean;
  timestamp: string | null;
}

export type ExerciseLogMode = 'combined' | 'split_lr';
export type WorkoutBuilderMode = 'standard' | 'calendar_edit' | 'calendar_add' | 'template_builder';

export interface WorkoutExercise {
  exerciseId: string;
  exerciseName: string;
  exerciseCategory: string;  // 'cardio', 'barbell', 'dumbbell', etc.
  logMode: ExerciseLogMode;
  sets: ActiveSet[];
  restTimerSeconds: number;
  notes: string;
}

export interface HydratedSetInput {
  id?: string;
  setNumber?: number;
  weight?: number | null;
  reps?: number | null;
  leftWeight?: number | null;
  leftReps?: number | null;
  rightWeight?: number | null;
  rightReps?: number | null;
  time?: number | null;
  distance?: number | null;
  isWarmup?: boolean;
  isCompleted?: boolean;
  timestamp?: string | null;
}

export interface HydratedExerciseInput {
  exerciseId: string;
  exerciseName: string;
  exerciseCategory: string;
  logMode?: ExerciseLogMode;
  sets?: HydratedSetInput[];
  restTimerSeconds?: number;
  notes?: string;
}

interface HydratedWorkoutPayload {
  workoutId?: string;
  workoutName?: string;
  startTime?: string;
  templateId?: string | null;
  exercises?: HydratedExerciseInput[];
  builderMode?: WorkoutBuilderMode;
  saveTargetWorkoutId?: string | null;
  saveTargetStartTime?: string | null;
  saveTargetEndTime?: string | null;
}

export interface PerformanceSet {
  weight: number;
  reps: number;
  setNumber?: number;
}

export interface ActiveWorkoutState {
  workoutId: string | null;
  workoutName: string;
  startTime: string | null;
  exercises: WorkoutExercise[];
  isActive: boolean;
  previousPerformance: Record<string, PerformanceSet[]>;
  templateId: string | null;
  builderMode: WorkoutBuilderMode;
  saveTargetWorkoutId: string | null;
  saveTargetStartTime: string | null;
  saveTargetEndTime: string | null;

  startWorkout: (name?: string, templateId?: string) => void;
  hydrateWorkoutSession: (payload: HydratedWorkoutPayload) => void;
  addExercise: (exercise: { id: string; name: string; category: string }) => void;
  addExerciseWithSets: (exercise: { id: string; name: string; category: string }, setCount: number) => void;
  removeExercise: (exerciseId: string) => void;
  moveExercise: (fromIndex: number, toIndex: number) => void;
  setExerciseLogMode: (exerciseIndex: number, mode: ExerciseLogMode) => void;
  addSet: (exerciseIndex: number) => void;
  insertSet: (exerciseIndex: number, setIndex: number, set: ActiveSet) => void;
  updateSet: (exerciseIndex: number, setIndex: number, data: Partial<ActiveSet>) => void;
  completeSet: (exerciseIndex: number, setIndex: number) => void;
  removeSet: (exerciseIndex: number, setIndex: number) => void;
  setPreviousPerformance: (exerciseId: string, sets: PerformanceSet[]) => void;
  finishWorkout: () => { workoutId: string; exercises: WorkoutExercise[]; startTime: string; workoutName: string; templateId: string | null } | null;
  discardWorkout: () => void;
}

function deriveCombinedFromSplit(set: ActiveSet): { weight: number | null; reps: number | null } {
  const leftWeight = set.leftWeight ?? 0;
  const rightWeight = set.rightWeight ?? 0;
  const leftReps = set.leftReps ?? 0;
  const rightReps = set.rightReps ?? 0;

  if (leftWeight === 0 && rightWeight === 0 && leftReps === 0 && rightReps === 0) {
    return { weight: null, reps: null };
  }

  if (leftWeight > rightWeight) {
    return { weight: leftWeight || null, reps: leftReps || null };
  }

  if (rightWeight > leftWeight) {
    return { weight: rightWeight || null, reps: rightReps || null };
  }

  return {
    weight: leftWeight || rightWeight || null,
    reps: Math.max(leftReps, rightReps) || null,
  };
}

function withSplitDefaults(set: ActiveSet): ActiveSet {
  const leftWeight = set.leftWeight ?? set.weight;
  const rightWeight = set.rightWeight ?? set.weight;
  const leftReps = set.leftReps ?? set.reps;
  const rightReps = set.rightReps ?? set.reps;

  const next: ActiveSet = {
    ...set,
    leftWeight,
    rightWeight,
    leftReps,
    rightReps,
  };

  const combined = deriveCombinedFromSplit(next);
  return { ...next, ...combined };
}

function toCombinedFromSplit(set: ActiveSet): ActiveSet {
  const combined = deriveCombinedFromSplit(set);
  return {
    ...set,
    ...combined,
  };
}

export const useActiveWorkoutStore = create<ActiveWorkoutState>()(
  persist(
    (set, get) => ({
      workoutId: null,
      workoutName: '',
      startTime: null,
      exercises: [],
      isActive: false,
      previousPerformance: {},
      templateId: null,
      builderMode: 'standard',
      saveTargetWorkoutId: null,
      saveTargetStartTime: null,
      saveTargetEndTime: null,

      startWorkout: (name?: string, templateId?: string) => {
        set({
          workoutId: uuidv4(),
          workoutName: name || formatAutoWorkoutName(new Date()),
          startTime: new Date().toISOString(),
          exercises: [],
          isActive: true,
          previousPerformance: {},
          templateId: templateId || null,
          builderMode: 'standard',
          saveTargetWorkoutId: null,
          saveTargetStartTime: null,
          saveTargetEndTime: null,
        });
      },

      hydrateWorkoutSession: (payload) => {
        const startTime = payload.startTime || new Date().toISOString();
        const workoutId = payload.workoutId || uuidv4();
        const normalizedExercises: WorkoutExercise[] = (payload.exercises || []).map((exercise) => {
          const logMode: ExerciseLogMode = exercise.logMode || 'combined';
          const rawSets = exercise.sets || [];
          const fallbackSet =
            rawSets.length === 0
              ? [{
                  setNumber: 1,
                  weight: null,
                  reps: null,
                  leftWeight: null,
                  leftReps: null,
                  rightWeight: null,
                  rightReps: null,
                  time: null,
                  distance: null,
                  isWarmup: false,
                  isCompleted: false,
                  timestamp: null,
                }]
              : rawSets;

          const sets = fallbackSet.map((set, index) => {
            const baseSet: ActiveSet = {
              id: set.id || uuidv4(),
              exerciseId: exercise.exerciseId,
              setNumber: set.setNumber || index + 1,
              weight: set.weight ?? null,
              reps: set.reps ?? null,
              leftWeight: set.leftWeight ?? null,
              leftReps: set.leftReps ?? null,
              rightWeight: set.rightWeight ?? null,
              rightReps: set.rightReps ?? null,
              time: set.time ?? null,
              distance: set.distance ?? null,
              isWarmup: set.isWarmup ?? false,
              isCompleted: set.isCompleted ?? false,
              timestamp: set.timestamp ?? null,
            };
            return logMode === 'split_lr' ? withSplitDefaults(baseSet) : baseSet;
          });

          return {
            exerciseId: exercise.exerciseId,
            exerciseName: exercise.exerciseName,
            exerciseCategory: exercise.exerciseCategory,
            logMode,
            sets,
            restTimerSeconds: exercise.restTimerSeconds ?? 90,
            notes: exercise.notes ?? '',
          };
        });

        set({
          workoutId,
          workoutName: payload.workoutName || formatAutoWorkoutName(new Date(startTime)),
          startTime,
          exercises: normalizedExercises,
          isActive: true,
          previousPerformance: {},
          templateId: payload.templateId ?? null,
          builderMode: payload.builderMode || 'standard',
          saveTargetWorkoutId: payload.saveTargetWorkoutId ?? null,
          saveTargetStartTime: payload.saveTargetStartTime ?? null,
          saveTargetEndTime: payload.saveTargetEndTime ?? null,
        });
      },

      addExercise: (exercise) => {
        const state = get();
        const newExercise: WorkoutExercise = {
          exerciseId: exercise.id,
          exerciseName: exercise.name,
          exerciseCategory: exercise.category,
          sets: [
            {
              id: uuidv4(),
              exerciseId: exercise.id,
              setNumber: 1,
              weight: null,
              reps: null,
              leftWeight: null,
              leftReps: null,
              rightWeight: null,
              rightReps: null,
              time: null,
              distance: null,
              isWarmup: false,
              isCompleted: false,
              timestamp: null,
            },
          ],
          logMode: 'combined',
          restTimerSeconds: 90,
          notes: '',
        };
        set({ exercises: [...state.exercises, newExercise] });
      },

      addExerciseWithSets: (exercise, setCount) => {
        const state = get();
        const sets: ActiveSet[] = Array.from({ length: setCount }, (_, i) => ({
          id: uuidv4(),
          exerciseId: exercise.id,
          setNumber: i + 1,
          weight: null,
          reps: null,
          leftWeight: null,
          leftReps: null,
          rightWeight: null,
          rightReps: null,
          time: null,
          distance: null,
          isWarmup: false,
          isCompleted: false,
          timestamp: null,
        }));
        const newExercise: WorkoutExercise = {
          exerciseId: exercise.id,
          exerciseName: exercise.name,
          exerciseCategory: exercise.category,
          logMode: 'combined',
          sets,
          restTimerSeconds: 90,
          notes: '',
        };
        set({ exercises: [...state.exercises, newExercise] });
      },

      removeExercise: (exerciseId) => {
        const state = get();
        set({
          exercises: state.exercises.filter((e) => e.exerciseId !== exerciseId),
        });
      },

      moveExercise: (fromIndex, toIndex) => {
        const state = get();
        if (fromIndex === toIndex) return;
        if (fromIndex < 0 || fromIndex >= state.exercises.length) return;
        if (toIndex < 0 || toIndex >= state.exercises.length) return;

        const exercises = [...state.exercises];
        const [moved] = exercises.splice(fromIndex, 1);
        exercises.splice(toIndex, 0, moved);
        set({ exercises });
      },

      setExerciseLogMode: (exerciseIndex, mode) => {
        const state = get();
        const exercises = [...state.exercises];
        const currentExercise = exercises[exerciseIndex];
        if (!currentExercise || currentExercise.exerciseCategory === 'cardio') return;
        const exercise = { ...currentExercise };
        if (exercise.logMode === mode) return;

        const sets = exercise.sets.map((set) =>
          mode === 'split_lr' ? withSplitDefaults(set) : toCombinedFromSplit(set)
        );

        exercise.logMode = mode;
        exercise.sets = sets;
        exercises[exerciseIndex] = exercise;
        set({ exercises });
      },

      addSet: (exerciseIndex) => {
        const state = get();
        const exercises = [...state.exercises];
        const exercise = { ...exercises[exerciseIndex] };
        const lastSet = exercise.sets[exercise.sets.length - 1];
        const prev = state.previousPerformance[exercise.exerciseId];
        const nextSetNum = exercise.sets.length + 1;
        const prevForSetNumber = prev?.find((s) => s.setNumber === nextSetNum) ?? prev?.[exercise.sets.length];

        const prefillWeight = lastSet?.weight ?? prevForSetNumber?.weight ?? null;
        const prefillReps = lastSet?.reps ?? prevForSetNumber?.reps ?? null;
        const prefillLeftWeight = lastSet?.leftWeight ?? prefillWeight;
        const prefillRightWeight = lastSet?.rightWeight ?? prefillWeight;
        const prefillLeftReps = lastSet?.leftReps ?? prefillReps;
        const prefillRightReps = lastSet?.rightReps ?? prefillReps;
        const prefillTime = lastSet?.time ?? null;
        const prefillDistance = lastSet?.distance ?? null;

        const nextSet: ActiveSet = {
          id: uuidv4(),
          exerciseId: exercise.exerciseId,
          setNumber: nextSetNum,
          weight: prefillWeight,
          reps: prefillReps,
          leftWeight: prefillLeftWeight,
          leftReps: prefillLeftReps,
          rightWeight: prefillRightWeight,
          rightReps: prefillRightReps,
          time: prefillTime,
          distance: prefillDistance,
          isWarmup: false,
          isCompleted: false,
          timestamp: null,
        };

        exercise.sets = [
          ...exercise.sets,
          exercise.logMode === 'split_lr' ? withSplitDefaults(nextSet) : nextSet,
        ];
        exercises[exerciseIndex] = exercise;
        set({ exercises });
      },

      insertSet: (exerciseIndex, setIndex, restoredSet) => {
        const state = get();
        const exercises = [...state.exercises];
        const exercise = { ...exercises[exerciseIndex] };
        if (!exercise) return;

        const sets = [...exercise.sets];
        const insertAt = Math.max(0, Math.min(setIndex, sets.length));
        const nextSet: ActiveSet = {
          ...restoredSet,
          exerciseId: exercise.exerciseId,
        };
        const normalizedSet = exercise.logMode === 'split_lr' ? toCombinedFromSplit(nextSet) : nextSet;
        sets.splice(insertAt, 0, normalizedSet);

        exercise.sets = sets.map((s, i) => ({ ...s, setNumber: i + 1 }));
        exercises[exerciseIndex] = exercise;
        set({ exercises });
      },

      updateSet: (exerciseIndex, setIndex, data) => {
        const state = get();
        const exercises = [...state.exercises];
        const exercise = { ...exercises[exerciseIndex] };
        const sets = [...exercise.sets];
        const nextSet = { ...sets[setIndex], ...data } as ActiveSet;
        sets[setIndex] = exercise.logMode === 'split_lr' ? toCombinedFromSplit(nextSet) : nextSet;
        exercise.sets = sets;
        exercises[exerciseIndex] = exercise;
        set({ exercises });
      },

      completeSet: (exerciseIndex, setIndex) => {
        const state = get();
        const exercises = [...state.exercises];
        const exercise = { ...exercises[exerciseIndex] };
        const sets = [...exercise.sets];
        sets[setIndex] = {
          ...sets[setIndex],
          isCompleted: true,
          timestamp: new Date().toISOString(),
        };
        exercise.sets = sets;
        exercises[exerciseIndex] = exercise;
        set({ exercises });
      },

      removeSet: (exerciseIndex, setIndex) => {
        const state = get();
        const exercises = [...state.exercises];
        const exercise = { ...exercises[exerciseIndex] };
        exercise.sets = exercise.sets
          .filter((_, i) => i !== setIndex)
          .map((s, i) => ({ ...s, setNumber: i + 1 }));
        exercises[exerciseIndex] = exercise;
        set({ exercises });
      },

      setPreviousPerformance: (exerciseId, sets) => {
        const state = get();
        set({
          previousPerformance: { ...state.previousPerformance, [exerciseId]: sets },
        });
      },

      finishWorkout: () => {
        const state = get();
        if (!state.workoutId || !state.startTime) return null;

        const result = {
          workoutId: state.workoutId,
          exercises: state.exercises,
          startTime: state.startTime,
          workoutName: state.workoutName,
          templateId: state.templateId,
        };

        set({
          workoutId: null,
          workoutName: '',
          startTime: null,
          exercises: [],
          isActive: false,
          previousPerformance: {},
          templateId: null,
          builderMode: 'standard',
          saveTargetWorkoutId: null,
          saveTargetStartTime: null,
          saveTargetEndTime: null,
        });

        return result;
      },

      discardWorkout: () => {
        set({
          workoutId: null,
          workoutName: '',
          startTime: null,
          exercises: [],
          isActive: false,
          previousPerformance: {},
          templateId: null,
          builderMode: 'standard',
          saveTargetWorkoutId: null,
          saveTargetStartTime: null,
          saveTargetEndTime: null,
        });
      },
    }),
    {
      name: 'active-workout',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
