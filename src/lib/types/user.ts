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

export interface TrainerProfile {
  experienceLevel: string;
  trainingFrequency: string;
  sessionDuration: string;
  goals: string[];
  gymAccess: string;
  availableEquipment: string[];
  favoriteExercises: string[];
  dislikedOrAvoidedExercises: string[];
  additionalNotes: string;
  createdAt: string;
  updatedAt: string;
}
