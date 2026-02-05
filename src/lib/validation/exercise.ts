import { z } from 'zod';
import { EXERCISE_CATEGORIES } from '@/lib/constants/exerciseCategories';
import { MUSCLE_GROUPS } from '@/lib/constants/muscleGroups';

export const createExerciseSchema = z.object({
  name: z.string().min(1).max(200),
  category: z.enum(EXERCISE_CATEGORIES),
  primaryMuscles: z.array(z.enum(MUSCLE_GROUPS)).min(1),
  secondaryMuscles: z.array(z.enum(MUSCLE_GROUPS)).default([]),
  equipment: z.string().max(100).optional(),
  instructions: z.array(z.string()).default([]),
});

export const exerciseQuerySchema = z.object({
  q: z.string().optional(),
  category: z.enum(EXERCISE_CATEGORIES).optional(),
  muscle: z.enum(MUSCLE_GROUPS).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type CreateExerciseInput = z.infer<typeof createExerciseSchema>;
export type ExerciseQuery = z.infer<typeof exerciseQuerySchema>;
