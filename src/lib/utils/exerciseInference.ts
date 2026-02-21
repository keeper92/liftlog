import type { ExerciseCategory } from '@/lib/constants/exerciseCategories';
import type { MuscleGroup } from '@/lib/constants/muscleGroups';

export function inferExerciseCategoryFromName(name: string): ExerciseCategory {
  const lower = name.toLowerCase();
  if (/run|jog|sprint|treadmill|bike|cycling|rowing|rower|erg|elliptical|stair|cardio|walk/.test(lower)) return 'cardio';
  if (/machine|leg press|assisted|hack squat|smith|selectorized|plate loaded|nautilus/.test(lower)) return 'machine';
  if (/cable|pulldown|pushdown|rope|crossover|pulley/.test(lower)) return 'cable';
  if (/dumbbell|\bdb\b/.test(lower)) return 'dumbbell';
  if (/barbell|\bbb\b|ez[-\s]?bar|bench press|deadlift|squat|clean|snatch|jerk|overhead press|thruster|landmine/.test(lower)) return 'barbell';
  if (/push-?up|pull-?up|chin-?up|dip|plank|sit-?up|crunch|burpee|bodyweight/.test(lower)) return 'bodyweight';
  if (/plyo|jump|box jump|medicine ball throw/.test(lower)) return 'plyometrics';
  if (/kettlebell|\bkb\b|farmer'?s walk|yoke|atlas stone/.test(lower)) return 'strongman';
  return 'other';
}

export function inferPrimaryMuscleFromName(name: string): MuscleGroup {
  const lower = name.toLowerCase();
  if (/bicep|curl/.test(lower)) return 'biceps';
  if (/tricep|pushdown|skull crusher|triceps extension|overhead extension|pressdown|tricep kickback/.test(lower)) return 'triceps';
  if (/calf/.test(lower)) return 'calves';
  if (/adductor/.test(lower)) return 'adductors';
  if (/abductor/.test(lower)) return 'abductors';
  if (/hamstring|leg curl|rdl|romanian deadlift|stiff[-\s]?leg/.test(lower)) return 'hamstrings';
  if (/glute|hip thrust|kickback|bridge/.test(lower)) return 'glutes';
  if (/quad|leg extension|leg press|squat|lunge|split squat|step[-\s]?up/.test(lower)) return 'quadriceps';
  if (/shoulder|lateral raise|front raise|rear delt|upright row|overhead press|arnold press|face pull|delt/.test(lower)) return 'shoulders';
  if (/lat|pulldown|pull-?up|chin-?up|straight arm pulldown/.test(lower)) return 'lats';
  if (/\brow\b|deadlift|back extension|good morning|mid back|upper back/.test(lower)) return 'back';
  if (/trap|shrug/.test(lower)) return 'traps';
  if (/forearm|wrist curl|reverse curl/.test(lower)) return 'forearms';
  if (/neck/.test(lower)) return 'neck';
  if (/lower back|back extension|good morning/.test(lower)) return 'lower_back';
  if (/oblique|side bend|russian twist|woodchop/.test(lower)) return 'obliques';
  if (/ab|core|crunch|sit-?up|plank|hanging leg raise|toes to bar/.test(lower)) return 'abdominals';
  if (/chest|bench|press|fly|pec|push-?up/.test(lower)) return 'chest';
  return 'chest';
}

export function inferEquipmentFromCategory(category: string): string | null {
  if (category === 'other') return null;
  if (category === 'cardio') return 'machine';
  if (category === 'bodyweight') return 'bodyweight';
  return category;
}
