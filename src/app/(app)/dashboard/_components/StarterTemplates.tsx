'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useActiveWorkoutStore } from '@/stores/activeWorkoutStore';
import { PRELOADED_TEMPLATES } from '@/lib/constants/preloadedTemplates';
import Card from '@/components/ui/Card';
import Modal from '@/components/ui/Modal';

interface ResolvedExercise {
  id: string;
  name: string;
  category: string;
  defaultSets: number;
}

interface ResolvedTemplate {
  id: string;
  name: string;
  exercises: ResolvedExercise[];
}

export default function StarterTemplates() {
  const router = useRouter();
  const supabase = createClient();
  const { startWorkout, addExerciseWithSets } = useActiveWorkoutStore();

  const [resolvedTemplates, setResolvedTemplates] = useState<ResolvedTemplate[]>([]);
  const [generatedExercises, setGeneratedExercises] = useState<ResolvedExercise[] | null>(null);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [loading, setLoading] = useState(true);

  // Resolve exercise IDs for pre-loaded templates on mount
  useEffect(() => {
    async function resolveExercises() {
      const allNames = PRELOADED_TEMPLATES.flatMap((t) => t.exercises.map((e) => e.name));
      const uniqueNames = [...new Set(allNames)];

      const { data } = await supabase
        .from('exercises')
        .select('id, name, category')
        .in('name', uniqueNames);

      if (!data) {
        setLoading(false);
        return;
      }

      const nameToExercise = new Map(data.map((e) => [e.name, { id: e.id, category: e.category }]));

      const resolved = PRELOADED_TEMPLATES.map((template) => ({
        id: template.id,
        name: template.name,
        exercises: template.exercises
          .map((ex) => {
            const found = nameToExercise.get(ex.name);
            return {
              id: found?.id || '',
              name: ex.name,
              category: found?.category || 'other',
              defaultSets: ex.defaultSets,
            };
          })
          .filter((ex) => ex.id),
      }));

      setResolvedTemplates(resolved);
      setLoading(false);
    }
    resolveExercises();
  }, [supabase]);

  function handleStartFromTemplate(template: ResolvedTemplate) {
    startWorkout(template.name);
    for (const ex of template.exercises) {
      addExerciseWithSets({ id: ex.id, name: ex.name, category: ex.category }, ex.defaultSets);
    }
    const state = useActiveWorkoutStore.getState();
    router.push(`/workout/${state.workoutId}`);
  }

  async function handleGenerateTemplate() {
    setGenerating(true);
    setShowGenerateModal(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setGenerating(false);
      return;
    }

    // Query sets with exercise info, filtered by user's workouts
    const { data } = await supabase
      .from('sets')
      .select('exercise_id, exercises(id, name, category), workouts!inner(user_id)')
      .eq('workouts.user_id', user.id);

    if (!data || data.length === 0) {
      setGeneratedExercises([]);
      setGenerating(false);
      return;
    }

    // Count exercise frequencies
    const frequency = new Map<string, { id: string; name: string; category: string; count: number }>();
    for (const row of data) {
      const exerciseId = row.exercise_id;
      // exercises is returned as a single object (not array) due to FK relationship
      const exercise = row.exercises as unknown as { id: string; name: string; category: string } | null;
      if (!exercise) continue;

      const existing = frequency.get(exerciseId);
      if (existing) {
        existing.count++;
      } else {
        frequency.set(exerciseId, { id: exerciseId, name: exercise.name, category: exercise.category, count: 1 });
      }
    }

    // Sort by frequency and take top 5
    const sorted = Array.from(frequency.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const generated = sorted.map((ex) => ({
      id: ex.id,
      name: ex.name,
      category: ex.category,
      defaultSets: 3,
    }));

    setGeneratedExercises(generated);
    setGenerating(false);
  }

  function handleStartGeneratedWorkout() {
    if (!generatedExercises || generatedExercises.length === 0) return;

    startWorkout('Generated Workout');
    for (const ex of generatedExercises) {
      addExerciseWithSets({ id: ex.id, name: ex.name, category: ex.category }, ex.defaultSets);
    }
    setShowGenerateModal(false);
    const state = useActiveWorkoutStore.getState();
    router.push(`/workout/${state.workoutId}`);
  }

  if (loading) return null;

  return (
    <div className="mt-6">
      <h2 className="mb-4 text-sm font-medium text-muted-foreground">
        Starter Templates
      </h2>
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-5 px-5 scrollbar-hide">
        {resolvedTemplates.map((template) => (
          <Card
            key={template.id}
            onClick={() => handleStartFromTemplate(template)}
            className="shrink-0 w-36"
          >
            <p className="font-medium text-sm">{template.name}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {template.exercises.length} exercises
            </p>
          </Card>
        ))}

        <Card onClick={handleGenerateTemplate} className="shrink-0 w-36">
          <div className="flex items-center gap-1.5">
            <svg
              className="w-4 h-4 text-primary"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
              />
            </svg>
            <p className="font-medium text-sm">Generate</p>
          </div>
          <p className="text-xs text-muted-foreground mt-1">From your history</p>
        </Card>
      </div>

      <Modal
        isOpen={showGenerateModal}
        onClose={() => setShowGenerateModal(false)}
        title="Generated Workout"
        actions={
          generatedExercises && generatedExercises.length > 0
            ? [
                {
                  label: 'Cancel',
                  onClick: () => setShowGenerateModal(false),
                  variant: 'outline',
                },
                {
                  label: 'Start Workout',
                  onClick: handleStartGeneratedWorkout,
                  variant: 'primary',
                },
              ]
            : [
                {
                  label: 'Close',
                  onClick: () => setShowGenerateModal(false),
                  variant: 'outline',
                },
              ]
        }
      >
        {generating ? (
          <p>Analyzing your workout history...</p>
        ) : generatedExercises && generatedExercises.length > 0 ? (
          <div>
            <p className="mb-3">Based on your most frequently used exercises:</p>
            <ul className="space-y-2">
              {generatedExercises.map((ex) => (
                <li key={ex.id} className="text-sm">
                  {ex.name} <span className="text-muted-foreground">({ex.defaultSets} sets)</span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p>No workout history found. Complete some workouts first!</p>
        )}
      </Modal>
    </div>
  );
}
