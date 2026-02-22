'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { WorkoutUploadSnapshot } from '@/lib/sync/workoutUpload';

export interface WorkoutOutboxItem {
  workoutId: string;
  payload: WorkoutUploadSnapshot;
  createdAt: string;
  attempts: number;
  lastError: string | null;
  syncing: boolean;
}

interface WorkoutOutboxState {
  items: WorkoutOutboxItem[];
  enqueue: (payload: WorkoutUploadSnapshot, lastError?: string) => void;
  markSyncing: (workoutId: string) => void;
  markFailed: (workoutId: string, error: string) => void;
  markSynced: (workoutId: string) => void;
  clear: () => void;
}

export const useWorkoutOutboxStore = create<WorkoutOutboxState>()(
  persist(
    (set, get) => ({
      items: [],

      enqueue: (payload, lastError) => {
        const existing = get().items.find((item) => item.workoutId === payload.workoutId);
        if (existing) {
          set({
            items: get().items.map((item) =>
              item.workoutId === payload.workoutId
                ? {
                    ...item,
                    payload,
                    lastError: lastError ?? item.lastError,
                    syncing: false,
                  }
                : item,
            ),
          });
          return;
        }

        set({
          items: [
            ...get().items,
            {
              workoutId: payload.workoutId,
              payload,
              createdAt: new Date().toISOString(),
              attempts: 0,
              lastError: lastError ?? null,
              syncing: false,
            },
          ],
        });
      },

      markSyncing: (workoutId) => {
        set({
          items: get().items.map((item) =>
            item.workoutId === workoutId
              ? { ...item, syncing: true }
              : item,
          ),
        });
      },

      markFailed: (workoutId, error) => {
        set({
          items: get().items.map((item) =>
            item.workoutId === workoutId
              ? {
                  ...item,
                  syncing: false,
                  attempts: item.attempts + 1,
                  lastError: error,
                }
              : item,
          ),
        });
      },

      markSynced: (workoutId) => {
        set({
          items: get().items.filter((item) => item.workoutId !== workoutId),
        });
      },

      clear: () => set({ items: [] }),
    }),
    {
      name: 'workout-outbox',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

