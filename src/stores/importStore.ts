'use client';

import { create } from 'zustand';

export interface ParsedSet {
  weight: number | null;
  reps: number | null;
  time: number | null;
  distance: number | null;
  isWarmup?: boolean;
}

export interface ParsedExercise {
  name: string;
  exerciseId?: string;
  matchedName?: string;
  confidence?: number;
  sets: ParsedSet[];
}

export interface ParsedWorkout {
  date: string;
  name?: string;
  exercises: ParsedExercise[];
}

export type ImportStep =
  | 'idle'
  | 'parsing'
  | 'reviewing'
  | 'confirming'
  | 'importing'
  | 'complete'
  | 'error';

interface ImportState {
  // Pending import data
  pendingWorkouts: ParsedWorkout[];

  // State
  step: ImportStep;
  error: string | null;

  // Actions
  setWorkouts: (workouts: ParsedWorkout[]) => void;
  updateExerciseMatch: (
    workoutIndex: number,
    exerciseIndex: number,
    exerciseId: string,
    matchedName: string
  ) => void;
  setStep: (step: ImportStep) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

export const useImportStore = create<ImportState>()((set) => ({
  pendingWorkouts: [],
  step: 'idle',
  error: null,

  setWorkouts: (pendingWorkouts) =>
    set({ pendingWorkouts, step: 'reviewing', error: null }),

  updateExerciseMatch: (workoutIndex, exerciseIndex, exerciseId, matchedName) =>
    set((state) => {
      const workouts = [...state.pendingWorkouts];
      if (workouts[workoutIndex]?.exercises[exerciseIndex]) {
        workouts[workoutIndex].exercises[exerciseIndex] = {
          ...workouts[workoutIndex].exercises[exerciseIndex],
          exerciseId,
          matchedName,
          confidence: 1.0,
        };
      }
      return { pendingWorkouts: workouts };
    }),

  setStep: (step) => set({ step }),

  setError: (error) => set({ error, step: error ? 'error' : 'idle' }),

  reset: () =>
    set({
      pendingWorkouts: [],
      step: 'idle',
      error: null,
    }),
}));
