export type UnitSystem = 'metric' | 'imperial';

export interface User {
  id: string;
  email: string;
  unitSystem: UnitSystem;
  preferences: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface UserPreferences {
  defaultRestTimer?: number;
  autoStartRestTimer?: boolean;
  showWarmupSets?: boolean;
}
