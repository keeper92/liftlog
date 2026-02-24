'use client';

import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { isMissingSplitSetColumnsError } from '@/lib/supabase/schemaCompat';
import { useSettingsStore } from '@/stores/settingsStore';
import { useActiveWorkoutStore, type HydratedExerciseInput } from '@/stores/activeWorkoutStore';
import { formatRelativeDate, formatDuration, weightUnit } from '@/lib/utils/units';
import { formatAutoWorkoutName } from '@/lib/utils/workoutName';
import { buildExerciseSetSummaries } from '@/lib/utils/workoutSetSummary';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input-shadcn';
import ExerciseSetSummaryList from '@/components/workout/ExerciseSetSummaryList';

interface WorkoutSet {
  id: string;
  exercise_id: string;
  set_number: number;
  weight: number | null;
  reps: number | null;
  time: number | null;
  distance: number | null;
  is_warmup: boolean;
  is_completed: boolean;
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

interface WorkoutSetRow {
  id: string;
  exercise_id: string;
  set_number: number;
  weight: number | null;
  reps: number | null;
  time: number | null;
  distance?: number | null;
  is_warmup?: boolean | null;
  is_completed?: boolean | null;
  is_split_lr?: boolean | null;
  left_weight?: number | null;
  left_reps?: number | null;
  right_weight?: number | null;
  right_reps?: number | null;
  exercises: { name: string } | Array<{ name: string }> | null;
}

type HistoryWorkoutRow = Omit<HistoryWorkout, 'sets'> & {
  sets?: WorkoutSetRow[] | null;
};

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
  initialDateKey?: string | null;
}

function normalizeWorkoutSet(row: WorkoutSetRow): WorkoutSet {
  const exerciseRef = Array.isArray(row.exercises) ? row.exercises[0] : row.exercises;
  return {
    id: row.id,
    exercise_id: row.exercise_id,
    set_number: row.set_number,
    weight: row.weight,
    reps: row.reps,
    time: row.time,
    distance: row.distance ?? null,
    is_warmup: !!row.is_warmup,
    is_completed: row.is_completed !== false,
    is_split_lr: !!row.is_split_lr,
    left_weight: row.left_weight ?? null,
    left_reps: row.left_reps ?? null,
    right_weight: row.right_weight ?? null,
    right_reps: row.right_reps ?? null,
    exercises: {
      name: exerciseRef?.name || 'Exercise',
    },
  };
}

function normalizeWorkoutRows(rows: HistoryWorkoutRow[]): HistoryWorkout[] {
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    date: row.date,
    start_time: row.start_time,
    end_time: row.end_time,
    sets: (row.sets ?? []).map((set) => normalizeWorkoutSet(set)),
  }));
}

