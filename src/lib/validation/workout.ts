import { z } from 'zod';

export const createWorkoutSchema = z.object({
  name: z.string().max(200).optional(),
  date: z.string().datetime(),
  startTime: z.string().datetime(),
  notes: z.string().max(2000).optional(),
});

export const updateWorkoutSchema = z.object({
  name: z.string().max(200).optional(),
  endTime: z.string().datetime().optional(),
  notes: z.string().max(2000).optional(),
});

export const createSetSchema = z.object({
  exerciseId: z.string().uuid(),
  setNumber: z.number().int().positive(),
  weight: z.number().min(0).optional(),
  reps: z.number().int().min(0).optional(),
  time: z.number().int().min(0).optional(),
  distance: z.number().min(0).optional(),
  rpe: z.number().min(1).max(10).optional(),
  notes: z.string().max(500).optional(),
  isWarmup: z.boolean().default(false),
  isCompleted: z.boolean().default(true),
});

export const updateSetSchema = z.object({
  weight: z.number().min(0).optional(),
  reps: z.number().int().min(0).optional(),
  time: z.number().int().min(0).optional(),
  distance: z.number().min(0).optional(),
  rpe: z.number().min(1).max(10).optional(),
  notes: z.string().max(500).optional(),
  isWarmup: z.boolean().optional(),
  isCompleted: z.boolean().optional(),
  setNumber: z.number().int().positive().optional(),
});

export type CreateWorkoutInput = z.infer<typeof createWorkoutSchema>;
export type UpdateWorkoutInput = z.infer<typeof updateWorkoutSchema>;
export type CreateSetInput = z.infer<typeof createSetSchema>;
export type UpdateSetInput = z.infer<typeof updateSetSchema>;
