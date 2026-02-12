'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useActiveWorkoutStore } from '@/stores/activeWorkoutStore';
import Card from '@/components/ui/Card';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';

interface GeneratedExercise {
  id: string;
  name: string;
  category: string;
  primaryMuscles: string[];
}

const BODY_PARTS = [
  { id: 'chest', label: 'Chest' },
  { id: 'back', label: 'Back' },
  { id: 'shoulders', label: 'Shoulders' },
  { id: 'biceps', label: 'Biceps' },
  { id: 'triceps', label: 'Triceps' },
  { id: 'quadriceps', label: 'Quads' },
  { id: 'hamstrings', label: 'Hamstrings' },
  { id: 'glutes', label: 'Glutes' },
  { id: 'calves', label: 'Calves' },
  { id: 'abdominals', label: 'Abs' },
] as const;

const EQUIPMENT_OPTIONS = [
  { id: 'free_weights', label: 'Free Weights', categories: ['barbell', 'dumbbell'] },
  { id: 'cable', label: 'Cable', categories: ['cable'] },
  { id: 'machine', label: 'Machines', categories: ['machine'] },
] as const;

type Step = 'closed' | 'body_parts' | 'equipment' | 'preview';

export default function WorkoutBuilder() {
  const router = useRouter();
  const supabase = createClient();
  const { startWorkout, addExerciseWithSets } = useActiveWorkoutStore();

  const [step, setStep] = useState<Step>('closed');
  const [selectedBodyParts, setSelectedBodyParts] = useState<string[]>([]);
  const [selectedEquipment, setSelectedEquipment] = useState<string[]>([]);
  const [exercises, setExercises] = useState<GeneratedExercise[]>([]);
  const [generating, setGenerating] = useState(false);
  const [replacingIndex, setReplacingIndex] = useState<number | null>(null);

  function toggleBodyPart(id: string) {
    setSelectedBodyParts((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  }

  function toggleEquipment(id: string) {
    setSelectedEquipment((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  }

  function handleOpenBuilder() {
    setStep('body_parts');
    setSelectedBodyParts([]);
    setSelectedEquipment([]);
    setExercises([]);
  }

  function handleClose() {
    setStep('closed');
    setSelectedBodyParts([]);
    setSelectedEquipment([]);
    setExercises([]);
    setReplacingIndex(null);
  }

  async function generateWorkout() {
    setGenerating(true);
    setStep('preview');

    // Get selected categories from equipment
    const categories = selectedEquipment.flatMap((eq) => {
      const option = EQUIPMENT_OPTIONS.find((o) => o.id === eq);
      return option?.categories || [];
    });

    // Query exercises matching criteria
    const { data } = await supabase
      .from('exercises')
      .select('id, name, category, primary_muscles')
      .in('category', categories)
      .overlaps('primary_muscles', selectedBodyParts);

    if (!data || data.length === 0) {
      setExercises([]);
      setGenerating(false);
      return;
    }

    // Pick 6 random exercises, prioritizing variety in muscle groups
    const selected = selectBalancedExercises(data, selectedBodyParts, 6);

    setExercises(
      selected.map((ex) => ({
        id: ex.id,
        name: ex.name,
        category: ex.category,
        primaryMuscles: ex.primary_muscles || [],
      }))
    );
    setGenerating(false);
  }

  function selectBalancedExercises(
    pool: { id: string; name: string; category: string; primary_muscles: string[] | null }[],
    targetMuscles: string[],
    count: number
  ) {
    const result: typeof pool = [];
    const usedIds = new Set<string>();
    const muscleCount = new Map<string, number>();

    // Initialize muscle counts
    targetMuscles.forEach((m) => muscleCount.set(m, 0));

    // Try to get at least one exercise per muscle group first
    for (const muscle of targetMuscles) {
      if (result.length >= count) break;

      const candidates = pool.filter(
        (ex) =>
          !usedIds.has(ex.id) &&
          ex.primary_muscles?.includes(muscle)
      );

      if (candidates.length > 0) {
        const picked = candidates[Math.floor(Math.random() * candidates.length)];
        result.push(picked);
        usedIds.add(picked.id);
        picked.primary_muscles?.forEach((m) => {
          muscleCount.set(m, (muscleCount.get(m) || 0) + 1);
        });
      }
    }

    // Fill remaining slots with least-covered muscles
    while (result.length < count) {
      const remaining = pool.filter((ex) => !usedIds.has(ex.id));
      if (remaining.length === 0) break;

      // Sort by targeting least-covered muscles
      remaining.sort((a, b) => {
        const aMinCoverage = Math.min(
          ...(a.primary_muscles || [])
            .filter((m) => targetMuscles.includes(m))
            .map((m) => muscleCount.get(m) || 0)
        );
        const bMinCoverage = Math.min(
          ...(b.primary_muscles || [])
            .filter((m) => targetMuscles.includes(m))
            .map((m) => muscleCount.get(m) || 0)
        );
        return (aMinCoverage || 0) - (bMinCoverage || 0);
      });

      const picked = remaining[0];
      result.push(picked);
      usedIds.add(picked.id);
      picked.primary_muscles?.forEach((m) => {
        muscleCount.set(m, (muscleCount.get(m) || 0) + 1);
      });
    }

    return result;
  }

  async function handleReplaceExercise(index: number) {
    setReplacingIndex(index);
    const exerciseToReplace = exercises[index];

    // Get selected categories from equipment
    const categories = selectedEquipment.flatMap((eq) => {
      const option = EQUIPMENT_OPTIONS.find((o) => o.id === eq);
      return option?.categories || [];
    });

    // Find similar exercises (same muscle group, same equipment types)
    const { data } = await supabase
      .from('exercises')
      .select('id, name, category, primary_muscles')
      .in('category', categories)
      .overlaps('primary_muscles', exerciseToReplace.primaryMuscles)
      .neq('id', exerciseToReplace.id)
      .limit(20);

    if (data && data.length > 0) {
      // Filter out already selected exercises
      const usedIds = new Set(exercises.map((e) => e.id));
      const candidates = data.filter((ex) => !usedIds.has(ex.id));

      if (candidates.length > 0) {
        const replacement = candidates[Math.floor(Math.random() * candidates.length)];
        const newExercises = [...exercises];
        newExercises[index] = {
          id: replacement.id,
          name: replacement.name,
          category: replacement.category,
          primaryMuscles: replacement.primary_muscles || [],
        };
        setExercises(newExercises);
      }
    }

    setReplacingIndex(null);
  }

  function handleStartWorkout() {
    if (exercises.length === 0) return;

    startWorkout('Custom Workout');
    for (const ex of exercises) {
      addExerciseWithSets({ id: ex.id, name: ex.name, category: ex.category }, 3);
    }
    handleClose();
    const state = useActiveWorkoutStore.getState();
    router.push(`/workout/${state.workoutId}`);
  }

  return (
    <>
      <Card onClick={handleOpenBuilder}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-primary">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </div>
          <div>
            <p className="font-semibold text-sm">Workout Builder</p>
            <p className="text-xs text-text-muted">Create a custom workout</p>
          </div>
        </div>
      </Card>

      {/* Body Parts Selection Modal */}
      <Modal
        isOpen={step === 'body_parts'}
        onClose={handleClose}
        title="Select Body Parts"
        actions={[
          { label: 'Cancel', onClick: handleClose, variant: 'ghost' },
          {
            label: 'Next',
            onClick: () => setStep('equipment'),
            variant: 'primary',
            disabled: selectedBodyParts.length === 0,
          },
        ]}
      >
        <p className="text-sm text-text-muted mb-4">
          Which muscle groups do you want to train?
        </p>
        <div className="flex flex-wrap gap-2">
          {BODY_PARTS.map((part) => (
            <button
              key={part.id}
              onClick={() => toggleBodyPart(part.id)}
              className={`px-3 py-2 rounded-full text-sm font-medium transition-colors ${
                selectedBodyParts.includes(part.id)
                  ? 'bg-primary text-white'
                  : 'bg-surface-light text-text-secondary hover:bg-surface-light/80'
              }`}
            >
              {part.label}
            </button>
          ))}
        </div>
      </Modal>

      {/* Equipment Selection Modal */}
      <Modal
        isOpen={step === 'equipment'}
        onClose={handleClose}
        title="Select Equipment"
        actions={[
          { label: 'Back', onClick: () => setStep('body_parts'), variant: 'ghost' },
          {
            label: 'Generate',
            onClick: generateWorkout,
            variant: 'primary',
            disabled: selectedEquipment.length === 0,
          },
        ]}
      >
        <p className="text-sm text-text-muted mb-4">
          What equipment do you have access to?
        </p>
        <div className="flex flex-wrap gap-2">
          {EQUIPMENT_OPTIONS.map((option) => (
            <button
              key={option.id}
              onClick={() => toggleEquipment(option.id)}
              className={`px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
                selectedEquipment.includes(option.id)
                  ? 'bg-primary text-white'
                  : 'bg-surface-light text-text-secondary hover:bg-surface-light/80'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </Modal>

      {/* Preview Modal */}
      <Modal
        isOpen={step === 'preview'}
        onClose={handleClose}
        title="Your Workout"
        actions={
          exercises.length > 0
            ? [
                { label: 'Cancel', onClick: handleClose, variant: 'ghost' },
                { label: 'Start Workout', onClick: handleStartWorkout, variant: 'primary' },
              ]
            : [{ label: 'Close', onClick: handleClose, variant: 'ghost' }]
        }
      >
        {generating ? (
          <div className="py-8 text-center">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-text-muted">Generating your workout...</p>
          </div>
        ) : exercises.length > 0 ? (
          <div className="space-y-2">
            {exercises.map((ex, idx) => (
              <div
                key={ex.id}
                className="flex items-center justify-between py-2 px-3 bg-surface-light rounded-lg"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{ex.name}</p>
                  <p className="text-xs text-text-muted">3 sets</p>
                </div>
                <button
                  onClick={() => handleReplaceExercise(idx)}
                  disabled={replacingIndex === idx}
                  className="ml-2 p-2 text-text-muted hover:text-primary transition-colors disabled:opacity-50"
                  title="Replace with similar exercise"
                >
                  {replacingIndex === idx ? (
                    <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 2v6h-6M3 12a9 9 0 0 1 15-6.7L21 8M3 22v-6h6M21 12a9 9 0 0 1-15 6.7L3 16" />
                    </svg>
                  )}
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-8 text-center">
            <p className="text-sm text-text-muted">
              No exercises found matching your criteria. Try selecting different options.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setStep('body_parts')}
              className="mt-4"
            >
              Try Again
            </Button>
          </div>
        )}
      </Modal>
    </>
  );
}
