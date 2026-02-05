export interface WorkoutSet {
  id: string;
  workoutId: string;
  exerciseId: string;
  setNumber: number;
  weight: number | null;
  reps: number | null;
  time: number | null;
  distance: number | null;
  rpe: number | null;
  notes: string | null;
  isWarmup: boolean;
  isCompleted: boolean;
  timestamp: string;
}
