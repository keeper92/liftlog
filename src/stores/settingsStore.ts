'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { UnitSystem } from '@/lib/types/user';

interface SettingsState {
  unitSystem: UnitSystem;
  defaultRestTimer: number;
  autoStartRestTimer: boolean;

  setUnitSystem: (unit: UnitSystem) => void;
  setDefaultRestTimer: (seconds: number) => void;
  setAutoStartRestTimer: (enabled: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      unitSystem: 'metric',
      defaultRestTimer: 90,
      autoStartRestTimer: true,

      setUnitSystem: (unitSystem) => set({ unitSystem }),
      setDefaultRestTimer: (defaultRestTimer) => set({ defaultRestTimer }),
      setAutoStartRestTimer: (autoStartRestTimer) => set({ autoStartRestTimer }),
    }),
    {
      name: 'settings',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
