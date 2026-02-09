import { NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const DEMO_EMAIL = 'demo@rep.app';
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
  // Get some exercise IDs
  const { data: exercises } = await supabase
    .from('exercises')
    .select('id, name')
    .in('name', [
      'Barbell Bench Press',
      'Barbell Squat',
      'Barbell Deadlift',
      'Dumbbell Shoulder Press',
      'Barbell Row',
      'Pull Up',
      'Dumbbell Bicep Curl',
      'Tricep Dip',
      'Leg Press',
      'Dumbbell Lunges',
    ]);

  if (!exercises || exercises.length === 0) return;

  const exerciseMap = new Map(exercises.map((e) => [e.name, e.id]));

  // Create workouts over the past 4 weeks
  const workouts = [
    { name: 'Upper Body', daysAgo: 1, exercises: ['Barbell Bench Press', 'Barbell Row', 'Dumbbell Shoulder Press', 'Dumbbell Bicep Curl'] },
    { name: 'Lower Body', daysAgo: 3, exercises: ['Barbell Squat', 'Barbell Deadlift', 'Leg Press', 'Dumbbell Lunges'] },
    { name: 'Upper Body', daysAgo: 5, exercises: ['Barbell Bench Press', 'Barbell Row', 'Dumbbell Shoulder Press', 'Tricep Dip'] },
    { name: 'Lower Body', daysAgo: 7, exercises: ['Barbell Squat', 'Barbell Deadlift', 'Leg Press'] },
    { name: 'Upper Body', daysAgo: 9, exercises: ['Barbell Bench Press', 'Pull Up', 'Dumbbell Shoulder Press', 'Dumbbell Bicep Curl'] },
    { name: 'Lower Body', daysAgo: 11, exercises: ['Barbell Squat', 'Barbell Deadlift', 'Dumbbell Lunges'] },
    { name: 'Upper Body', daysAgo: 14, exercises: ['Barbell Bench Press', 'Barbell Row', 'Dumbbell Shoulder Press'] },
    { name: 'Lower Body', daysAgo: 17, exercises: ['Barbell Squat', 'Barbell Deadlift', 'Leg Press'] },
    { name: 'Upper Body', daysAgo: 20, exercises: ['Barbell Bench Press', 'Pull Up', 'Dumbbell Bicep Curl'] },
    { name: 'Lower Body', daysAgo: 23, exercises: ['Barbell Squat', 'Barbell Deadlift'] },
    { name: 'Upper Body', daysAgo: 26, exercises: ['Barbell Bench Press', 'Barbell Row'] },
    { name: 'Lower Body', daysAgo: 28, exercises: ['Barbell Squat', 'Leg Press'] },
  ];

  // Weights stored directly in lbs (standard plate configurations)
  const weightProgression: Record<string, number[]> = {
    'Barbell Bench Press': [125, 130, 135, 140],
    'Barbell Squat': [175, 185, 195, 200],
    'Barbell Deadlift': [215, 225, 235, 245],
    'Dumbbell Shoulder Press': [25, 30, 30, 35],
    'Barbell Row': [115, 125, 130, 135],
    'Pull Up': [0, 0, 0, 0],
    'Dumbbell Bicep Curl': [20, 25, 25, 30],
    'Tricep Dip': [0, 0, 0, 0],
    'Leg Press': [300, 350, 375, 400],
    'Dumbbell Lunges': [25, 30, 35, 40],
  };

  for (const workout of workouts) {
    const date = new Date();
    date.setDate(date.getDate() - workout.daysAgo);
    date.setHours(9 + Math.floor(Math.random() * 4), Math.floor(Math.random() * 60));

    const endTime = new Date(date);
    endTime.setMinutes(endTime.getMinutes() + 45 + Math.floor(Math.random() * 30));

    const { data: workoutData } = await supabase
      .from('workouts')
      .insert({
        user_id: userId,
        name: workout.name,
        date: date.toISOString(),
        start_time: date.toISOString(),
        end_time: endTime.toISOString(),
      })
      .select()
      .single();

    if (!workoutData) continue;

    // Determine progression index based on how old the workout is (0 = oldest, 3 = newest)
    const progressIndex = Math.min(3, Math.floor((28 - workout.daysAgo) / 7));

    // Add sets for each exercise
    const sets = [];
    for (const exerciseName of workout.exercises) {
      const exerciseId = exerciseMap.get(exerciseName);
      if (!exerciseId) continue;

      const weights = weightProgression[exerciseName] || [20, 20, 20, 20];
      const weight = weights[progressIndex];

      for (let setNum = 1; setNum <= 3; setNum++) {
        sets.push({
          workout_id: workoutData.id,
          exercise_id: exerciseId,
          set_number: setNum,
          weight: weight > 0 ? weight : null,
          reps: 8 + Math.floor(Math.random() * 5), // 8-12 reps
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
