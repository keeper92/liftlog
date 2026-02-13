'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { TrainerProfile } from '@/lib/types/user';

interface TrainerProfileState {
  profile: TrainerProfile | null;
  setProfile: (profile: TrainerProfile) => void;
  clearProfile: () => void;
}

export const useTrainerProfileStore = create<TrainerProfileState>()(
  persist(
    (set) => ({
      profile: null,
      setProfile: (profile) => set({ profile }),
      clearProfile: () => set({ profile: null }),
    }),
    {
      name: 'trainer-profile',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
