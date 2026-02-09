export interface WorkoutTemplate {
  id: string;
  userId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  exercises?: TemplateExercise[];
}

export interface TemplateExercise {
  id: string;
  templateId: string;
  exerciseId: string;
  orderIndex: number;
  defaultSets: number;
  createdAt: string;
  exerciseName?: string;
}
