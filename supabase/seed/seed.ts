import { createClient } from '@supabase/supabase-js';
import { v5 as uuidv5 } from 'uuid';
import rawExercises from './exercises-raw.json';

const NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

const categoryMap: Record<string, string> = {
  strength: 'barbell',
  stretching: 'stretching',
  plyometrics: 'plyometrics',
  strongman: 'strongman',
  powerlifting: 'barbell',
  cardio: 'cardio',
  'olympic weightlifting': 'olympic_weightlifting',
};

const equipmentToCategoryMap: Record<string, string> = {
  barbell: 'barbell',
  dumbbell: 'dumbbell',
  machine: 'machine',
  cable: 'cable',
  'body only': 'bodyweight',
  kettlebells: 'barbell',
  'e-z curl bar': 'barbell',
  bands: 'other',
  'medicine ball': 'other',
  'exercise ball': 'other',
  'foam roll': 'other',
  other: 'other',
};

const equipmentMap: Record<string, string> = {
  barbell: 'barbell',
  dumbbell: 'dumbbell',
  machine: 'machine',
  cable: 'cable',
  'body only': 'bodyweight',
  kettlebells: 'kettlebell',
  'e-z curl bar': 'e-z_curl_bar',
  bands: 'band',
  'medicine ball': 'medicine_ball',
  'exercise ball': 'exercise_ball',
  'foam roll': 'foam_roll',
  other: 'other',
};

const muscleMap: Record<string, string> = {
  abdominals: 'abdominals',
  hamstrings: 'hamstrings',
  adductors: 'adductors',
  quadriceps: 'quadriceps',
  biceps: 'biceps',
  shoulders: 'shoulders',
  chest: 'chest',
  'middle back': 'back',
  calves: 'calves',
  glutes: 'glutes',
  'lower back': 'lower_back',
  lats: 'lats',
  triceps: 'triceps',
  traps: 'traps',
  forearms: 'forearms',
  neck: 'neck',
  abductors: 'abductors',
};

interface RawExercise {
  id: string;
  name: string;
  force: string | null;
  level: string;
  mechanic: string | null;
  equipment: string | null;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  instructions: string[];
  category: string;
  images: string[];
}

function transformExercise(raw: RawExercise) {
  const equipment = raw.equipment ? equipmentMap[raw.equipment] || 'other' : null;

  let category: string;
  if (
    (raw.category === 'strength' || raw.category === 'powerlifting') &&
    raw.equipment &&
    equipmentToCategoryMap[raw.equipment]
  ) {
    category = equipmentToCategoryMap[raw.equipment];
  } else {
    category = categoryMap[raw.category] || 'other';
  }

  return {
    id: uuidv5(raw.name, NAMESPACE),
    name: raw.name,
    category,
    primary_muscles: raw.primaryMuscles.map((m) => muscleMap[m] || m),
    secondary_muscles: raw.secondaryMuscles.map((m) => muscleMap[m] || m),
    equipment,
    force: raw.force,
    level: raw.level,
    mechanic: raw.mechanic,
    instructions: raw.instructions,
    media_url: null,
    is_custom: false,
    user_id: null,
  };
}

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

async function seed() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
    console.error('Set them in .env.local or pass as environment variables');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const transformed = (rawExercises as RawExercise[]).map(transformExercise);
  console.log(`Seeding ${transformed.length} exercises...`);

  const batches = chunk(transformed, 50);
  for (let i = 0; i < batches.length; i++) {
    const { error } = await supabase
      .from('exercises')
      .upsert(batches[i], { onConflict: 'id' });

    if (error) {
      console.error(`Batch ${i + 1} failed:`, error);
      process.exit(1);
    }
    process.stdout.write(`\r  Batch ${i + 1}/${batches.length}`);
  }

  console.log('\nSeed complete.');
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
