export const EQUIPMENT_TYPES = [
  'barbell',
  'dumbbell',
  'kettlebell',
  'machine',
  'cable',
  'bodyweight',
  'band',
  'medicine_ball',
  'e-z_curl_bar',
  'exercise_ball',
  'foam_roll',
  'other',
  'none',
] as const;

export type EquipmentType = (typeof EQUIPMENT_TYPES)[number];
