export const MUSCLE_GROUPS = [
  'chest',
  'back',
  'shoulders',
  'biceps',
  'triceps',
  'forearms',
  'quadriceps',
  'hamstrings',
  'glutes',
  'calves',
  'abdominals',
  'obliques',
  'lower_back',
  'traps',
  'lats',
  'adductors',
  'abductors',
  'neck',
] as const;

export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];
