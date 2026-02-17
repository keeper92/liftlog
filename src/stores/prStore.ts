'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';

export interface PRRecord {
  id: string;
  exerciseId: string;
  exerciseName: string;
  metric: 'weight' | 'reps';
  previousValue: number;
  newValue: number;
  date: string;
  workoutId: string;
}

interface PRState {
  records: PRRecord[];
  unreadCount: number;
  firedNotifications: Record<string, boolean>;

  addPR: (pr: Omit<PRRecord, 'id'>) => void;
  markAllRead: () => void;
  hasFired: (workoutId: string, exerciseId: string, metric: 'weight' | 'reps') => boolean;
  markFired: (workoutId: string, exerciseId: string, metric: 'weight' | 'reps') => void;
  clearFiredNotifications: () => void;
}

export const usePRStore = create<PRState>()(
  persist(
    (set, get) => ({
      records: [],
      unreadCount: 0,
      firedNotifications: {},

      addPR: (pr) => {
        set({
          records: [{ ...pr, id: uuidv4() }, ...get().records],
          unreadCount: get().unreadCount + 1,
        });
      },

      markAllRead: () => set({ unreadCount: 0 }),

      hasFired: (workoutId, exerciseId, metric) => {
        return !!get().firedNotifications[`${workoutId}:${exerciseId}:${metric}`];
      },

      markFired: (workoutId, exerciseId, metric) => {
        set({
          firedNotifications: {
            ...get().firedNotifications,
            [`${workoutId}:${exerciseId}:${metric}`]: true,
          },
        });
      },

      clearFiredNotifications: () => set({ firedNotifications: {} }),
    }),
    {
      name: 'pr-records',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
