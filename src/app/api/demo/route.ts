import { NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const DEMO_EMAIL = 'demo@reps.app';
const DEMO_PASSWORD = 'demo123456';

export async function POST() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Check if demo user exists
  const { data: existingUsers } = await supabase.auth.admin.listUsers();
  const demoUser = existingUsers?.users?.find((u) => u.email === DEMO_EMAIL);

  let userId: string;

  if (demoUser) {
    // Delete existing demo user to get fresh seed data
    await supabase.auth.admin.deleteUser(demoUser.id);
  }

  {
    // Create demo user
    const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
      email_confirm: true,
    });

    if (createError || !newUser.user) {
      return NextResponse.json({ error: 'Failed to create demo user' }, { status: 500 });
    }

    userId = newUser.user.id;

    // Set demo user to imperial units
    await supabase
      .from('profiles')
      .update({ unit_system: 'imperial' })
      .eq('id', userId);

    // Seed demo data
    await seedDemoData(supabase, userId);
  }

  return NextResponse.json({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
  });
}

async function seedDemoData(supabase: SupabaseClient, userId: string) {
  // All exercises used across Push/Pull/Legs workouts
  const exerciseNames = [
    // Push
    'Barbell Bench Press - Medium Grip',
    'Incline Dumbbell Press',
    'Standing Military Press',
    'Side Lateral Raise',
    'Triceps Pushdown',
    'EZ-Bar Skullcrusher',
    'Dumbbell Flyes',
    'Cable Crossover',
    'Dips - Triceps Version',
    // Pull
    'Barbell Deadlift',
    'Bent Over Barbell Row',
    'Pullups',
    'Seated Cable Rows',
    'Face Pull',
    'Barbell Curl',
    'Hammer Curls',
    'Barbell Shrug',
    // Legs
    'Barbell Full Squat',
    'Romanian Deadlift',
    'Leg Press',
    'Lying Leg Curls',
    'Leg Extensions',
    'Standing Calf Raises',
    'Barbell Lunge',
    'Barbell Hip Thrust',
  ];

  const { data: exercises } = await supabase
    .from('exercises')
    .select('id, name')
    .in('name', exerciseNames);

  if (!exercises || exercises.length === 0) return;

  const exerciseMap = new Map(exercises.map((e) => [e.name, e.id]));

  // Workout templates for Push/Pull/Legs rotation
  type WorkoutTemplate = {
    name: string;
    exercises: { name: string; sets: number; repRange: [number, number] }[];
  };

  const pushDay: WorkoutTemplate = {
    name: 'Push',
    exercises: [
      { name: 'Barbell Bench Press - Medium Grip', sets: 4, repRange: [6, 10] },
      { name: 'Incline Dumbbell Press', sets: 3, repRange: [8, 12] },
      { name: 'Standing Military Press', sets: 3, repRange: [6, 10] },
      { name: 'Side Lateral Raise', sets: 3, repRange: [10, 15] },
      { name: 'Triceps Pushdown', sets: 3, repRange: [10, 15] },
      { name: 'EZ-Bar Skullcrusher', sets: 3, repRange: [8, 12] },
    ],
  };

  const pullDay: WorkoutTemplate = {
    name: 'Pull',
    exercises: [
      { name: 'Barbell Deadlift', sets: 3, repRange: [3, 6] },
      { name: 'Bent Over Barbell Row', sets: 4, repRange: [6, 10] },
      { name: 'Pullups', sets: 3, repRange: [5, 12] },
      { name: 'Seated Cable Rows', sets: 3, repRange: [8, 12] },
      { name: 'Face Pull', sets: 3, repRange: [12, 18] },
      { name: 'Barbell Curl', sets: 3, repRange: [8, 12] },
      { name: 'Hammer Curls', sets: 3, repRange: [8, 12] },
    ],
  };

  const legsDay: WorkoutTemplate = {
    name: 'Legs',
    exercises: [
      { name: 'Barbell Full Squat', sets: 4, repRange: [5, 8] },
      { name: 'Romanian Deadlift', sets: 3, repRange: [8, 12] },
      { name: 'Leg Press', sets: 3, repRange: [8, 12] },
      { name: 'Lying Leg Curls', sets: 3, repRange: [10, 15] },
      { name: 'Leg Extensions', sets: 3, repRange: [10, 15] },
      { name: 'Standing Calf Raises', sets: 4, repRange: [12, 18] },
    ],
  };

  // Alternate push/pull variants for variety
  const pushDayB: WorkoutTemplate = {
    name: 'Push',
    exercises: [
      { name: 'Standing Military Press', sets: 4, repRange: [5, 8] },
      { name: 'Barbell Bench Press - Medium Grip', sets: 3, repRange: [8, 12] },
      { name: 'Dumbbell Flyes', sets: 3, repRange: [10, 15] },
      { name: 'Side Lateral Raise', sets: 3, repRange: [10, 15] },
      { name: 'Cable Crossover', sets: 3, repRange: [10, 15] },
      { name: 'Dips - Triceps Version', sets: 3, repRange: [6, 12] },
    ],
  };

  const pullDayB: WorkoutTemplate = {
    name: 'Pull',
    exercises: [
      { name: 'Bent Over Barbell Row', sets: 4, repRange: [5, 8] },
      { name: 'Pullups', sets: 4, repRange: [5, 12] },
      { name: 'Seated Cable Rows', sets: 3, repRange: [8, 12] },
      { name: 'Face Pull', sets: 3, repRange: [12, 18] },
      { name: 'Barbell Shrug', sets: 3, repRange: [8, 12] },
      { name: 'Barbell Curl', sets: 3, repRange: [8, 12] },
      { name: 'Hammer Curls', sets: 3, repRange: [8, 12] },
    ],
  };

  const legsDayB: WorkoutTemplate = {
    name: 'Legs',
    exercises: [
      { name: 'Barbell Full Squat', sets: 4, repRange: [5, 8] },
      { name: 'Barbell Hip Thrust', sets: 3, repRange: [8, 12] },
      { name: 'Barbell Lunge', sets: 3, repRange: [8, 12] },
      { name: 'Lying Leg Curls', sets: 3, repRange: [10, 15] },
      { name: 'Leg Extensions', sets: 3, repRange: [10, 15] },
      { name: 'Standing Calf Raises', sets: 4, repRange: [12, 18] },
    ],
  };

  // 6-week rotation: Push A, Pull A, Legs A, Push B, Pull B, Legs B (repeating)
  const rotation: WorkoutTemplate[] = [
    pushDay, pullDay, legsDay, pushDayB, pullDayB, legsDayB,
  ];

  // Starting weights (lbs) - realistic intermediate lifter
  const startingWeights: Record<string, number> = {
    'Barbell Bench Press - Medium Grip': 135,
    'Incline Dumbbell Press': 45,
    'Standing Military Press': 95,
    'Side Lateral Raise': 15,
    'Triceps Pushdown': 50,
    'EZ-Bar Skullcrusher': 55,
    'Dumbbell Flyes': 30,
    'Cable Crossover': 25,
    'Dips - Triceps Version': 0,
    'Barbell Deadlift': 225,
    'Bent Over Barbell Row': 135,
    'Pullups': 0,
    'Seated Cable Rows': 120,
    'Face Pull': 40,
    'Barbell Curl': 65,
    'Hammer Curls': 30,
    'Barbell Shrug': 155,
    'Barbell Full Squat': 185,
    'Romanian Deadlift': 155,
    'Leg Press': 270,
    'Lying Leg Curls': 80,
    'Leg Extensions': 90,
    'Standing Calf Raises': 135,
    'Barbell Lunge': 95,
    'Barbell Hip Thrust': 135,
  };

  // Weight gained over 6 months (lbs) - realistic progression
  const weightGain6mo: Record<string, number> = {
    'Barbell Bench Press - Medium Grip': 30,
    'Incline Dumbbell Press': 15,
    'Standing Military Press': 20,
    'Side Lateral Raise': 5,
    'Triceps Pushdown': 15,
    'EZ-Bar Skullcrusher': 15,
    'Dumbbell Flyes': 10,
    'Cable Crossover': 10,
    'Dips - Triceps Version': 0,
    'Barbell Deadlift': 50,
    'Bent Over Barbell Row': 25,
    'Pullups': 0,
    'Seated Cable Rows': 20,
    'Face Pull': 10,
    'Barbell Curl': 15,
    'Hammer Curls': 10,
    'Barbell Shrug': 30,
    'Barbell Full Squat': 40,
    'Romanian Deadlift': 30,
    'Leg Press': 90,
    'Lying Leg Curls': 15,
    'Leg Extensions': 20,
    'Standing Calf Raises': 25,
    'Barbell Lunge': 20,
    'Barbell Hip Thrust': 40,
  };

  // Seeded RNG for reproducible "random" variation
  let rngState = 42;
  function seededRandom(): number {
    rngState = (rngState * 1664525 + 1013904223) & 0x7fffffff;
    return rngState / 0x7fffffff;
  }

  // Generate 6 months of workouts, 3 per week
  // Work backwards from today, placing workouts on Mon/Wed/Fri pattern
  const totalWeeks = 26;
  const totalDays = totalWeeks * 7;

  interface PlannedWorkout {
    daysAgo: number;
    template: WorkoutTemplate;
  }

  const plannedWorkouts: PlannedWorkout[] = [];
  let rotationIndex = 0;

  for (let day = totalDays; day >= 0; day--) {
    const date = new Date();
    date.setDate(date.getDate() - day);
    const dayOfWeek = date.getDay(); // 0=Sun, 1=Mon, ...

    // Workout on Mon (1), Wed (3), Fri (5)
    if (dayOfWeek === 1 || dayOfWeek === 3 || dayOfWeek === 5) {
      // ~10% chance of a missed workout for realism
      if (seededRandom() < 0.1) {
        rotationIndex++;
        continue;
      }

      const template = rotation[rotationIndex % rotation.length];
      rotationIndex++;
      plannedWorkouts.push({ daysAgo: day, template });
    }
  }

  // Insert workouts in batches for performance
  for (const planned of plannedWorkouts) {
    const { daysAgo, template } = planned;
    const progress = 1 - daysAgo / totalDays; // 0 = oldest, 1 = newest

    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    // Workout between 6-10am with some variation
    const hour = 6 + Math.floor(seededRandom() * 5);
    const minute = Math.floor(seededRandom() * 60);
    date.setHours(hour, minute, 0, 0);

    const endTime = new Date(date);
    endTime.setMinutes(endTime.getMinutes() + 50 + Math.floor(seededRandom() * 30));

    const { data: workoutData } = await supabase
      .from('workouts')
      .insert({
        user_id: userId,
        name: template.name,
        date: date.toISOString(),
        start_time: date.toISOString(),
        end_time: endTime.toISOString(),
      })
      .select()
      .single();

    if (!workoutData) continue;

    const sets = [];
    for (const ex of template.exercises) {
      const exerciseId = exerciseMap.get(ex.name);
      if (!exerciseId) continue;

      const start = startingWeights[ex.name] ?? 20;
      const gain = weightGain6mo[ex.name] ?? 0;
      // Non-linear progression (faster early, slower later)
      const baseWeight = start + gain * (1 - Math.pow(1 - progress, 1.3));
      // Round to nearest 5 for barbell/machine, nearest 2.5 for dumbbells/cables
      const roundTo = ex.name.includes('Dumbbell') || ex.name.includes('Cable') ||
        ex.name.includes('Lateral') || ex.name.includes('Hammer') ||
        ex.name.includes('Face Pull')
        ? 2.5
        : 5;
      const weight = Math.round(baseWeight / roundTo) * roundTo;

      for (let setNum = 1; setNum <= ex.sets; setNum++) {
        // Last set(s) might have slightly fewer reps (fatigue)
        const fatigueDropoff = setNum > 2 ? Math.floor(seededRandom() * 2) : 0;
        const [minRep, maxRep] = ex.repRange;
        const reps = Math.max(
          minRep,
          minRep + Math.floor(seededRandom() * (maxRep - minRep + 1)) - fatigueDropoff,
        );

        sets.push({
          workout_id: workoutData.id,
          exercise_id: exerciseId,
          set_number: setNum,
          weight: weight > 0 ? weight : null,
          reps,
          is_warmup: false,
          is_completed: true,
        });
      }
    }

    if (sets.length > 0) {
      await supabase.from('sets').insert(sets);
    }
  }
}
