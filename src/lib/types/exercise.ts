import type { ExerciseCategory } from '@/lib/constants/exerciseCategories';
import type { MuscleGroup } from '@/lib/constants/muscleGroups';

export interface Exercise {
  id: string;
  name: string;
  category: ExerciseCategory;
  primaryMuscles: MuscleGroup[];
  secondaryMuscles: MuscleGroup[];
  equipment: string | null;
  force: string | null;
  level: string | null;
  mechanic: string | null;
  instructions: string[];
  mediaUrl: string | null;
  isCustom: boolean;
  userId: string | null;
  createdAt: string;
}

/** Lightweight row type matching Supabase select queries */
export interface ExerciseRow {
  id: string;
  name: string;
  category: string;
  primary_muscles: string[];
  equipment: string | null;
  is_custom?: boolean;
  user_id?: string | null;
}

/** Display names for cardio exercises (cleaner than DB names) */
export const CARDIO_DISPLAY_NAMES: Record<string, string> = {
  'Jogging, Treadmill': 'Treadmill',
  'Bicycling, Stationary': 'Stationary Bike',
  'Rowing, Stationary': 'Rowing Machine',
};
