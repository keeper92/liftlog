export const EXERCISE_CATEGORIES = [
  'barbell',
  'dumbbell',
  'machine',
  'cable',
  'bodyweight',
  'cardio',
  'stretching',
  'plyometrics',
  'strongman',
  'olympic_weightlifting',
  'other',
] as const;

export type ExerciseCategory = (typeof EXERCISE_CATEGORIES)[number];
