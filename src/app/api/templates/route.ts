import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { matchExercises } from '@/lib/utils/exerciseMatcher';

interface TemplateExerciseInput {
  name: string;
  defaultSets: number;
}

interface CreateTemplateRequest {
  name: string;
  exercises: TemplateExerciseInput[];
}

export async function POST(request: Request) {
  const supabase = await createClient();

  // Check authentication
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json() as CreateTemplateRequest;

  if (!body.name || !body.exercises || body.exercises.length === 0) {
    return NextResponse.json({ error: 'Name and exercises are required' }, { status: 400 });
  }

  // Resolve exercise names to IDs using fuzzy matching
  const exerciseNames = body.exercises.map(e => e.name);
  const matches = await matchExercises(supabase, exerciseNames);

  // Build the exercise ID map with confidence threshold
  const resolvedExercises: { exerciseId: string; name: string; defaultSets: number; orderIndex: number }[] = [];
  const unmatched: string[] = [];

  for (let i = 0; i < body.exercises.length; i++) {
    const match = matches[i];
    if (match.matchedExercise && match.confidence >= 0.3) {
      resolvedExercises.push({
        exerciseId: match.matchedExercise.id,
        name: match.matchedExercise.name,
        defaultSets: body.exercises[i].defaultSets,
        orderIndex: i,
      });
    } else {
      unmatched.push(body.exercises[i].name);
    }
  }

  if (resolvedExercises.length === 0) {
    return NextResponse.json({
      error: 'No exercises could be matched',
      unmatched,
    }, { status: 400 });
  }

  // Create the template
  const { data: template, error: templateError } = await supabase
    .from('workout_templates')
    .insert({ user_id: user.id, name: body.name })
    .select()
    .single();

  if (templateError || !template) {
    console.error('Failed to create template:', templateError);
    return NextResponse.json({ error: 'Failed to create template' }, { status: 500 });
  }

  // Bulk insert template exercises
  const templateExercises = resolvedExercises.map(e => ({
    template_id: template.id,
    exercise_id: e.exerciseId,
    order_index: e.orderIndex,
    default_sets: e.defaultSets,
  }));

  const { error: exercisesError } = await supabase
    .from('template_exercises')
    .insert(templateExercises);

  if (exercisesError) {
    console.error('Failed to insert template exercises:', exercisesError);
    // Clean up the template since exercises failed
    await supabase.from('workout_templates').delete().eq('id', template.id);
    return NextResponse.json({ error: 'Failed to save template exercises' }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    templateId: template.id,
    name: body.name,
    exerciseCount: resolvedExercises.length,
    unmatched: unmatched.length > 0 ? unmatched : undefined,
  });
}
