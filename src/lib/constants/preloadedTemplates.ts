export interface PreloadedTemplate {
  id: string;
  name: string;
  exercises: { name: string; defaultSets: number }[];
}

export const PRELOADED_TEMPLATES: PreloadedTemplate[] = [
  {
    id: 'starter-upper',
    name: 'Upper Body',
    exercises: [
      { name: 'Dumbbell Bench Press', defaultSets: 3 },
      { name: 'Dumbbell Shoulder Press', defaultSets: 3 },
      { name: 'Dumbbell Bicep Curl', defaultSets: 3 },
      { name: 'Standing Dumbbell Triceps Extension', defaultSets: 3 },
    ],
  },
  {
    id: 'starter-lower',
    name: 'Lower Body',
    exercises: [
      { name: 'Barbell Squat', defaultSets: 3 },
      { name: 'Barbell Deadlift', defaultSets: 3 },
      { name: 'Dumbbell Lunges', defaultSets: 3 },
      { name: 'Seated Leg Curl', defaultSets: 3 },
      { name: 'Leg Extensions', defaultSets: 3 },
    ],
  },
];
