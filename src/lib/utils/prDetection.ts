import type { ActiveSet, PerformanceSet, WorkoutExercise } from '@/stores/activeWorkoutStore';
import { isAssistanceExerciseName } from '@/lib/utils/exerciseSemantics';

export interface PRDetectionResult {
  metric: 'weight' | 'reps';
  previousValue: number;
  newValue: number;
  direction: 'higher' | 'lower';
}

export function detectPRs(
  completedSet: ActiveSet,
  exercise: WorkoutExercise,
  previousPerformance: PerformanceSet[],
): PRDetectionResult[] {
  // Skip cardio exercises (no weight/reps comparison)
  if (exercise.exerciseCategory === 'cardio') return [];

  // Skip warmup sets
  if (completedSet.isWarmup) return [];

  // Skip first-time exercises (no previous data to compare against)
  if (!previousPerformance || previousPerformance.length === 0) return [];
  const isAssistanceExercise = isAssistanceExerciseName(exercise.exerciseName);

  let currentWeight = completedSet.weight || 0;
  let currentReps = completedSet.reps || 0;

  if (exercise.logMode === 'split_lr') {
    const sides = [
      { weight: completedSet.leftWeight || 0, reps: completedSet.leftReps || 0 },
      { weight: completedSet.rightWeight || 0, reps: completedSet.rightReps || 0 },
    ].filter((side) => side.weight > 0 || side.reps > 0);

    if (sides.length > 0) {
      sides.sort((a, b) => {
        if (b.weight !== a.weight) return b.weight - a.weight;
        return b.reps - a.reps;
      });
      currentWeight = sides[0].weight;
      currentReps = sides[0].reps;
    }
  }

  // Skip sets with no meaningful data
  if (currentWeight === 0 && currentReps === 0) return [];

  const results: PRDetectionResult[] = [];

  if (!isAssistanceExercise) {
    const prevBestWeight = Math.max(...previousPerformance.map((s) => s.weight));

    // Weight PR: current weight exceeds all previous weights.
    if (currentWeight > prevBestWeight && prevBestWeight > 0) {
      results.push({
        metric: 'weight',
        previousValue: prevBestWeight,
        newValue: currentWeight,
        direction: 'higher',
      });
      return results; // Weight PR takes priority — skip reps check.
    }

    // Reps PR: at same or higher weight, more reps than previous best at that weight.
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
            direction: 'higher',
          });
        }
      }
    }
  } else {
    const previousAssistValues = previousPerformance
      .map((s) => s.weight)
      .filter((weight) => weight > 0);
    if (previousAssistValues.length === 0) return [];

    const prevLowestAssist = Math.min(...previousAssistValues);

    // Assistance PR: lower assistance means harder work.
    if (currentWeight > 0 && currentWeight < prevLowestAssist) {
      results.push({
        metric: 'weight',
        previousValue: prevLowestAssist,
        newValue: currentWeight,
        direction: 'lower',
      });
      return results; // Assistance PR takes priority — skip reps check.
    }

    // Reps PR on assisted movements: at same assistance, more reps.
    const prevRepsAtAssist = previousPerformance
      .filter((s) => s.weight === currentWeight)
      .map((s) => s.reps);

    if (prevRepsAtAssist.length > 0) {
      const prevBestRepsAtAssist = Math.max(...prevRepsAtAssist);
      if (currentReps > prevBestRepsAtAssist && prevBestRepsAtAssist > 0) {
        results.push({
          metric: 'reps',
          previousValue: prevBestRepsAtAssist,
          newValue: currentReps,
          direction: 'higher',
        });
      }
    }
  }

  return results;
}
