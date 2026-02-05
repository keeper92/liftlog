import type { WorkoutSet } from './set';

export interface Workout {
  id: string;
  userId: string;
  name: string | null;
  date: string;
  startTime: string;
  endTime: string | null;
  notes: string | null;
  templateId: string | null;
  programId: string | null;
  createdAt: string;
  updatedAt: string;
  sets?: WorkoutSet[];
}

export interface WorkoutSummary {
  id: string;
  name: string | null;
  date: string;
  durationMinutes: number | null;
  exerciseCount: number;
  totalSets: number;
  totalVolume: number;
}
