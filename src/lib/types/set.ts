export interface WorkoutSet {
  id: string;
  workoutId: string;
  exerciseId: string;
  setNumber: number;
  weight: number | null;
  reps: number | null;
  leftWeight: number | null;
  leftReps: number | null;
  rightWeight: number | null;
  rightReps: number | null;
  isSplitLr: boolean;
  time: number | null;
  distance: number | null;
  rpe: number | null;
  notes: string | null;
  isWarmup: boolean;
  isCompleted: boolean;
  timestamp: string;
}
