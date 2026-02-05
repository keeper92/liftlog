'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useActiveWorkoutStore } from '@/stores/activeWorkoutStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { formatDuration, toDisplayWeight, toStorageWeight, weightUnit } from '@/lib/utils/units';
import Button from '@/components/ui/Button';

export default function ActiveWorkoutPage() {
  const router = useRouter();
  const supabase = createClient();
  const store = useActiveWorkoutStore();
  const unitSystem = useSettingsStore((s) => s.unitSystem);
  const [elapsed, setElapsed] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!store.isActive) {
      router.replace('/dashboard');
      return;
    }
    const interval = setInterval(() => {
      if (store.startTime) {
        setElapsed(Math.floor((Date.now() - new Date(store.startTime).getTime()) / 1000));
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [store.isActive, store.startTime]);

  // Load previous performance for exercises
  useEffect(() => {
    async function loadPrevious() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      for (const ex of store.exercises) {
        if (store.previousPerformance[ex.exerciseId]) continue;
        const { data } = await supabase
          .from('sets')
          .select('weight, reps, set_number, workouts!inner(user_id, date)')
          .eq('exercise_id', ex.exerciseId)
          .eq('is_completed', true)
          .eq('is_warmup', false)
          .order('set_number')
          .limit(10);
        if (data && data.length > 0) {
          store.setPreviousPerformance(
            ex.exerciseId,
            data.map((s) => ({ weight: s.weight || 0, reps: s.reps || 0 })),
          );
        }
      }
    }
    if (store.exercises.length > 0) loadPrevious();
  }, [store.exercises.length]);

  const handleFinish = useCallback(async () => {
    setSaving(true);
    const result = store.finishWorkout();
    if (!result) { setSaving(false); return; }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }

    const { data: workout, error: wErr } = await supabase
      .from('workouts')
      .insert({
        id: result.workoutId,
        user_id: user.id,
        name: result.workoutName,
        date: result.startTime,
        start_time: result.startTime,
        end_time: new Date().toISOString(),
      })
      .select()
      .single();

    if (wErr || !workout) { setSaving(false); return; }

    const setsToInsert = result.exercises.flatMap((ex) =>
      ex.sets
        .filter((s) => s.isCompleted)
        .map((s) => ({
          workout_id: workout.id,
          exercise_id: ex.exerciseId,
          set_number: s.setNumber,
          weight: s.weight,
          reps: s.reps,
          is_warmup: s.isWarmup,
          is_completed: true,
        })),
    );

    if (setsToInsert.length > 0) {
      await supabase.from('sets').insert(setsToInsert);
    }

    router.push(`/workout/summary/${workout.id}`);
  }, [store, supabase, router]);

  const handleDiscard = useCallback(() => {
    if (window.confirm('Discard this workout? All progress will be lost.')) {
      store.discardWorkout();
      router.push('/dashboard');
    }
  }, [store, router]);

  if (!store.isActive) return null;

  const unit = weightUnit(unitSystem);

  return (
    <div className="flex flex-col min-h-dvh bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-surface border-b border-border">
        <button onClick={handleDiscard} className="text-error text-sm font-medium min-h-[44px] px-2 flex items-center">
          Discard
        </button>
        <div className="text-center">
          <p className="font-semibold text-sm">{store.workoutName}</p>
          <p className="text-xs text-text-secondary">{formatDuration(elapsed)}</p>
        </div>
        <Button variant="primary" size="sm" onClick={handleFinish} loading={saving}>
          Finish
        </Button>
      </div>

      {/* Exercise List */}
      <div className="flex-1 overflow-y-auto px-4 py-4 pb-20 space-y-6">
        {store.exercises.map((ex, exIdx) => {
          const prev = store.previousPerformance[ex.exerciseId] || [];
          return (
            <div key={ex.exerciseId + exIdx} className="bg-surface rounded-2xl p-4 border border-border">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-primary-light">{ex.exerciseName}</h3>
                <button
                  onClick={() => store.removeExercise(ex.exerciseId)}
                  className="text-text-muted text-xs hover:text-error"
                >
                  Remove
                </button>
              </div>

              {/* Column Headers */}
              <div className="grid grid-cols-[40px_1fr_1fr_1fr_40px] gap-2 text-xs text-text-muted mb-2 text-center">
                <span>SET</span>
                <span>PREV</span>
                <span>{unit.toUpperCase()}</span>
                <span>REPS</span>
                <span></span>
              </div>

              {/* Set Rows */}
              {ex.sets.map((s, setIdx) => (
                <div
                  key={s.id}
                  className={`grid grid-cols-[40px_1fr_1fr_1fr_40px] gap-2 items-center mb-2 ${
                    s.isCompleted ? 'opacity-60' : ''
                  }`}
                >
                  <span className={`text-center text-sm font-medium ${s.isWarmup ? 'text-warning' : 'text-text-secondary'}`}>
                    {s.isWarmup ? 'W' : s.setNumber}
                  </span>
                  <span className="text-center text-sm text-text-muted">
                    {prev[setIdx] ? `${toDisplayWeight(prev[setIdx].weight, unitSystem)}×${prev[setIdx].reps}` : '-'}
                  </span>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={s.weight !== null ? toDisplayWeight(s.weight, unitSystem) : ''}
                    onChange={(e) => {
                      const val = e.target.value ? toStorageWeight(parseFloat(e.target.value), unitSystem) : null;
                      store.updateSet(exIdx, setIdx, { weight: val });
                    }}
                    className="bg-surface-light rounded-lg px-2 py-2 text-center text-sm min-h-[44px] w-full border border-border focus:border-primary outline-none"
                    placeholder="0"
                  />
                  <input
                    type="number"
                    inputMode="numeric"
                    value={s.reps ?? ''}
                    onChange={(e) => {
                      const val = e.target.value ? parseInt(e.target.value) : null;
                      store.updateSet(exIdx, setIdx, { reps: val });
                    }}
                    className="bg-surface-light rounded-lg px-2 py-2 text-center text-sm min-h-[44px] w-full border border-border focus:border-primary outline-none"
                    placeholder="0"
                  />
                  <button
                    onClick={() => {
                      if (s.isCompleted) {
                        store.updateSet(exIdx, setIdx, { isCompleted: false, timestamp: null });
                      } else {
                        store.completeSet(exIdx, setIdx);
                      }
                    }}
                    className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      s.isCompleted ? 'bg-success text-white' : 'bg-surface-light text-text-muted'
                    }`}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </button>
                </div>
              ))}

              <button
                onClick={() => store.addSet(exIdx)}
                className="w-full mt-2 py-2 text-sm text-primary hover:text-primary-light"
              >
                + Add Set
              </button>
            </div>
          );
        })}

        <Button
          variant="outline"
          fullWidth
          onClick={() => router.push('/exercises?select=true')}
        >
          + Add Exercise
        </Button>
      </div>
    </div>
  );
}
