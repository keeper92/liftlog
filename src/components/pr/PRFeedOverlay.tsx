'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePRStore, type PRRecord } from '@/stores/prStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { toDisplayWeight, weightUnit } from '@/lib/utils/units';
import { createClient } from '@/lib/supabase/client';
import Button from '@/components/ui/Button';

interface PRFeedOverlayProps {
  onClose: () => void;
  onStartWorkout?: () => void;
}

interface PRFeedSetRow {
  exercise_id: string;
  set_number: number | null;
  weight: number | null;
  reps: number | null;
  is_warmup: boolean | null;
  is_completed: boolean | null;
  exercises: { name: string } | { name: string }[] | null;
}

interface PRFeedWorkoutRow {
  id: string;
  date: string;
  sets: PRFeedSetRow[] | null;
}

function formatPRImprovement(pr: PRRecord, unitSystem: 'imperial' | 'metric'): string {
  const unit = weightUnit(unitSystem);
  if (pr.metric === 'weight') {
    const diff = toDisplayWeight(pr.newValue - pr.previousValue, unitSystem);
    const prev = toDisplayWeight(pr.previousValue, unitSystem);
    const curr = toDisplayWeight(pr.newValue, unitSystem);
    return `+${diff} ${unit} (${prev} -> ${curr} ${unit})`;
  }
  const diff = pr.newValue - pr.previousValue;
  return `+${diff} reps (${pr.previousValue} -> ${pr.newValue})`;
}

function groupByDate(records: PRRecord[]): { dateLabel: string; items: PRRecord[] }[] {
  const groups = new Map<string, PRRecord[]>();
  for (const record of records) {
    const dateKey = new Date(record.date).toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
    if (!groups.has(dateKey)) {
      groups.set(dateKey, []);
    }
    groups.get(dateKey)!.push(record);
  }
  return Array.from(groups.entries()).map(([dateLabel, items]) => ({ dateLabel, items }));
}

function resolveExerciseName(value: PRFeedSetRow['exercises']): string {
  if (!value) return 'Exercise';
  if (Array.isArray(value)) return value[0]?.name ?? 'Exercise';
  return value.name;
}

function buildHistoricalPRs(workouts: PRFeedWorkoutRow[]): PRRecord[] {
  const perExercise = new Map<string, { bestWeight: number; bestRepsByWeight: Map<number, number> }>();
  const result: PRRecord[] = [];

  for (const workout of workouts) {
    const sets = [...(workout.sets || [])].sort((a, b) => (a.set_number || 0) - (b.set_number || 0));

    for (let i = 0; i < sets.length; i += 1) {
      const set = sets[i];
      if (set.is_completed === false || set.is_warmup) continue;

      const weight = set.weight ?? 0;
      const reps = set.reps ?? 0;
      if (weight <= 0 || reps <= 0) continue;

      const exerciseId = set.exercise_id;
      const exerciseName = resolveExerciseName(set.exercises);

      const state = perExercise.get(exerciseId);
      if (!state) {
        const baseline = new Map<number, number>();
        baseline.set(weight, reps);
        perExercise.set(exerciseId, { bestWeight: weight, bestRepsByWeight: baseline });
        continue;
      }

      if (weight > state.bestWeight && state.bestWeight > 0) {
        result.push({
          id: `hist:${workout.id}:${exerciseId}:${i}:weight`,
          exerciseId,
          exerciseName,
          metric: 'weight',
          previousValue: state.bestWeight,
          newValue: weight,
          date: workout.date,
          workoutId: workout.id,
        });
      } else if (weight >= state.bestWeight && state.bestWeight > 0) {
        const prevBestRepsAtWeight = state.bestRepsByWeight.get(weight) || 0;
        if (prevBestRepsAtWeight > 0 && reps > prevBestRepsAtWeight) {
          result.push({
            id: `hist:${workout.id}:${exerciseId}:${i}:reps`,
            exerciseId,
            exerciseName,
            metric: 'reps',
            previousValue: prevBestRepsAtWeight,
            newValue: reps,
            date: workout.date,
            workoutId: workout.id,
          });
        }
      }

      state.bestWeight = Math.max(state.bestWeight, weight);
      state.bestRepsByWeight.set(weight, Math.max(state.bestRepsByWeight.get(weight) || 0, reps));
    }
  }

  return result;
}

export default function PRFeedOverlay({ onClose, onStartWorkout }: PRFeedOverlayProps) {
  const supabase = useMemo(() => createClient(), []);
  const records = usePRStore((s) => s.records);
  const markAllRead = usePRStore((s) => s.markAllRead);
  const unitSystem = useSettingsStore((s) => s.unitSystem);
  const [historyRecords, setHistoryRecords] = useState<PRRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  useEffect(() => {
    markAllRead();
  }, [markAllRead]);

  useEffect(() => {
    let cancelled = false;

    async function loadHistoricalPRs() {
      setHistoryLoading(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) {
          setHistoryRecords([]);
          setHistoryLoading(false);
        }
        return;
      }

      const { data, error } = await supabase
        .from('workouts')
        .select('id, date, sets(exercise_id, set_number, weight, reps, is_warmup, is_completed, exercises(name))')
        .eq('user_id', user.id)
        .order('date', { ascending: true })
        .limit(500);

      if (cancelled) return;

      if (error || !data) {
        setHistoryRecords([]);
        setHistoryLoading(false);
        return;
      }

      const computed = buildHistoricalPRs(data as unknown as PRFeedWorkoutRow[])
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 120);

      setHistoryRecords(computed);
      setHistoryLoading(false);
    }

    loadHistoricalPRs();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const displayRecords = records.length > 0 ? records : historyRecords;
  const grouped = groupByDate(displayRecords);

  return (
    <div className="fixed inset-0 z-[70] bg-background flex flex-col">
      {/* Close button */}
      <div className="px-5 pt-4 flex items-center justify-between">
        <div>
          <p className="ui-kicker">Training Log</p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-text">Personal records</h2>
        </div>
        <button
          onClick={onClose}
          className="ui-icon-pill w-10 h-10 flex items-center justify-center rounded-full"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-text-muted">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-5 pt-4 pb-8">
        {displayRecords.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-12 h-12 rounded-full border border-border/80 bg-surface-light flex items-center justify-center mx-auto mb-3">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-text-muted">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
            </div>
            <p className="text-text-muted">{historyLoading ? 'Loading records...' : 'No records yet'}</p>
            <p className="text-text-muted text-sm mt-1">Log a few workouts, then beat your baseline to unlock PRs.</p>
            {onStartWorkout && (
              <Button onClick={onStartWorkout} size="sm" className="mt-4">
                Start Workout
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {grouped.map(({ dateLabel, items }) => (
              <div key={dateLabel}>
                <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
                  {dateLabel}
                </h3>
                <div className="space-y-2">
                  {items.map((pr) => (
                    <div key={pr.id} className="bg-surface rounded-2xl border border-border/70 p-4 card-shadow flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="text-primary">
                          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-text">{pr.exerciseName}</p>
                        <p className="text-xs text-text-muted mt-0.5">
                          {formatPRImprovement(pr, unitSystem)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