export default function HistoryOverlay({
  onClose,
  onStartWorkout,
  longestStreak,
  currentStreak,
  totalWorkouts,
  initialDateKey = null,
}: HistoryOverlayProps) {
  const router = useRouter();
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
  const [creatingWorkoutDate, setCreatingWorkoutDate] = useState<string | null>(null);
  const monthInitializedRef = useRef(false);

  const editingWorkout = editingWorkoutId ? workouts.find((w) => w.id === editingWorkoutId) || null : null;

  function setInitialMonthFromWorkouts(rows: HistoryWorkout[]) {
    if (monthInitializedRef.current || rows.length === 0) return;
    const latestDate = new Date(rows[0].date);
    if (!Number.isNaN(latestDate.getTime())) {
      setCurrentMonth(new Date(latestDate.getFullYear(), latestDate.getMonth(), 1));
    }
    monthInitializedRef.current = true;
  }

  const loadWorkouts = useCallback(async () => {
    const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    let userId: string | null = null;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.id) {
        userId = user.id;
        break;
      }

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

    const { data, error } = await supabase
      .from('workouts')
      .select(
        'id, name, date, start_time, end_time, sets(id, exercise_id, set_number, weight, reps, time, distance, is_warmup, is_completed, is_split_lr, left_weight, left_reps, right_weight, right_reps, exercises(name))',
      )
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(250);

    if (data && !error) {
      const normalized = normalizeWorkoutRows(data as unknown as HistoryWorkoutRow[]);
      setWorkouts(normalized);
      setInitialMonthFromWorkouts(normalized);
      return;
    }

    if (isMissingSplitSetColumnsError(error)) {
      const { data: legacyData, error: legacyError } = await supabase
        .from('workouts')
        .select(
          'id, name, date, start_time, end_time, sets(id, exercise_id, set_number, weight, reps, time, distance, is_warmup, is_completed, exercises(name))',
        )
        .eq('user_id', userId)
        .order('date', { ascending: false })
        .limit(250);

      if (legacyData && !legacyError) {
        const normalized = normalizeWorkoutRows(legacyData as unknown as HistoryWorkoutRow[]);
        setWorkouts(normalized);
        setInitialMonthFromWorkouts(normalized);
        return;
      }
    }

    const { data: fallbackData, error: fallbackError } = await supabase
      .from('workouts')
      .select('id, name, date, start_time, end_time')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(250);

    if (fallbackError || !fallbackData) {
      setWorkouts([]);
      return;
    }

    const normalized = normalizeWorkoutRows(
      (fallbackData as unknown as Array<Omit<HistoryWorkout, 'sets'>>).map((row) => ({
        ...row,
        sets: [],
      })),
    );
    setWorkouts(normalized);
    setInitialMonthFromWorkouts(normalized);
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

  useEffect(() => {
    if (!initialDateKey) return;

    const selectedDateValue = new Date(`${initialDateKey}T12:00:00`);
    if (Number.isNaN(selectedDateValue.getTime())) return;

    setSelectedDate(initialDateKey);
    setCurrentMonth(new Date(selectedDateValue.getFullYear(), selectedDateValue.getMonth(), 1));
    monthInitializedRef.current = true;
  }, [initialDateKey]);

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

  function makeTemporaryExerciseId(): string {
    return `new-exercise-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function addExerciseGroup(initialName?: string) {
    const promptedName = initialName ?? window.prompt('Exercise name');
    const exerciseName = (promptedName || '').trim();
    if (!exerciseName) return;

    const exerciseId = makeTemporaryExerciseId();
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

    setEditExerciseOrder((prev) => [...prev, exerciseId]);
    setEditExerciseNames((prev) => ({ ...prev, [exerciseId]: exerciseName }));
    setEditSetDraftsByExercise((prev) => ({
      ...prev,
      [exerciseId]: [newDraft],
    }));
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
      const autoNameDateInput = editDate ? `${editDate}T12:00:00.000Z` : editingWorkout.date;
      const nextName = trimmedName || formatAutoWorkoutName(autoNameDateInput);

      const workoutUpdates: {
        name?: string;
        date?: string;
        start_time?: string;
        end_time?: string | null;
      } = {};

      if (nextName !== (editingWorkout.name || formatAutoWorkoutName(editingWorkout.date))) {
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

      const pendingInsertDrafts = normalizedDrafts.filter((draft) => !draft.setId);
      const unresolvedExerciseIds = Array.from(
        new Set(
          pendingInsertDrafts
            .map((draft) => draft.exerciseId)
            .filter((exerciseId) => exerciseId.startsWith('new-exercise-')),
        ),
      );

      const resolvedExerciseIds = new Map<string, string>();
      if (unresolvedExerciseIds.length > 0) {
        const exerciseNameByTempId = new Map<string, string>();
        for (const exerciseId of unresolvedExerciseIds) {
          const fallbackName = pendingInsertDrafts.find((draft) => draft.exerciseId === exerciseId)?.exerciseName || '';
          const name = (editExerciseNames[exerciseId] || fallbackName).trim();
          if (name) {
            exerciseNameByTempId.set(exerciseId, name);
          }
        }

        const namesToResolve = Array.from(new Set(Array.from(exerciseNameByTempId.values())));

        if (namesToResolve.length > 0) {
          const { data: existingExercises } = await supabase
            .from('exercises')
            .select('id, name')
            .in('name', namesToResolve);

          const existingByName = new Map(
            ((existingExercises || []) as { id: string; name: string }[]).map((exercise) => [exercise.name.toLowerCase(), exercise.id]),
          );

          const missingNames = namesToResolve.filter((name) => !existingByName.has(name.toLowerCase()));
          if (missingNames.length > 0) {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
              setSavingEdits(false);
              return;
            }

            const { data: insertedExercises } = await supabase
              .from('exercises')
              .insert(
                missingNames.map((name) => ({
                  name,
                  category: 'other',
                  primary_muscles: ['other'],
                  secondary_muscles: [],
                  is_custom: true,
                  user_id: user.id,
                })),
              )
              .select('id, name');

            for (const exercise of (insertedExercises || []) as { id: string; name: string }[]) {
              existingByName.set(exercise.name.toLowerCase(), exercise.id);
            }
          }

          for (const [tempId, exerciseName] of exerciseNameByTempId.entries()) {
            const resolvedId = existingByName.get(exerciseName.toLowerCase());
            if (resolvedId) {
              resolvedExerciseIds.set(tempId, resolvedId);
            }
          }
        }
      }

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

        const resolvedExerciseId = resolvedExerciseIds.get(draft.exerciseId) || draft.exerciseId;
        if (resolvedExerciseId.startsWith('new-exercise-')) continue;

        setsToInsert.push({
          workout_id: editingWorkout.id,
          exercise_id: resolvedExerciseId,
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

  function toDateAtNoonUtc(dateKey: string): string {
    return `${dateKey}T12:00:00.000Z`;
  }

  async function resolveExerciseCategories(exerciseIds: string[]): Promise<Record<string, string>> {
    if (exerciseIds.length === 0) return {};
    const { data } = await supabase
      .from('exercises')
      .select('id, category')
      .in('id', exerciseIds);

    const map: Record<string, string> = {};
    for (const row of (data || []) as Array<{ id: string; category: string | null }>) {
      map[row.id] = row.category || 'other';
    }
    return map;
  }

  function buildHydratedExercisesForWorkout(
    workout: HistoryWorkout,
    categoriesByExerciseId: Record<string, string>,
  ): HydratedExerciseInput[] {
    const grouped = new Map<string, { name: string; sets: WorkoutSet[] }>();
    for (const set of workout.sets) {
      if (!grouped.has(set.exercise_id)) {
        grouped.set(set.exercise_id, { name: set.exercises.name, sets: [] });
      }
      grouped.get(set.exercise_id)!.sets.push(set);
    }

    return Array.from(grouped.entries()).map(([exerciseId, group]) => {
      const sortedSets = [...group.sets].sort((a, b) => a.set_number - b.set_number);
      const logMode = sortedSets.some((set) => set.is_split_lr) ? 'split_lr' : 'combined';

      return {
        exerciseId,
        exerciseName: group.name,
        exerciseCategory: categoriesByExerciseId[exerciseId] || 'other',
        logMode,
        sets: sortedSets.map((set, index) => ({
          id: set.id,
          setNumber: index + 1,
          weight: set.weight,
          reps: set.reps,
          leftWeight: set.left_weight,
          leftReps: set.left_reps,
          rightWeight: set.right_weight,
          rightReps: set.right_reps,
          time: set.time,
          distance: set.distance,
          isWarmup: set.is_warmup,
          isCompleted: set.is_completed,
          timestamp: set.is_completed ? workout.end_time || workout.start_time : null,
        })),
      };
    });
  }

  async function launchWorkoutEditor(workout: HistoryWorkout) {
    const exerciseIds = Array.from(new Set(workout.sets.map((set) => set.exercise_id)));
    const categoriesByExerciseId = await resolveExerciseCategories(exerciseIds);
    const hydratedExercises = buildHydratedExercisesForWorkout(workout, categoriesByExerciseId);
    const fallbackEndTime = workout.end_time || new Date(new Date(workout.start_time).getTime() + 45 * 60 * 1000).toISOString();

    useActiveWorkoutStore.getState().hydrateWorkoutSession({
      workoutName: workout.name || formatAutoWorkoutName(workout.date),
      startTime: new Date().toISOString(),
      exercises: hydratedExercises,
      builderMode: 'calendar_edit',
      saveTargetWorkoutId: workout.id,
      saveTargetStartTime: workout.start_time,
      saveTargetEndTime: fallbackEndTime,
    });

    const state = useActiveWorkoutStore.getState();
    if (!state.workoutId) return;
    onClose();
    router.push(`/workout/${state.workoutId}`);
  }

  async function handleAddWorkoutForDate(dateKey: string) {
    if (creatingWorkoutDate) return;

    setCreatingWorkoutDate(dateKey);
    try {
      const startIso = toDateAtNoonUtc(dateKey);
      const endIso = new Date(new Date(startIso).getTime() + 45 * 60 * 1000).toISOString();
      useActiveWorkoutStore.getState().hydrateWorkoutSession({
        workoutName: formatAutoWorkoutName(startIso),
        startTime: new Date().toISOString(),
        exercises: [],
        builderMode: 'calendar_add',
        saveTargetStartTime: startIso,
        saveTargetEndTime: endIso,
      });

      const state = useActiveWorkoutStore.getState();
      if (!state.workoutId) return;
      onClose();
      router.push(`/workout/${state.workoutId}`);
    } finally {
      setCreatingWorkoutDate(null);
    }
  }

  const highlightedDates = Array.from(new Set(workouts.map((w) => toDateKey(w.date))))
    .map((dateKey) => new Date(`${dateKey}T12:00:00`))
    .filter((date) => !Number.isNaN(date.getTime()));
  const selectedDateValue = selectedDate ? new Date(`${selectedDate}T12:00:00`) : undefined;
  const selectedWorkouts = selectedDate ? getWorkoutsForDate(selectedDate) : [];
  const editableGroups = getEditableExerciseGroups();

  return (
    <div className="fixed inset-x-0 top-0 bottom-[calc(env(safe-area-inset-bottom)+84px)] z-[70] flex flex-col bg-background lg:absolute lg:inset-x-0 lg:top-0 lg:bottom-[calc(env(safe-area-inset-bottom)+84px)]">
      <Modal isOpen={!!editingWorkout} onClose={closeEditOverlay} title="Edit Workout">
        {editingWorkout && (
          <div className="space-y-4 text-sm">
            <div>
              <label className="mb-1 block text-sm font-medium text-muted-foreground">Workout Name</label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
                placeholder="Workout"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-muted-foreground">Date</label>
              <Input
                type="date"
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-muted-foreground">Sets</p>
                <Button variant="ghost"
                  type="button"
                  onClick={() => addExerciseGroup()}
                  className="text-xs font-medium text-primary hover:text-primary/80"
                >
                  + Add Exercise
                </Button>
              </div>
              <div className="max-h-[42vh] space-y-3 overflow-y-auto rounded-lg border border-border bg-background px-3 py-2">
                {editableGroups.length === 0 && (
                  <p className="text-xs text-muted-foreground py-3">
                    No exercises yet. Add an exercise to log this workout.
                  </p>
                )}
                {editableGroups.map((group) => (
                  <div key={group.exerciseId}>
                    <div className="flex items-center justify-between mb-1.5 gap-2">
                      <p className="text-xs font-semibold text-foreground">{group.name}</p>
                      <Button variant="ghost"
                        type="button"
                        onClick={() => addSetDraft(group.exerciseId, group.name)}
                        className="text-xs font-medium text-primary hover:text-primary/80"
                      >
                        + Add Set
                      </Button>
                    </div>
                    <div className="space-y-1.5">
                      {group.sets.map((set, idx) => (
                        <div key={set.localId} className="grid grid-cols-[56px,1fr,1fr,74px] gap-2 items-center">
                          <span className="text-xs text-muted-foreground">Set {idx + 1}</span>
                          <Input
                            value={set.weight}
                            onChange={(e) => updateEditSetField(group.exerciseId, set.localId, 'weight', e.target.value)}
                            placeholder={`Weight (${unit})`}
                            className="rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs text-foreground"
                            disabled={set.isSplit || set.time !== null}
                          />
                          <Input
                            value={set.reps}
                            onChange={(e) => updateEditSetField(group.exerciseId, set.localId, 'reps', e.target.value)}
                            placeholder="Reps"
                            className="rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs text-foreground"
                            disabled={set.isSplit || set.time !== null}
                          />
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost"
                              type="button"
                              onClick={() => moveSetDraft(group.exerciseId, set.localId, 'up')}
                              className="w-6 h-6 rounded-md border border-border text-muted-foreground hover:text-foreground"
                              aria-label="Move set up"
                            >
                              ↑
                            </Button>
                            <Button variant="ghost"
                              type="button"
                              onClick={() => moveSetDraft(group.exerciseId, set.localId, 'down')}
                              className="w-6 h-6 rounded-md border border-border text-muted-foreground hover:text-foreground"
                              aria-label="Move set down"
                            >
                              ↓
                            </Button>
                            <Button variant="ghost"
                              type="button"
                              onClick={() => removeSetDraft(group.exerciseId, set.localId)}
                              className="w-6 h-6 rounded-md border border-border text-muted-foreground hover:text-destructive"
                              aria-label="Remove set"
                            >
                              ×
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                    {group.sets.some((set) => set.isSplit || set.time !== null) && (
                      <p className="mt-1 text-xs text-muted-foreground">Split/timed sets are read-only for weight/reps but can be reordered or removed.</p>
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
          <h1 className="text-xl font-semibold tracking-tight">Calendar</h1>
          <p className="text-sm text-muted-foreground">View and edit past workout sessions.</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onClose}
          className="h-10 w-10 rounded-full p-0"
          aria-label="Close calendar overlay"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </Button>
      </div>

      {/* Streak Stats */}
      <div className="px-5 py-4">
        <div className="rounded-xl border bg-card px-4 py-4 shadow-sm flex items-center justify-around">
          <div className="text-center">
            <p className="text-2xl font-semibold text-foreground">{longestStreak}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Best Streak</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-semibold text-foreground">{currentStreak}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Current Streak</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-semibold text-foreground">{totalWorkouts}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Total Sessions</p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground text-center mt-3">
          {currentStreak > 0
            ? `${currentStreak}-day streak active. Keep the run going today.`
            : 'No active streak. One workout today starts a new streak.'}
        </p>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-5 pt-4 pb-8">
        {loading ? (
          <p className="text-muted-foreground text-sm text-center py-8">Loading...</p>
        ) : (
          <div>
            {/* Calendar Card */}
            <div className="rounded-xl border bg-card p-4 shadow-sm">
              <Calendar
                className="mx-auto w-fit"
                month={currentMonth}
                mode="single"
                onMonthChange={(month) => {
                  setCurrentMonth(month);
                  setSelectedDate(null);
                }}
                selected={selectedDateValue}
                highlighted={highlightedDates}
                onSelect={(date) => {
                  if (!date) {
                    setSelectedDate(null);
                    return;
                  }
                  const dateKey = formatDateKey(date.getFullYear(), date.getMonth(), date.getDate());
                  setSelectedDate((prev) => (prev === dateKey ? null : dateKey));
                }}
              />
            </div>

            {/* Selected date details */}
            {selectedDate && selectedWorkouts.length > 0 && (
              <div className="mt-4">
                <h3 className="mb-3 text-sm font-medium text-muted-foreground">
                  {new Date(selectedDate + 'T12:00:00').toLocaleDateString(undefined, {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                  })}
                </h3>
                <div className="space-y-3">
                  {selectedWorkouts.map((w) => {
                    const exerciseSummaries = buildExerciseSetSummaries(
                      w.sets.map((set) => ({
                        exerciseId: set.exercise_id,
                        exerciseName: set.exercises.name,
                        setNumber: set.set_number,
                        weight: set.weight,
                        reps: set.reps,
                        isSplitLR: set.is_split_lr,
                        leftWeight: set.left_weight,
                        leftReps: set.left_reps,
                        rightWeight: set.right_weight,
                        rightReps: set.right_reps,
                        time: set.time,
                      })),
                      unitSystem,
                    );
                    const duration = w.end_time
                      ? Math.floor((new Date(w.end_time).getTime() - new Date(w.start_time).getTime()) / 1000)
                      : 0;

                    return (
                      <div
                        key={w.id}
                        className="rounded-xl border bg-card p-4 text-left"
                      >
                        <div className="mb-2 flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <button
                              type="button"
                              onClick={() => void launchWorkoutEditor(w)}
                              className="block max-w-full break-words text-left text-sm font-semibold text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                              aria-label={`Edit ${w.name || formatAutoWorkoutName(w.date)}`}
                            >
                              {w.name || formatAutoWorkoutName(w.date)}
                            </button>
                            <p className="mt-0.5 text-xs text-muted-foreground">{formatRelativeDate(w.date)}</p>
                          </div>
                          {duration > 0 && (
                            <span className="shrink-0 rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">{formatDuration(duration)}</span>
                          )}
                        </div>
                        <ExerciseSetSummaryList summaries={exerciseSummaries} emptyText="No exercises logged." />
                      </div>
                    );
                  })}
                </div>
                <div className="mt-3">
                  <Button
                    size="sm"
                    onClick={() => handleAddWorkoutForDate(selectedDate)}
                    loading={creatingWorkoutDate === selectedDate}
                  >
                    Add Workout
                  </Button>
                </div>
              </div>
            )}

            {selectedDate && selectedWorkouts.length === 0 && (
              <div className="mt-4 rounded-xl border bg-card p-5 text-center shadow-sm">
                <p className="text-sm text-foreground mb-2">
                  No workouts logged for this date.
                </p>
                <Button
                  size="sm"
                  onClick={() => handleAddWorkoutForDate(selectedDate)}
                  loading={creatingWorkoutDate === selectedDate}
                >
                  Add Workout
                </Button>
              </div>
            )}

            {/* No date selected hint */}
            {!selectedDate && (
              <p className="text-xs text-muted-foreground text-center mt-4">Tap any day to view or add workouts</p>
            )}
            {!selectedDate && workouts.length === 0 && onStartWorkout && (
              <div className="mt-4 text-center">
                <p className="text-xs text-muted-foreground mb-2">No workouts yet. Add one from the calendar or start a live workout.</p>
                <Button onClick={onStartWorkout} size="sm">
                  Start Workout
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
