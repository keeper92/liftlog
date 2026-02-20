'use client';

import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useSettingsStore } from '@/stores/settingsStore';
import { formatRelativeDate, formatDuration, toDisplayWeight, weightUnit } from '@/lib/utils/units';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';

interface WorkoutSet {
  id: string;
  exercise_id: string;
  set_number: number;
  weight: number | null;
  reps: number | null;
  time: number | null;
  is_split_lr: boolean;
  left_weight: number | null;
  left_reps: number | null;
  right_weight: number | null;
  right_reps: number | null;
  exercises: {
    name: string;
  };
}

interface HistoryWorkout {
  id: string;
  name: string | null;
  date: string;
  start_time: string;
  end_time: string | null;
  sets: WorkoutSet[];
}

interface GroupedExercise {
  name: string;
  setLabels: string[];
}

interface EditSetDraft {
  localId: string;
  setId: string | null;
  exerciseId: string;
  exerciseName: string;
  weight: string;
  reps: string;
  isSplit: boolean;
  time: number | null;
}

interface HistoryOverlayProps {
  onClose: () => void;
  onStartWorkout?: () => void;
  longestStreak: number;
  currentStreak: number;
  totalWorkouts: number;
}

export default function HistoryOverlay({ onClose, onStartWorkout, longestStreak, currentStreak, totalWorkouts }: HistoryOverlayProps) {
  const supabase = useMemo(() => createClient(), []);
  const unitSystem = useSettingsStore((s) => s.unitSystem);
  const unit = weightUnit(unitSystem);

  const [workouts, setWorkouts] = useState<HistoryWorkout[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const [deleting, setDeleting] = useState<string | null>(null);
  const [editingWorkoutId, setEditingWorkoutId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editExerciseOrder, setEditExerciseOrder] = useState<string[]>([]);
  const [editExerciseNames, setEditExerciseNames] = useState<Record<string, string>>({});
  const [editSetDraftsByExercise, setEditSetDraftsByExercise] = useState<Record<string, EditSetDraft[]>>({});
  const [savingEdits, setSavingEdits] = useState(false);
  const monthInitializedRef = useRef(false);

  const editingWorkout = editingWorkoutId ? workouts.find((w) => w.id === editingWorkoutId) || null : null;

  const loadWorkouts = useCallback(async () => {
    const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    let userId: string | null = null;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.id) {
        userId = session.user.id;
        break;
      }
      await wait(250);
    }

    if (!userId) {
      setWorkouts([]);
      return;
    }

    const { data } = await supabase
      .from('workouts')
      .select(
        'id, name, date, start_time, end_time, sets(id, exercise_id, set_number, weight, reps, time, is_split_lr, left_weight, left_reps, right_weight, right_reps, exercises(name))',
      )
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(250);

    if (data) {
      setWorkouts(data as unknown as HistoryWorkout[]);
      if (!monthInitializedRef.current && data.length > 0) {
        const latestDate = new Date((data[0] as { date: string }).date);
        if (!Number.isNaN(latestDate.getTime())) {
          setCurrentMonth(new Date(latestDate.getFullYear(), latestDate.getMonth(), 1));
        }
        monthInitializedRef.current = true;
      }
    }
  }, [supabase]);

  useEffect(() => {
    async function load() {
      await loadWorkouts();
      setLoading(false);
    }
    load();
  }, [loadWorkouts]);

  useEffect(() => {
    const { data: authSub } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') && session?.user?.id) {
        void loadWorkouts();
      }
    });

    return () => {
      authSub.subscription.unsubscribe();
    };
  }, [loadWorkouts, supabase.auth]);

  function formatSetLabel(set: WorkoutSet): string {
    if (set.is_split_lr) {
      const leftWeight = set.left_weight ? `${toDisplayWeight(set.left_weight, unitSystem)} ${unit}` : 'BW';
      const rightWeight = set.right_weight ? `${toDisplayWeight(set.right_weight, unitSystem)} ${unit}` : 'BW';
      const leftReps = set.left_reps ?? '-';
      const rightReps = set.right_reps ?? '-';
      return `L ${leftWeight} x ${leftReps} / R ${rightWeight} x ${rightReps}`;
    }

    if (set.time && !set.weight && !set.reps) {
      return formatDuration(set.time);
    }

    if (set.weight !== null && set.reps !== null) {
      return `${toDisplayWeight(set.weight, unitSystem)} ${unit} x ${set.reps}`;
    }

    if (set.weight !== null && set.reps === null) {
      return `${toDisplayWeight(set.weight, unitSystem)} ${unit}`;
    }

    if (set.weight === null && set.reps !== null) {
      return `BW x ${set.reps}`;
    }

    return '-';
  }

  function groupByExercise(sets: WorkoutSet[]): GroupedExercise[] {
    const exerciseMap = new Map<string, { name: string; setLabels: { num: number; label: string }[] }>();
    for (const set of sets) {
      const key = set.exercise_id;
      if (!exerciseMap.has(key)) {
        exerciseMap.set(key, { name: set.exercises.name, setLabels: [] });
      }
      exerciseMap.get(key)!.setLabels.push({ num: set.set_number, label: formatSetLabel(set) });
    }

    return Array.from(exerciseMap.values()).map((ex) => ({
      name: ex.name,
      setLabels: ex.setLabels
        .sort((a, b) => a.num - b.num)
        .map((s) => s.label),
    }));
  }

  function getEditableExerciseGroups(): Array<{ exerciseId: string; name: string; sets: EditSetDraft[] }> {
    return editExerciseOrder.map((exerciseId) => {
      const sets = editSetDraftsByExercise[exerciseId] || [];
      const name = editExerciseNames[exerciseId] || sets[0]?.exerciseName || 'Exercise';
      return { exerciseId, name, sets };
    });
  }

  function makeLocalSetId(exerciseId: string): string {
    return `new-${exerciseId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function openEditOverlay(workout: HistoryWorkout) {
    setEditingWorkoutId(workout.id);
    setEditName(workout.name || 'Workout');
    setEditDate(workout.date.split('T')[0]);

    const order: string[] = [];
    const names: Record<string, string> = {};
    const grouped: Record<string, EditSetDraft[]> = {};

    const sortedSets = [...workout.sets].sort((a, b) => a.set_number - b.set_number);
    for (const set of sortedSets) {
      if (!grouped[set.exercise_id]) {
        grouped[set.exercise_id] = [];
        order.push(set.exercise_id);
        names[set.exercise_id] = set.exercises.name;
      }

      grouped[set.exercise_id].push({
        localId: set.id,
        setId: set.id,
        exerciseId: set.exercise_id,
        exerciseName: set.exercises.name,
        weight: set.weight !== null ? String(set.weight) : '',
        reps: set.reps !== null ? String(set.reps) : '',
        isSplit: set.is_split_lr,
        time: set.time,
      });
    }

    setEditExerciseOrder(order);
    setEditExerciseNames(names);
    setEditSetDraftsByExercise(grouped);
  }

  function closeEditOverlay() {
    if (savingEdits || deleting === editingWorkoutId) return;
    setEditingWorkoutId(null);
    setEditExerciseOrder([]);
    setEditExerciseNames({});
    setEditSetDraftsByExercise({});
  }

  function updateEditSetField(exerciseId: string, localId: string, field: 'weight' | 'reps', value: string) {
    setEditSetDraftsByExercise((prev) => {
      const next = [...(prev[exerciseId] || [])];
      const idx = next.findIndex((draft) => draft.localId === localId);
      if (idx === -1) return prev;
      next[idx] = { ...next[idx], [field]: value };
      return {
        ...prev,
        [exerciseId]: next,
      };
    });
  }

  function addSetDraft(exerciseId: string, exerciseName: string) {
    const newDraft: EditSetDraft = {
      localId: makeLocalSetId(exerciseId),
      setId: null,
      exerciseId,
      exerciseName,
      weight: '',
      reps: '',
      isSplit: false,
      time: null,
    };

    setEditSetDraftsByExercise((prev) => ({
      ...prev,
      [exerciseId]: [...(prev[exerciseId] || []), newDraft],
    }));
  }

  function removeSetDraft(exerciseId: string, localId: string) {
    setEditSetDraftsByExercise((prev) => ({
      ...prev,
      [exerciseId]: (prev[exerciseId] || []).filter((draft) => draft.localId !== localId),
    }));
  }

  function moveSetDraft(exerciseId: string, localId: string, direction: 'up' | 'down') {
    setEditSetDraftsByExercise((prev) => {
      const current = [...(prev[exerciseId] || [])];
      const idx = current.findIndex((draft) => draft.localId === localId);
      if (idx === -1) return prev;

      const target = direction === 'up' ? idx - 1 : idx + 1;
      if (target < 0 || target >= current.length) return prev;

      const temp = current[idx];
      current[idx] = current[target];
      current[target] = temp;

      return {
        ...prev,
        [exerciseId]: current,
      };
    });
  }

  function applyDateToTimestamp(originalIso: string, targetDate: string): string {
    const original = new Date(originalIso);
    const [year, month, day] = targetDate.split('-').map((v) => Number.parseInt(v, 10));
    const updated = new Date(original);
    updated.setUTCFullYear(year, month - 1, day);
    return updated.toISOString();
  }

  function parseNullableNumber(value: string): number | null {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number.parseFloat(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function parseNullableInt(value: string): number | null {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number.parseInt(trimmed, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  async function handleSaveEdits() {
    if (!editingWorkout) return;

    setSavingEdits(true);
    try {
      const trimmedName = editName.trim();
      const nextName = trimmedName || 'Workout';

      const workoutUpdates: {
        name?: string;
        date?: string;
        start_time?: string;
        end_time?: string | null;
      } = {};

      if (nextName !== (editingWorkout.name || 'Workout')) {
        workoutUpdates.name = nextName;
      }

      const currentDate = editingWorkout.date.split('T')[0];
      if (editDate && editDate !== currentDate) {
        const nextStart = applyDateToTimestamp(editingWorkout.start_time, editDate);
        workoutUpdates.date = nextStart;
        workoutUpdates.start_time = nextStart;

        if (editingWorkout.end_time) {
          const originalStartMs = new Date(editingWorkout.start_time).getTime();
          const originalEndMs = new Date(editingWorkout.end_time).getTime();
          const durationMs = Math.max(originalEndMs - originalStartMs, 0);
          workoutUpdates.end_time = new Date(new Date(nextStart).getTime() + durationMs).toISOString();
        }
      }

      if (Object.keys(workoutUpdates).length > 0) {
        await supabase
          .from('workouts')
          .update(workoutUpdates)
          .eq('id', editingWorkout.id);
      }

      const normalizedDrafts = editExerciseOrder.flatMap((exerciseId) =>
        (editSetDraftsByExercise[exerciseId] || []).map((draft, idx) => ({
          ...draft,
          setNumber: idx + 1,
        })),
      );

      const existingSetById = new Map(editingWorkout.sets.map((set) => [set.id, set]));
      const originalSetIds = new Set(editingWorkout.sets.map((set) => set.id));
      const keptSetIds = new Set(
        normalizedDrafts
          .map((draft) => draft.setId)
          .filter((id): id is string => !!id),
      );

      const setIdsToDelete = Array.from(originalSetIds).filter((id) => !keptSetIds.has(id));
      if (setIdsToDelete.length > 0) {
        await supabase
          .from('sets')
          .delete()
          .in('id', setIdsToDelete);
      }

      const setUpdatePromises: PromiseLike<unknown>[] = [];
      const setsToInsert: Array<{
        workout_id: string;
        exercise_id: string;
        set_number: number;
        weight: number | null;
        reps: number | null;
        time: null;
        is_warmup: boolean;
        is_completed: boolean;
      }> = [];

      for (const draft of normalizedDrafts) {
        if (draft.setId) {
          const original = existingSetById.get(draft.setId);
          if (!original) continue;

          const payload: {
            set_number: number;
            weight?: number | null;
            reps?: number | null;
          } = {
            set_number: draft.setNumber,
          };

          if (!draft.isSplit && draft.time === null) {
            payload.weight = parseNullableNumber(draft.weight);
            payload.reps = parseNullableInt(draft.reps);
          }

          const setNumberChanged = draft.setNumber !== original.set_number;
          const weightChanged =
            'weight' in payload &&
            payload.weight !== original.weight;
          const repsChanged =
            'reps' in payload &&
            payload.reps !== original.reps;

          if (!setNumberChanged && !weightChanged && !repsChanged) continue;

          setUpdatePromises.push(
            supabase
              .from('sets')
              .update(payload)
              .eq('id', draft.setId),
          );
          continue;
        }

        setsToInsert.push({
          workout_id: editingWorkout.id,
          exercise_id: draft.exerciseId,
          set_number: draft.setNumber,
          weight: parseNullableNumber(draft.weight),
          reps: parseNullableInt(draft.reps),
          time: null,
          is_warmup: false,
          is_completed: true,
        });
      }

      if (setUpdatePromises.length > 0) {
        await Promise.all(setUpdatePromises);
      }

      if (setsToInsert.length > 0) {
        await supabase.from('sets').insert(setsToInsert);
      }

      await loadWorkouts();
      closeEditOverlay();
    } finally {
      setSavingEdits(false);
    }
  }

  async function handleDelete(workoutId: string, askConfirm = true) {
    if (askConfirm && !window.confirm('Delete this workout? This cannot be undone.')) return;

    setDeleting(workoutId);
    const { error } = await supabase.from('workouts').delete().eq('id', workoutId);

    if (!error) {
      setWorkouts((prev) => prev.filter((w) => w.id !== workoutId));
      if (editingWorkoutId === workoutId) {
        setEditingWorkoutId(null);
        setEditExerciseOrder([]);
        setEditExerciseNames({});
        setEditSetDraftsByExercise({});
      }
    }
    setDeleting(null);
  }

  function getWorkoutsForDate(dateStr: string): HistoryWorkout[] {
    return workouts.filter((w) => toDateKey(w.date) === dateStr);
  }

  const workoutDates = new Set(workouts.map((w) => toDateKey(w.date)));

  function getDaysInMonth(date: Date): number {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  }

  function getFirstDayOfMonth(date: Date): number {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  }

  function formatDateKey(year: number, month: number, day: number): string {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  function toDateKey(value: string): string {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return formatDateKey(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
    }

    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return `${match[1]}-${match[2]}-${match[3]}`;

    return value.split('T')[0];
  }

  function getTodayDateKey(): string {
    const now = new Date();
    return formatDateKey(now.getFullYear(), now.getMonth(), now.getDate());
  }

  function prevMonth() {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
    setSelectedDate(null);
  }

  function nextMonth() {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
    setSelectedDate(null);
  }

  const daysInMonth = getDaysInMonth(currentMonth);
  const firstDay = getFirstDayOfMonth(currentMonth);
  const monthName = currentMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const selectedWorkouts = selectedDate ? getWorkoutsForDate(selectedDate) : [];

  return (
    <div className="fixed inset-0 z-[70] bg-background flex flex-col">
      <Modal isOpen={!!editingWorkout} onClose={closeEditOverlay} title="Edit Workout">
        {editingWorkout && (
          <div className="space-y-4 text-sm">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-text-muted mb-1">Workout Name</label>
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-text"
                placeholder="Workout"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-text-muted mb-1">Date</label>
              <input
                type="date"
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-text"
              />
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-2">Sets</p>
              <div className="max-h-[42vh] overflow-y-auto rounded-2xl border border-border bg-background px-3 py-2 space-y-3">
                {getEditableExerciseGroups().map((group) => (
                  <div key={group.exerciseId}>
                    <div className="flex items-center justify-between mb-1.5 gap-2">
                      <p className="text-xs font-semibold text-text">{group.name}</p>
                      <button
                        type="button"
                        onClick={() => addSetDraft(group.exerciseId, group.name)}
                        className="text-[11px] font-semibold text-primary hover:text-primary-dark"
                      >
                        + Add Set
                      </button>
                    </div>
                    <div className="space-y-1.5">
                      {group.sets.map((set, idx) => (
                        <div key={set.localId} className="grid grid-cols-[56px,1fr,1fr,74px] gap-2 items-center">
                          <span className="text-xs text-text-muted">Set {idx + 1}</span>
                          <input
                            value={set.weight}
                            onChange={(e) => updateEditSetField(group.exerciseId, set.localId, 'weight', e.target.value)}
                            placeholder={`Weight (${unit})`}
                            className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-text"
                            disabled={set.isSplit || set.time !== null}
                          />
                          <input
                            value={set.reps}
                            onChange={(e) => updateEditSetField(group.exerciseId, set.localId, 'reps', e.target.value)}
                            placeholder="Reps"
                            className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-text"
                            disabled={set.isSplit || set.time !== null}
                          />
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => moveSetDraft(group.exerciseId, set.localId, 'up')}
                              className="w-6 h-6 rounded-md border border-border text-text-muted hover:text-text"
                              aria-label="Move set up"
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              onClick={() => moveSetDraft(group.exerciseId, set.localId, 'down')}
                              className="w-6 h-6 rounded-md border border-border text-text-muted hover:text-text"
                              aria-label="Move set down"
                            >
                              ↓
                            </button>
                            <button
                              type="button"
                              onClick={() => removeSetDraft(group.exerciseId, set.localId)}
                              className="w-6 h-6 rounded-md border border-border text-text-muted hover:text-error"
                              aria-label="Remove set"
                            >
                              ×
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                    {group.sets.some((set) => set.isSplit || set.time !== null) && (
                      <p className="mt-1 text-[11px] text-text-muted">Split/timed sets are read-only for weight/reps but can be reordered or removed.</p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <Button
                variant="danger"
                size="sm"
                onClick={() => handleDelete(editingWorkout.id)}
                loading={deleting === editingWorkout.id}
              >
                Delete Workout
              </Button>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={closeEditOverlay} disabled={savingEdits || deleting === editingWorkout.id}>
                  Cancel
                </Button>
                <Button size="sm" onClick={handleSaveEdits} loading={savingEdits} disabled={deleting === editingWorkout.id}>
                  Save Changes
                </Button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Close button */}
      <div className="px-5 pt-4 flex items-center justify-between">
        <div>
          <p className="ui-kicker">Training Log</p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-text">Consistency</h2>
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

      {/* Streak Stats */}
      <div className="px-5 py-4">
        <div className="ui-overlay-shell rounded-2xl px-4 py-4 flex items-center justify-around">
          <div className="text-center">
            <p className="text-2xl font-bold text-text">{longestStreak}</p>
            <p className="text-xs text-text-muted mt-0.5">Best Streak</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-text">{currentStreak}</p>
            <p className="text-xs text-text-muted mt-0.5">Current Streak</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-text">{totalWorkouts}</p>
            <p className="text-xs text-text-muted mt-0.5">Total Sessions</p>
          </div>
        </div>
        <p className="text-xs text-text-secondary text-center mt-3">
          {currentStreak > 0
            ? `${currentStreak}-day streak active. Keep the run going today.`
            : 'No active streak. One workout today starts a new streak.'}
        </p>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-5 pt-4 pb-8">
        {loading ? (
          <p className="text-text-muted text-sm text-center py-8">Loading...</p>
        ) : workouts.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-text-muted">No workouts yet.</p>
            <p className="text-text-muted text-sm mt-1">Start your first workout!</p>
            {onStartWorkout && (
              <Button onClick={onStartWorkout} size="sm" className="mt-4">
                Start Workout
              </Button>
            )}
          </div>
        ) : (
          <div>
            {/* Calendar Card */}
            <div className="bg-surface rounded-2xl border border-border/70 p-4 card-shadow">
              {/* Calendar Header */}
              <div className="flex items-center justify-between mb-4">
                <button onClick={prevMonth} className="p-2 -ml-2 text-text-muted hover:text-text transition-colors rounded-full hover:bg-surface-light">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                </button>
                <h2 className="text-sm font-semibold">{monthName}</h2>
                <button onClick={nextMonth} className="p-2 -mr-2 text-text-muted hover:text-text transition-colors rounded-full hover:bg-surface-light">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              </div>

              {/* Day headers */}
              <div className="grid grid-cols-7 gap-1 mb-2">
                {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((day, i) => (
                  <div key={i} className="text-center text-xs text-text-muted font-medium py-1">
                    {day}
                  </div>
                ))}
              </div>

              {/* Calendar grid */}
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: firstDay }).map((_, i) => (
                  <div key={`empty-${i}`} className="aspect-square" />
                ))}

                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const day = i + 1;
                  const dateKey = formatDateKey(currentMonth.getFullYear(), currentMonth.getMonth(), day);
                  const hasWorkout = workoutDates.has(dateKey);
                  const isSelected = selectedDate === dateKey;
                  const isToday = dateKey === getTodayDateKey();

                  return (
                    <button
                      key={day}
                      onClick={() => hasWorkout && setSelectedDate(isSelected ? null : dateKey)}
                      disabled={!hasWorkout}
                      className={`aspect-square rounded-xl flex flex-col items-center justify-center text-xs font-semibold transition-all relative ${
                        isSelected
                          ? 'bg-primary text-white shadow-sm'
                          : isToday
                            ? 'bg-text text-white'
                            : hasWorkout
                              ? 'text-text hover:bg-surface-light'
                              : 'text-text-muted'
                      } ${hasWorkout ? 'cursor-pointer' : 'cursor-default'}`}
                    >
                      {day}
                      {hasWorkout && !isSelected && !isToday && (
                        <span className="absolute bottom-1 w-1 h-1 rounded-full bg-primary" />
                      )}
                      {hasWorkout && isToday && !isSelected && (
                        <span className="absolute bottom-1 w-1 h-1 rounded-full bg-white" />
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="mt-3 flex items-center justify-center gap-4 text-[11px] text-text-secondary">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-primary" />
                  <span>Workout logged</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-text" />
                  <span>Today</span>
                </div>
              </div>
            </div>

            {/* Selected date details */}
            {selectedDate && selectedWorkouts.length > 0 && (
              <div className="mt-4">
                <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
                  {new Date(selectedDate + 'T12:00:00').toLocaleDateString(undefined, {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                  })}
                </h3>
                <div className="space-y-3">
                  {selectedWorkouts.map((w) => {
                    const exercises = groupByExercise(w.sets);
                    const duration = w.end_time
                      ? Math.floor((new Date(w.end_time).getTime() - new Date(w.start_time).getTime()) / 1000)
                      : 0;

                    return (
                      <button
                        key={w.id}
                        onClick={() => openEditOverlay(w)}
                        className="w-full text-left bg-surface rounded-2xl border border-border/70 p-4 card-shadow hover:bg-surface-light transition-colors"
                      >
                        <div className="flex justify-between items-start mb-2 gap-2">
                          <div>
                            <p className="font-semibold text-sm">{w.name || 'Workout'}</p>
                            <p className="text-xs text-text-muted mt-0.5">{formatRelativeDate(w.date)}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            {duration > 0 && (
                              <span className="text-xs text-text-muted bg-surface-light px-2 py-1 rounded-full">{formatDuration(duration)}</span>
                            )}
                            <span className="text-xs font-semibold text-primary">Edit</span>
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          {exercises.map((ex, i) => (
                            <div key={i} className="text-xs flex items-baseline">
                              <span className="text-text font-medium">{ex.name}</span>
                              <span className="text-text-muted ml-2">
                                {ex.setLabels.length} × ({ex.setLabels.join(', ')})
                              </span>
                            </div>
                          ))}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* No date selected hint */}
            {!selectedDate && (
              <p className="text-xs text-text-muted text-center mt-4">Tap a highlighted day to open and edit that session</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
