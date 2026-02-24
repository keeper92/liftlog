'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { isMissingSplitSetColumnsError } from '@/lib/supabase/schemaCompat';
import { useSettingsStore } from '@/stores/settingsStore';
import { formatDuration, toDisplayWeight, weightUnit } from '@/lib/utils/units';
import { isAssistanceExerciseName } from '@/lib/utils/exerciseSemantics';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';

interface WorkoutData {
  id: string;
  name: string | null;
  start_time: string;
  end_time: string | null;
  sets: {
    exercise_id: string;
    weight: number | null;
    reps: number | null;
    left_weight: number | null;
    left_reps: number | null;
    right_weight: number | null;
    right_reps: number | null;
    is_split_lr: boolean;
    set_number: number;
    is_warmup: boolean;
    exercises: { name: string };
  }[];
}

interface LegacyWorkoutData {
  id: string;
  name: string | null;
  start_time: string;
  end_time: string | null;
  sets: {
    exercise_id: string;
    weight: number | null;
    reps: number | null;
    set_number: number;
    is_warmup: boolean;
    exercises: { name: string } | Array<{ name: string }> | null;
  }[];
}

function getComparableSet(set: WorkoutData['sets'][number]): { weight: number; reps: number } {
  if (!set.is_split_lr) {
    return {
      weight: set.weight || 0,
      reps: set.reps || 0,
    };
  }

  const left = { weight: set.left_weight || 0, reps: set.left_reps || 0 };
  const right = { weight: set.right_weight || 0, reps: set.right_reps || 0 };

  if (left.weight > right.weight) return left;
  if (right.weight > left.weight) return right;
  return {
    weight: left.weight || right.weight,
    reps: Math.max(left.reps, right.reps),
  };
}

function pickBestSet(
  sets: Array<{ weight: number; reps: number }>,
  isAssistanceExercise: boolean,
): { weight: number; reps: number } {
  let best: { weight: number; reps: number } | null = null;

  for (const set of sets) {
    if (set.weight <= 0 && set.reps <= 0) continue;
    if (!best) {
      best = set;
      continue;
    }

    const isBetter = isAssistanceExercise
      ? set.weight < best.weight || (set.weight === best.weight && set.reps > best.reps)
      : set.weight > best.weight || (set.weight === best.weight && set.reps > best.reps);

    if (isBetter) best = set;
  }

  return best ?? { weight: 0, reps: 0 };
}

function normalizeLegacyWorkoutData(data: LegacyWorkoutData): WorkoutData {
  return {
    ...data,
    sets: data.sets.map((set) => {
      const exerciseRef = Array.isArray(set.exercises) ? set.exercises[0] : set.exercises;
      return {
        exercise_id: set.exercise_id,
        weight: set.weight,
        reps: set.reps,
        set_number: set.set_number,
        is_warmup: set.is_warmup,
        exercises: { name: exerciseRef?.name || 'Exercise' },
        left_weight: null,
        left_reps: null,
        right_weight: null,
        right_reps: null,
        is_split_lr: false,
      };
    }),
  };
}

export default function WorkoutSummaryPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-dvh text-muted-foreground">Loading...</div>}>
      <WorkoutSummaryContent />
    </Suspense>
  );
}

function WorkoutSummaryContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const templateId = searchParams.get('templateId');
  const supabase = useMemo(() => createClient(), []);
  const unitSystem = useSettingsStore((s) => s.unitSystem);
  const [workout, setWorkout] = useState<WorkoutData | null>(null);
  const [saving, setSaving] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [savedTemplateName, setSavedTemplateName] = useState<string | null>(null);
  const [trainingNotes, setTrainingNotes] = useState<string | null>(null);
  const [loadingNotes, setLoadingNotes] = useState(false);

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from('workouts')
        .select('id, name, start_time, end_time, sets(exercise_id, weight, reps, left_weight, left_reps, right_weight, right_reps, is_split_lr, set_number, is_warmup, exercises(name))')
        .eq('id', params.id as string)
        .single();
      if (data && !error) {
        setWorkout(data as unknown as WorkoutData);
        return;
      }

      if (!isMissingSplitSetColumnsError(error)) return;

      const { data: legacyData, error: legacyError } = await supabase
        .from('workouts')
        .select('id, name, start_time, end_time, sets(exercise_id, weight, reps, set_number, is_warmup, exercises(name))')
        .eq('id', params.id as string)
        .single();

      if (legacyData && !legacyError) {
        setWorkout(normalizeLegacyWorkoutData(legacyData as unknown as LegacyWorkoutData));
      }
    }
    load();
  }, [params.id, supabase]);

  // Generate AI training notes
  useEffect(() => {
    if (!workout) return;
    const workoutData = workout; // Capture for async closure

    async function generateNotes() {
      setLoadingNotes(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoadingNotes(false);
        return;
      }

      // Get unique exercise IDs from this workout
      const exerciseIds = [...new Set(workoutData.sets.map((s) => s.exercise_id))];

      // Fetch previous performance for each exercise (excluding this workout)
      const comparisons: {
        exerciseName: string;
        isAssistanceExercise: boolean;
        currentBest: { weight: number; reps: number };
        previousBest: { weight: number; reps: number } | null;
      }[] = [];

      for (const exId of exerciseIds) {
        const exerciseSets = workoutData.sets.filter((s) => s.exercise_id === exId && !s.is_warmup);
        if (exerciseSets.length === 0) continue;

        const exerciseName = exerciseSets[0].exercises.name;
        const isAssistanceExercise = isAssistanceExerciseName(exerciseName);

        // Find best set in current workout.
        const currentBest = pickBestSet(
          exerciseSets.map((s) => getComparableSet(s)),
          isAssistanceExercise,
        );

        // Fetch previous best for this exercise
        let prevQuery = supabase
          .from('sets')
          .select('weight, reps, workouts!inner(id, user_id)')
          .eq('exercise_id', exId)
          .eq('workouts.user_id', user.id)
          .neq('workouts.id', workoutData.id)
          .eq('is_warmup', false)
          .eq('is_completed', true);

        prevQuery = prevQuery.order('weight', { ascending: isAssistanceExercise }).limit(30);
        const { data: prevData } = await prevQuery;

        let previousBest: { weight: number; reps: number } | null = null;
        if (prevData && prevData.length > 0) {
          previousBest = pickBestSet(
            prevData.map((s) => ({
              weight: s.weight || 0,
              reps: s.reps || 0,
            })),
            isAssistanceExercise,
          );
        }

        comparisons.push({ exerciseName, isAssistanceExercise, currentBest, previousBest });
      }

      // Build context for AI
      const unit = unitSystem === 'imperial' ? 'lbs' : 'kg';
      const comparisonText = comparisons.map((c) => {
        const current = c.isAssistanceExercise
          ? `${toDisplayWeight(c.currentBest.weight, unitSystem)}${unit} assist x ${c.currentBest.reps}`
          : `${toDisplayWeight(c.currentBest.weight, unitSystem)}${unit} x ${c.currentBest.reps}`;
        if (c.previousBest) {
          const prev = c.isAssistanceExercise
            ? `${toDisplayWeight(c.previousBest.weight, unitSystem)}${unit} assist x ${c.previousBest.reps}`
            : `${toDisplayWeight(c.previousBest.weight, unitSystem)}${unit} x ${c.previousBest.reps}`;
          const weightDiff = c.currentBest.weight - c.previousBest.weight;
          const repsDiff = c.currentBest.reps - c.previousBest.reps;
          if (c.isAssistanceExercise) {
            const assistDelta = c.previousBest.weight - c.currentBest.weight;
            return `${c.exerciseName}: Today ${current}, Previous best ${prev} (${assistDelta >= 0 ? '-' : '+'}${toDisplayWeight(Math.abs(assistDelta), unitSystem)}${unit} assistance, ${repsDiff >= 0 ? '+' : ''}${repsDiff} reps)`;
          }
          return `${c.exerciseName}: Today ${current}, Previous best ${prev} (${weightDiff >= 0 ? '+' : ''}${toDisplayWeight(weightDiff, unitSystem)}${unit}, ${repsDiff >= 0 ? '+' : ''}${repsDiff} reps)`;
        }
        return `${c.exerciseName}: Today ${current} (first time!)`;
      }).join('\n');

      // Call AI to generate notes
      try {
        const response = await fetch('/api/training-notes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workoutName: workoutData.name || 'Workout',
            exerciseCount: exerciseIds.length,
            totalSets: workoutData.sets.filter((s) => !s.is_warmup).length,
            comparisons: comparisonText,
            unitSystem,
          }),
        });

        if (response.ok) {
          const reader = response.body?.getReader();
          const decoder = new TextDecoder();
          let notes = '';

          if (reader) {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              notes += decoder.decode(value, { stream: true });
              setTrainingNotes(notes);
            }
          }
        }
      } catch (err) {
        console.error('Failed to generate training notes:', err);
      }

      setLoadingNotes(false);
    }

    generateNotes();
  }, [workout, unitSystem, supabase]);

  async function handleSaveTemplate() {
    if (!workout) return;
    setSaving(true);

    const name = workout.name || 'My Template';

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setSaving(false);
      return;
    }

    const { data: template, error: tErr } = await supabase
      .from('workout_templates')
      .insert({ user_id: user.id, name })
      .select()
      .single();

    if (tErr || !template) {
      setSaving(false);
      return;
    }

    // Get unique exercises in order of first appearance
    const exerciseOrder: string[] = [];
    for (const s of workout.sets) {
      if (!exerciseOrder.includes(s.exercise_id)) {
        exerciseOrder.push(s.exercise_id);
      }
    }

    const templateExercises = exerciseOrder.map((exId, idx) => ({
      template_id: template.id,
      exercise_id: exId,
      order_index: idx,
      default_sets: workout.sets.filter((s) => s.exercise_id === exId && !s.is_warmup).length || 3,
    }));

    await supabase.from('template_exercises').insert(templateExercises);

    setSaving(false);
    setSavedTemplateName(name);
  }

  async function handleUpdateTemplate() {
    if (!workout || !templateId) return;
    setSaving(true);

    // Delete existing template exercises
    await supabase
      .from('template_exercises')
      .delete()
      .eq('template_id', templateId);

    // Get unique exercises in order of first appearance
    const exerciseOrder: string[] = [];
    for (const s of workout.sets) {
      if (!exerciseOrder.includes(s.exercise_id)) {
        exerciseOrder.push(s.exercise_id);
      }
    }

    // Insert new template exercises
    const templateExercises = exerciseOrder.map((exId, idx) => ({
      template_id: templateId,
      exercise_id: exId,
      order_index: idx,
      default_sets: workout.sets.filter((s) => s.exercise_id === exId && !s.is_warmup).length || 3,
    }));

    await supabase.from('template_exercises').insert(templateExercises);

    // Update template updated_at
    await supabase
      .from('workout_templates')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', templateId);

    setSaving(false);
    router.push('/dashboard');
  }

  async function handleDiscardWorkout() {
    if (!workout) return;
    if (!window.confirm('Discard this workout? It will be permanently deleted.')) return;

    setDiscarding(true);
    // Delete sets first (foreign key), then the workout
    await supabase.from('sets').delete().eq('workout_id', workout.id);
    await supabase.from('workouts').delete().eq('id', workout.id);
    router.push('/dashboard');
  }

  if (!workout) {
    return <div className="flex items-center justify-center min-h-dvh text-muted-foreground">Loading...</div>;
  }

  const duration = workout.end_time
    ? Math.floor((new Date(workout.end_time).getTime() - new Date(workout.start_time).getTime()) / 1000)
    : 0;
  const exerciseMap = new Map<string, { name: string; sets: typeof workout.sets }>();
  for (const s of workout.sets) {
    const existing = exerciseMap.get(s.exercise_id) || { name: s.exercises.name, sets: [] };
    existing.sets.push(s);
    exerciseMap.set(s.exercise_id, existing);
  }
  const totalVolume = workout.sets.reduce((sum, s) => {
    if (s.is_split_lr) {
      return sum + ((s.left_weight || 0) * (s.left_reps || 0)) + ((s.right_weight || 0) * (s.right_reps || 0));
    }
    return sum + ((s.weight || 0) * (s.reps || 0));
  }, 0);
  const unit = weightUnit(unitSystem);

  return (
    <div className="px-4 pt-8 pb-20">
      <div className="text-center mb-8">
        <div className="w-16 h-16 rounded-full bg-success/20 flex items-center justify-center mx-auto mb-4">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-success" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold">Workout Complete!</h1>
        <p className="text-muted-foreground mt-1">{workout.name || 'Workout'}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-8">
        <Card className="text-center">
          <p className="text-xl font-bold">{formatDuration(duration)}</p>
          <p className="text-xs text-muted-foreground mt-1">Duration</p>
        </Card>
        <Card className="text-center">
          <p className="text-xl font-bold">{exerciseMap.size}</p>
          <p className="text-xs text-muted-foreground mt-1">Exercises</p>
        </Card>
        <Card className="text-center">
          <p className="text-xl font-bold">{workout.sets.length}</p>
          <p className="text-xs text-muted-foreground mt-1">Sets</p>
        </Card>
        <Card className="text-center">
          <p className="text-xl font-bold">{toDisplayWeight(totalVolume, unitSystem).toLocaleString()}</p>
          <p className="text-xs text-muted-foreground mt-1">{unit} Volume</p>
        </Card>
      </div>

      {/* Training Notes */}
      <div className="mb-8">
        <h2 className="mb-4 text-sm font-medium text-muted-foreground">Training Notes</h2>
        <Card>
          {loadingNotes ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <span className="inline-flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-text-muted animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-text-muted animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-text-muted animate-bounce" style={{ animationDelay: '300ms' }} />
              </span>
              <span className="text-sm">Analyzing your workout...</span>
            </div>
          ) : trainingNotes ? (
            <p className="text-sm text-muted-foreground whitespace-pre-line">{trainingNotes}</p>
          ) : (
            <p className="text-sm text-muted-foreground">No training notes available.</p>
          )}
        </Card>
      </div>

      <h2 className="mb-4 text-sm font-medium text-muted-foreground">Exercises</h2>
      <div className="space-y-3 mb-8">
        {Array.from(exerciseMap.entries()).map(([exId, { name, sets }]) => (
          <Card key={exId}>
            <p className="font-medium mb-2">{name}</p>
            <div className="space-y-1">
              {sets
                .sort((a, b) => a.set_number - b.set_number)
                .map((s, i) => (
                  <p key={i} className="text-sm text-muted-foreground">
                    {s.is_warmup ? 'Warmup' : `Set ${s.set_number}`}:{' '}
                    {s.is_split_lr ? (
                      <>
                        L {s.left_weight ? `${toDisplayWeight(s.left_weight, unitSystem)} ${unit}` : '-'} x {s.left_reps || '-'}
                        {' '}|{' '}
                        R {s.right_weight ? `${toDisplayWeight(s.right_weight, unitSystem)} ${unit}` : '-'} x {s.right_reps || '-'}
                      </>
                    ) : (
                      <>
                        {s.weight ? `${toDisplayWeight(s.weight, unitSystem)} ${unit}` : '-'} x {s.reps || '-'} reps
                      </>
                    )}
                  </p>
                ))}
            </div>
          </Card>
        ))}
      </div>

      {templateId && (
        <Button
          variant="outline"
          fullWidth
          className="mb-3"
          onClick={handleUpdateTemplate}
          loading={saving}
        >
          Update Template
        </Button>
      )}

      {savedTemplateName ? (
        <div className="mb-3 flex items-center justify-center gap-2 py-3 rounded-xl bg-success/10 text-success text-sm font-medium">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Saved as &ldquo;{savedTemplateName}&rdquo;
        </div>
      ) : (
        <Button
          variant="outline"
          fullWidth
          className="mb-3"
          onClick={handleSaveTemplate}
          loading={saving}
        >
          Save as Template
        </Button>
      )}

      <Button variant="primary" fullWidth onClick={() => router.push('/dashboard')}>
        Done
      </Button>

      <Button variant="ghost"
        onClick={handleDiscardWorkout}
        disabled={discarding}
        className="w-full mt-4 mb-2 text-xs text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
      >
        {discarding ? 'Discarding...' : 'Discard Workout'}
      </Button>
    </div>
  );
}
