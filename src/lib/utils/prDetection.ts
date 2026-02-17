import type { ActiveSet, WorkoutExercise } from '@/stores/activeWorkoutStore';

export interface PRDetectionResult {
  metric: 'weight' | 'reps';
  previousValue: number;
  newValue: number;
}

export function detectPRs(
  completedSet: ActiveSet,
  exercise: WorkoutExercise,
  previousPerformance: { weight: number; reps: number }[],
): PRDetectionResult[] {
  // Skip cardio exercises (no weight/reps comparison)
  if (exercise.exerciseCategory === 'cardio') return [];

  // Skip warmup sets
  if (completedSet.isWarmup) return [];

  // Skip first-time exercises (no previous data to compare against)
  if (!previousPerformance || previousPerformance.length === 0) return [];

  const currentWeight = completedSet.weight || 0;
  const currentReps = completedSet.reps || 0;

  // Skip sets with no meaningful data
  if (currentWeight === 0 && currentReps === 0) return [];

  // Find previous best weight across all previous sets
  const prevBestWeight = Math.max(...previousPerformance.map((s) => s.weight));

  const results: PRDetectionResult[] = [];

  // Weight PR: current weight exceeds all previous weights
  if (currentWeight > prevBestWeight && prevBestWeight > 0) {
    results.push({
      metric: 'weight',
      previousValue: prevBestWeight,
      newValue: currentWeight,
    });
    return results; // Weight PR takes priority — skip reps check
  }

  // Reps PR: at same or higher weight, more reps than previous best at that weight
  if (currentWeight >= prevBestWeight && currentWeight > 0) {
    const prevRepsAtWeight = previousPerformance
      .filter((s) => s.weight === currentWeight)
      .map((s) => s.reps);

    if (prevRepsAtWeight.length > 0) {
      const prevBestRepsAtWeight = Math.max(...prevRepsAtWeight);
      if (currentReps > prevBestRepsAtWeight && prevBestRepsAtWeight > 0) {
        results.push({
          metric: 'reps',
          previousValue: prevBestRepsAtWeight,
          newValue: currentReps,
        });
      }
    }
  }

  return results;
}
