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
