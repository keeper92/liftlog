'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';

export interface ActiveSet {
  id: string;
  exerciseId: string;
  setNumber: number;
  weight: number | null;
  reps: number | null;
  isWarmup: boolean;
  isCompleted: boolean;
  timestamp: string | null;
}

export interface WorkoutExercise {
  exerciseId: string;
  exerciseName: string;
  sets: ActiveSet[];
  restTimerSeconds: number;
  notes: string;
}

interface ActiveWorkoutState {
  workoutId: string | null;
  workoutName: string;
  startTime: string | null;
  exercises: WorkoutExercise[];
  isActive: boolean;
  previousPerformance: Record<string, { weight: number; reps: number }[]>;

  startWorkout: (name?: string) => void;
  addExercise: (exercise: { id: string; name: string }) => void;
  removeExercise: (exerciseId: string) => void;
  addSet: (exerciseIndex: number) => void;
  updateSet: (exerciseIndex: number, setIndex: number, data: Partial<ActiveSet>) => void;
  completeSet: (exerciseIndex: number, setIndex: number) => void;
  removeSet: (exerciseIndex: number, setIndex: number) => void;
  setPreviousPerformance: (exerciseId: string, sets: { weight: number; reps: number }[]) => void;
  finishWorkout: () => { workoutId: string; exercises: WorkoutExercise[]; startTime: string; workoutName: string } | null;
  discardWorkout: () => void;
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

      startWorkout: (name?: string) => {
        set({
          workoutId: uuidv4(),
          workoutName: name || `Workout ${new Date().toLocaleDateString()}`,
          startTime: new Date().toISOString(),
          exercises: [],
          isActive: true,
          previousPerformance: {},
        });
      },

      addExercise: (exercise) => {
        const state = get();
        const newExercise: WorkoutExercise = {
          exerciseId: exercise.id,
          exerciseName: exercise.name,
          sets: [
            {
              id: uuidv4(),
              exerciseId: exercise.id,
              setNumber: 1,
              weight: null,
              reps: null,
              isWarmup: false,
              isCompleted: false,
              timestamp: null,
            },
          ],
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

      addSet: (exerciseIndex) => {
        const state = get();
        const exercises = [...state.exercises];
        const exercise = { ...exercises[exerciseIndex] };
        const lastSet = exercise.sets[exercise.sets.length - 1];
        const prev = state.previousPerformance[exercise.exerciseId];
        const nextSetNum = exercise.sets.length + 1;

        const prefillWeight = lastSet?.weight ?? prev?.[exercise.sets.length]?.weight ?? null;
        const prefillReps = lastSet?.reps ?? prev?.[exercise.sets.length]?.reps ?? null;

        exercise.sets = [
          ...exercise.sets,
          {
            id: uuidv4(),
            exerciseId: exercise.exerciseId,
            setNumber: nextSetNum,
            weight: prefillWeight,
            reps: prefillReps,
            isWarmup: false,
            isCompleted: false,
            timestamp: null,
          },
        ];
        exercises[exerciseIndex] = exercise;
        set({ exercises });
      },

      updateSet: (exerciseIndex, setIndex, data) => {
        const state = get();
        const exercises = [...state.exercises];
        const exercise = { ...exercises[exerciseIndex] };
        const sets = [...exercise.sets];
        sets[setIndex] = { ...sets[setIndex], ...data };
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
        };

        set({
          workoutId: null,
          workoutName: '',
          startTime: null,
          exercises: [],
          isActive: false,
          previousPerformance: {},
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
        });
      },
    }),
    {
      name: 'active-workout',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
