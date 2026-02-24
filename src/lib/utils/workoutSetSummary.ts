import type { UnitSystem } from '@/lib/types/user';
import { formatDuration, toDisplayWeight, weightUnit } from '@/lib/utils/units';

export interface WorkoutSetSummaryInput {
  exerciseId: string;
  exerciseName: string;
  setNumber: number | null;
  weight?: number | null;
  reps?: number | null;
  isSplitLR?: boolean | null;
  leftWeight?: number | null;
  leftReps?: number | null;
  rightWeight?: number | null;
  rightReps?: number | null;
  time?: number | null;
}

export interface ExerciseSetSummary {
  name: string;
  sets: Array<{
    setNumber: number | null;
    detail: string;
  }>;
}

function hasNumber(value: number | null | undefined): value is number {
  return value !== null && value !== undefined;
}

function formatSetDetail(set: WorkoutSetSummaryInput, unitSystem: UnitSystem): string {
  const unit = weightUnit(unitSystem);

  if (set.isSplitLR) {
    const leftWeight = hasNumber(set.leftWeight) ? `${toDisplayWeight(set.leftWeight, unitSystem)} ${unit}` : 'BW';
    const rightWeight = hasNumber(set.rightWeight) ? `${toDisplayWeight(set.rightWeight, unitSystem)} ${unit}` : 'BW';
    const leftReps = set.leftReps ?? '-';
    const rightReps = set.rightReps ?? '-';
    return `L ${leftWeight} × ${leftReps} / R ${rightWeight} × ${rightReps}`;
  }

  if (hasNumber(set.time) && !hasNumber(set.weight) && !hasNumber(set.reps)) {
    return formatDuration(set.time);
  }

  if (hasNumber(set.weight) && hasNumber(set.reps)) {
    return `${toDisplayWeight(set.weight, unitSystem)} ${unit} × ${set.reps}`;
  }

  if (hasNumber(set.weight) && !hasNumber(set.reps)) {
    return `${toDisplayWeight(set.weight, unitSystem)} ${unit}`;
  }

  if (!hasNumber(set.weight) && hasNumber(set.reps)) {
    return `BW × ${set.reps}`;
  }

  return '-';
}

export function buildExerciseSetSummaries(
  sets: WorkoutSetSummaryInput[],
  unitSystem: UnitSystem,
): ExerciseSetSummary[] {
  const grouped = new Map<string, ExerciseSetSummary>();

  for (const set of sets) {
    const fallbackName = set.exerciseName.trim() || 'Exercise';
    const key = set.exerciseId || `exercise:${fallbackName}`;
    if (!grouped.has(key)) {
      grouped.set(key, { name: fallbackName, sets: [] });
    }

    grouped.get(key)!.sets.push({
      setNumber: set.setNumber ?? null,
      detail: formatSetDetail(set, unitSystem),
    });
  }

  return Array.from(grouped.values()).map((exercise) => ({
    ...exercise,
    sets: [...exercise.sets].sort((a, b) => {
      if (a.setNumber === null && b.setNumber === null) return 0;
      if (a.setNumber === null) return 1;
      if (b.setNumber === null) return -1;
      return a.setNumber - b.setNumber;
    }),
  }));
}
