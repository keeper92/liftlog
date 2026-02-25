'use client';

import { useEffect, useState, useCallback, useRef, useMemo, type ReactNode, type TouchEvent as ReactTouchEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useActiveWorkoutStore, type ActiveSet, type ActiveWorkoutState, type PerformanceSet } from '@/stores/activeWorkoutStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { ChevronDown } from 'lucide-react';
import {
  formatDuration,
  toDisplayWeight,
  weightUnit,
  formatTimeInput,
  distanceUnit,
  toDisplayDistance,
  calculatePace,
} from '@/lib/utils/units';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import Card from '@/components/ui/Card';
import { NumberPadProvider, useNumberPad } from '@/components/workout/NumberPadContext';
import SetInputCell from '@/components/workout/SetInputCell';
import NumberPad from '@/components/workout/NumberPad';
import ExercisePickerOverlay from '@/components/workout/ExercisePickerOverlay';
import PRToast from '@/components/workout/PRToast';
import { usePRStore } from '@/stores/prStore';
import { detectPRs, type PRDetectionResult } from '@/lib/utils/prDetection';
import { isAssistanceExerciseName } from '@/lib/utils/exerciseSemantics';
import { uploadWorkoutSnapshot, withTimeout, type WorkoutUploadSnapshot } from '@/lib/sync/workoutUpload';
import { useWorkoutOutboxStore } from '@/stores/workoutOutboxStore';

interface HistoryEntry {
  date: string;
  sets: {
    weight: number | null;
    reps: number | null;
    left_weight: number | null;
    left_reps: number | null;
    right_weight: number | null;
    right_reps: number | null;
    is_split_lr: boolean;
    set_number: number;
  }[];
}

interface ExerciseDetails {
  id: string;
  name: string;
  instructions: string[];
  equipment: string | null;
  level: string | null;
  primary_muscles: string[];
  secondary_muscles: string[];
}

interface RestTimerState {
  isActive: boolean;
  secondsRemaining: number;
  totalSeconds: number;
  endsAt: number | null;
}

const REST_TIMER_STORAGE_KEY = 'active-rest-timer-v1';
const FINISH_TIMEOUT_MS = 15000;

function buildWorkoutUploadSnapshot(state: ActiveWorkoutState): WorkoutUploadSnapshot | null {
  if (!state.workoutId || !state.startTime) return null;
  return {
    workoutId: state.workoutId,
    workoutName: state.workoutName,
    startTime: state.startTime,
    templateId: state.templateId,
    exercises: state.exercises.map((exercise) => ({
      exerciseId: exercise.exerciseId,
      logMode: exercise.logMode,
      sets: exercise.sets.map((set) => ({
        setNumber: set.setNumber,
        weight: set.weight,
        reps: set.reps,
        leftWeight: set.leftWeight,
        leftReps: set.leftReps,
        rightWeight: set.rightWeight,
        rightReps: set.rightReps,
        time: set.time,
        distance: set.distance,
        isWarmup: set.isWarmup,
        isCompleted: set.isCompleted,
      })),
    })),
  };
}

interface PreviousPerformanceRow {
  id: string;
  weight: number | null;
  reps: number | null;
  left_weight: number | null;
  left_reps: number | null;
  right_weight: number | null;
  right_reps: number | null;
  is_split_lr: boolean | null;
  set_number: number | null;
}

interface PRToastEntry {
  exerciseName: string;
  metric: 'weight' | 'reps';
  previousValue: number;
  newValue: number;
  direction: 'higher' | 'lower';
}

interface PendingSetDelete {
  exerciseIndex: number;
  exerciseId: string;
  exerciseName: string;
  setIndex: number;
  set: ActiveSet;
}

interface ExerciseMenuState {
  exerciseKey: string;
  exerciseId: string;
  exerciseName: string;
  exerciseIndex: number;
}

function normalizePreviousPerformanceRow(row: PreviousPerformanceRow): PerformanceSet | null {
  const splitWeight = Math.max(row.left_weight ?? 0, row.right_weight ?? 0);
  const splitReps = Math.max(row.left_reps ?? 0, row.right_reps ?? 0);
  const weight = row.weight ?? (row.is_split_lr ? splitWeight : 0);
  const reps = row.reps ?? (row.is_split_lr ? splitReps : 0);

  if (weight <= 0 && reps <= 0) return null;

  return {
    weight,
    reps,
    setNumber: row.set_number || undefined,
  };
}

function getPreviousSetForNumber(sets: PerformanceSet[], setNumber: number) {
  return sets.find((s) => s.setNumber === setNumber) ?? sets[setNumber - 1];
}

function prefillEmptySetsWithPreviousPerformance(
  exerciseId: string,
  previousSets: PerformanceSet[],
) {
  const state = useActiveWorkoutStore.getState();
  const exerciseIndex = state.exercises.findIndex((exercise) => exercise.exerciseId === exerciseId);
  if (exerciseIndex === -1) return;

  const exercise = state.exercises[exerciseIndex];
  for (let setIndex = 0; setIndex < exercise.sets.length; setIndex += 1) {
    const currentSet = exercise.sets[setIndex];
    if (currentSet.isCompleted || currentSet.timestamp) continue;

    const previousSet = getPreviousSetForNumber(previousSets, currentSet.setNumber);
    if (!previousSet) continue;

    const nextSetData: Partial<ActiveSet> = {};
    if (currentSet.weight === null) nextSetData.weight = previousSet.weight;
    if (currentSet.reps === null) nextSetData.reps = previousSet.reps;

    if (exercise.logMode === 'split_lr') {
      if (currentSet.leftWeight === null) nextSetData.leftWeight = previousSet.weight;
      if (currentSet.rightWeight === null) nextSetData.rightWeight = previousSet.weight;
      if (currentSet.leftReps === null) nextSetData.leftReps = previousSet.reps;
      if (currentSet.rightReps === null) nextSetData.rightReps = previousSet.reps;
    }

    if (Object.keys(nextSetData).length > 0) {
      state.updateSet(exerciseIndex, setIndex, nextSetData);
    }
  }
}

function WarmupToggle({ isWarmup, setNumber, onToggle }: { isWarmup: boolean; setNumber: number; onToggle: () => void }) {
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPress = useRef(false);

  function startPress() {
    didLongPress.current = false;
    pressTimer.current = setTimeout(() => {
      didLongPress.current = true;
      onToggle();
      if (navigator.vibrate) navigator.vibrate(40);
    }, 500);
  }

  function cancelPress() {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  }

  return (
    <Button variant="ghost"
      className={`w-10 h-10 flex items-center justify-center rounded-lg text-sm font-medium select-none touch-none ${
        isWarmup ? 'bg-primary/10 text-primary' : 'text-muted-foreground'
      }`}
      onPointerDown={startPress}
      onPointerUp={cancelPress}
      onPointerLeave={cancelPress}
      onPointerCancel={cancelPress}
      title="Hold to toggle warm-up set"
    >
      {isWarmup ? 'W' : setNumber}
    </Button>
  );
}

function SwipeToDeleteRow({
  enabled,
  onDelete,
  onSwipeIntent,
  showHint = false,
  children,
}: {
  enabled: boolean;
  onDelete: () => void;
  onSwipeIntent?: () => void;
  showHint?: boolean;
  children: ReactNode;
}) {
  const [offsetX, setOffsetX] = useState(0);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const axisRef = useRef<'x' | 'y' | null>(null);
  const swipingRef = useRef(false);
  const offsetRef = useRef(0);
  const swipeIntentNotifiedRef = useRef(false);

  const updateOffset = useCallback((next: number) => {
    offsetRef.current = next;
    setOffsetX(next);
  }, []);

  const resetSwipe = useCallback(() => {
    touchStartRef.current = null;
    axisRef.current = null;
    swipingRef.current = false;
    updateOffset(0);
  }, [updateOffset]);

  const handleTouchStart = useCallback((event: ReactTouchEvent<HTMLDivElement>) => {
    if (!enabled) return;
    const touch = event.touches[0];
    if (!touch) return;
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
    axisRef.current = null;
    swipingRef.current = false;
    swipeIntentNotifiedRef.current = false;
  }, [enabled]);

  const handleTouchMove = useCallback((event: ReactTouchEvent<HTMLDivElement>) => {
    if (!enabled || !touchStartRef.current) return;
    const touch = event.touches[0];
    if (!touch) return;

    const deltaX = touch.clientX - touchStartRef.current.x;
    const deltaY = touch.clientY - touchStartRef.current.y;

    if (axisRef.current === null) {
      if (Math.abs(deltaX) < 6 && Math.abs(deltaY) < 6) return;
      axisRef.current = Math.abs(deltaX) > Math.abs(deltaY) ? 'x' : 'y';
    }

    if (axisRef.current !== 'x') return;

    event.preventDefault();
    swipingRef.current = true;

    if (deltaX < -8 && !swipeIntentNotifiedRef.current) {
      swipeIntentNotifiedRef.current = true;
      onSwipeIntent?.();
    }

    if (deltaX >= 0) {
      updateOffset(Math.min(0, deltaX * 0.15));
      return;
    }

    updateOffset(Math.max(-96, deltaX));
  }, [enabled, onSwipeIntent, updateOffset]);

  const handleTouchEnd = useCallback(() => {
    if (!enabled) {
      resetSwipe();
      return;
    }

    const shouldDelete = swipingRef.current && offsetRef.current <= -72;
    if (shouldDelete) {
      updateOffset(-96);
      if (navigator.vibrate) navigator.vibrate(10);
      touchStartRef.current = null;
      axisRef.current = null;
      swipingRef.current = false;
      window.setTimeout(() => {
        onDelete();
      }, 120);
      return;
    }

    resetSwipe();
  }, [enabled, onDelete, resetSwipe, updateOffset]);

  const revealProgress = Math.min(Math.abs(offsetX) / 96, 1);
  const actionOpacity = enabled ? Math.max(0, (revealProgress - 0.08) / 0.92) : 0;

  return (
    <div className="relative mb-2 overflow-hidden rounded-lg">
      {enabled && (
        <div
          className="pointer-events-none absolute inset-y-0 right-0 flex items-center justify-end gap-1 px-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive transition-opacity duration-150"
          style={{ opacity: actionOpacity }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14H6L5 6" />
            <path d="M10 11v6M14 11v6" />
            <path d="M9 6V4h6v2" />
          </svg>
          {revealProgress > 0.72 && (
            <span className="text-xs font-medium">Release</span>
          )}
        </div>
      )}
      {enabled && showHint && revealProgress === 0 && (
        <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-muted-foreground/45">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </div>
      )}
      <div
        className="relative z-10 transition-transform duration-150 ease-out"
        style={{ transform: `translateX(${offsetX}px)`, touchAction: 'pan-y' }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={resetSwipe}
      >
        {children}
      </div>
    </div>
  );
}

export default function ActiveWorkoutPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const store = useActiveWorkoutStore();
  const unitSystem = useSettingsStore((s) => s.unitSystem);
  const [elapsed, setElapsed] = useState(0);
  const [saving, setSaving] = useState(false);
  const [deletingWorkout, setDeletingWorkout] = useState(false);
  const [historyModal, setHistoryModal] = useState<{ exerciseId: string; exerciseName: string } | null>(null);
  const [historyData, setHistoryData] = useState<HistoryEntry[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [restTimer, setRestTimer] = useState<RestTimerState>({ isActive: false, secondsRemaining: 0, totalSeconds: 0, endsAt: null });
  const [finishError, setFinishError] = useState<string | null>(null);
  const [tipsModal, setTipsModal] = useState<{ exerciseId: string; exerciseName: string } | null>(null);
  const [exerciseDetails, setExerciseDetails] = useState<ExerciseDetails | null>(null);
  const [loadingTips, setLoadingTips] = useState(false);
  const [trainingGuideMenu, setTrainingGuideMenu] = useState<ExerciseMenuState | null>(null);
  const [toastQueue, setToastQueue] = useState<PRToastEntry[]>([]);
  const exercises = store.exercises;
  const previousPerformance = store.previousPerformance;
  const setPreviousPerformance = store.setPreviousPerformance;

  const handlePRDetected = useCallback((exerciseName: string, pr: PRDetectionResult) => {
    setToastQueue((prev) => [
      ...prev,
      {
        exerciseName,
        metric: pr.metric,
        previousValue: pr.previousValue,
        newValue: pr.newValue,
        direction: pr.direction,
      },
    ]);
  }, []);

  const dismissToast = useCallback(() => {
    setToastQueue((prev) => prev.slice(1));
  }, []);

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
  }, [store.isActive, store.startTime, router]);

  // Rest timer countdown
  useEffect(() => {
    if (!restTimer.isActive || !restTimer.endsAt) return;

    const tick = () => {
      const nextSeconds = Math.max(0, Math.ceil((restTimer.endsAt as number - Date.now()) / 1000));
      if (nextSeconds <= 0) {
        if (typeof window !== 'undefined') {
          localStorage.removeItem(REST_TIMER_STORAGE_KEY);
        }
        setRestTimer({ isActive: false, secondsRemaining: 0, totalSeconds: 0, endsAt: null });
        return;
      }

      setRestTimer((prev) => {
        if (!prev.isActive || prev.endsAt !== restTimer.endsAt) return prev;
        if (prev.secondsRemaining === nextSeconds) return prev;
        return { ...prev, secondsRemaining: nextSeconds };
      });
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [restTimer.isActive, restTimer.endsAt]);

  // Restore active rest timer after app close/reopen.
  useEffect(() => {
    if (typeof window === 'undefined' || !store.workoutId) return;
    let restoreFrame: number | null = null;

    const raw = localStorage.getItem(REST_TIMER_STORAGE_KEY);
    if (!raw) return;

    type StoredRestTimer = { workoutId: string; endsAt: number; totalSeconds: number };

    try {
      const parsed = JSON.parse(raw) as StoredRestTimer;
      if (parsed.workoutId !== store.workoutId) {
        localStorage.removeItem(REST_TIMER_STORAGE_KEY);
        return;
      }

      const nextSeconds = Math.max(0, Math.ceil((parsed.endsAt - Date.now()) / 1000));
      if (nextSeconds <= 0) {
        localStorage.removeItem(REST_TIMER_STORAGE_KEY);
        return;
      }

      restoreFrame = window.requestAnimationFrame(() => {
        setRestTimer({
          isActive: true,
          secondsRemaining: nextSeconds,
          totalSeconds: parsed.totalSeconds,
          endsAt: parsed.endsAt,
        });
      });
    } catch {
      localStorage.removeItem(REST_TIMER_STORAGE_KEY);
    }

    return () => {
      if (restoreFrame !== null) {
        window.cancelAnimationFrame(restoreFrame);
      }
    };
  }, [store.workoutId]);

  const startRestTimer = useCallback((seconds: number) => {
    const endsAt = Date.now() + seconds * 1000;
    setRestTimer({ isActive: true, secondsRemaining: seconds, totalSeconds: seconds, endsAt });

    if (typeof window !== 'undefined' && store.workoutId) {
      localStorage.setItem(
        REST_TIMER_STORAGE_KEY,
        JSON.stringify({
          workoutId: store.workoutId,
          endsAt,
          totalSeconds: seconds,
        }),
      );
    }
  }, [store.workoutId]);

  const stopRestTimer = useCallback(() => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(REST_TIMER_STORAGE_KEY);
    }
    setRestTimer({ isActive: false, secondsRemaining: 0, totalSeconds: 0, endsAt: null });
  }, []);

  // Load previous performance for exercises
  useEffect(() => {
    let cancelled = false;

    async function fetchPerformanceHistory(userId: string, exerciseId: string): Promise<PerformanceSet[]> {
      const pageSize = 1000;
      let from = 0;
      const history: PerformanceSet[] = [];

      while (!cancelled) {
        const to = from + pageSize - 1;
        const { data, error } = await supabase
          .from('sets')
          .select('id, weight, reps, left_weight, left_reps, right_weight, right_reps, is_split_lr, set_number, workouts!inner(user_id, date)')
          .eq('exercise_id', exerciseId)
          .eq('workouts.user_id', userId)
          .eq('is_completed', true)
          .eq('is_warmup', false)
          .order('workouts(date)', { ascending: false })
          .order('set_number', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to);

        if (error || !data || data.length === 0) break;

        for (const row of data as unknown as PreviousPerformanceRow[]) {
          const normalized = normalizePreviousPerformanceRow(row);
          if (normalized) history.push(normalized);
        }

        if (data.length < pageSize) break;
        from += pageSize;
      }

      return history;
    }

    async function loadPrevious() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const missingExercises = exercises.filter((ex) => previousPerformance[ex.exerciseId] === undefined);

      for (const ex of missingExercises) {
        const history = await fetchPerformanceHistory(user.id, ex.exerciseId);
        if (cancelled) return;
        setPreviousPerformance(ex.exerciseId, history);
        prefillEmptySetsWithPreviousPerformance(ex.exerciseId, history);
      }
    }

    if (exercises.length > 0) loadPrevious();
    return () => {
      cancelled = true;
    };
  }, [exercises, previousPerformance, setPreviousPerformance, supabase]);

  const saveTemplateFromSnapshot = useCallback(async (userId: string, snapshot: WorkoutUploadSnapshot) => {
    if (snapshot.exercises.length === 0) {
      throw new Error('Add at least one exercise to save a template.');
    }

    const templateName = snapshot.workoutName.trim() || 'My Template';
    const exerciseOrder: string[] = [];
    const defaultSetsByExercise = new Map<string, number>();

    for (const exercise of snapshot.exercises) {
      if (!exerciseOrder.includes(exercise.exerciseId)) {
        exerciseOrder.push(exercise.exerciseId);
      }
      const nonWarmupSetCount = exercise.sets.filter((set) => !set.isWarmup).length;
      const fallbackSetCount = exercise.sets.length || 3;
      defaultSetsByExercise.set(
        exercise.exerciseId,
        Math.max(defaultSetsByExercise.get(exercise.exerciseId) ?? 0, nonWarmupSetCount || fallbackSetCount),
      );
    }

    const { data: template, error: templateError } = await withTimeout(
      supabase
        .from('workout_templates')
        .insert({ user_id: userId, name: templateName })
        .select('id')
        .single(),
      FINISH_TIMEOUT_MS,
      'Template save',
    );

    if (templateError || !template) {
      throw templateError ?? new Error('Could not create template.');
    }

    const templateExercises = exerciseOrder.map((exerciseId, index) => ({
      template_id: template.id,
      exercise_id: exerciseId,
      order_index: index,
      default_sets: Math.max(1, defaultSetsByExercise.get(exerciseId) || 3),
    }));

    const { error: exerciseError } = await withTimeout(
      supabase.from('template_exercises').insert(templateExercises),
      FINISH_TIMEOUT_MS,
      'Template exercise save',
    );

    if (exerciseError) {
      await supabase.from('workout_templates').delete().eq('id', template.id);
      throw exerciseError;
    }
  }, [supabase]);

  const handleFinish = useCallback(async () => {
    if (saving) return;
    setFinishError(null);
    stopRestTimer();
    setSaving(true);
    const snapshot = buildWorkoutUploadSnapshot(store);
    if (!snapshot) {
      setSaving(false);
      return;
    }

    const mode = store.builderMode;
    const isCalendarMode = mode === 'calendar_add' || mode === 'calendar_edit';
    const effectiveSnapshot: WorkoutUploadSnapshot = isCalendarMode
      ? {
          ...snapshot,
          workoutId: store.saveTargetWorkoutId || snapshot.workoutId,
          startTime: store.saveTargetStartTime || snapshot.startTime,
          endTime:
            store.saveTargetEndTime ||
            new Date((store.saveTargetStartTime || snapshot.startTime)).toISOString(),
        }
      : snapshot;

    let currentUserId: string | null = null;

    try {
      const {
        data: { user },
        error: userError,
      } = await withTimeout(supabase.auth.getUser(), FINISH_TIMEOUT_MS, 'Auth');
      if (userError || !user) {
        throw new Error('Unable to verify your account. Please try again.');
      }
      currentUserId = user.id;

      if (mode === 'template_builder') {
        await saveTemplateFromSnapshot(user.id, snapshot);
        usePRStore.getState().clearFiredNotifications();
        store.discardWorkout();
        router.push('/dashboard');
        return;
      }

      await uploadWorkoutSnapshot(supabase, user.id, effectiveSnapshot, FINISH_TIMEOUT_MS);

      usePRStore.getState().clearFiredNotifications();
      store.discardWorkout();

      if (isCalendarMode) {
        router.push('/dashboard');
        return;
      }

      const summaryUrl = effectiveSnapshot.templateId
        ? `/workout/summary/${effectiveSnapshot.workoutId}?templateId=${effectiveSnapshot.templateId}`
        : `/workout/summary/${effectiveSnapshot.workoutId}`;
      router.push(summaryUrl);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unable to save workout right now.';
      if (mode === 'template_builder') {
        setFinishError(errorMessage);
        setSaving(false);
        return;
      }
      if (!currentUserId) {
        try {
          const {
            data: { session },
          } = await supabase.auth.getSession();
          currentUserId = session?.user?.id ?? null;
        } catch {
          currentUserId = null;
        }
      }
      try {
        useWorkoutOutboxStore.getState().enqueue(effectiveSnapshot, errorMessage, currentUserId);
        usePRStore.getState().clearFiredNotifications();
        store.discardWorkout();
        setSaving(false);
        router.push('/dashboard');
      } catch (queueError) {
        const queueMessage = queueError instanceof Error ? queueError.message : 'local queue unavailable';
        const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
        const fallbackMessage = offline
          ? 'Could not queue workout while offline. Your workout remains open on this screen.'
          : 'Could not save or queue workout right now. Your workout remains open on this screen.';
        setFinishError(`${fallbackMessage} (${errorMessage}; ${queueMessage})`);
        setSaving(false);
      }
    }
  }, [saving, stopRestTimer, store, supabase, router, saveTemplateFromSnapshot]);

  const handleDiscard = useCallback(() => {
    const confirmMessage = store.builderMode === 'template_builder'
      ? 'Discard this template draft? Your template changes will be lost.'
      : store.builderMode === 'calendar_edit'
        ? 'Close without saving changes to this workout?'
        : 'Discard this workout? All progress will be lost.';
    if (window.confirm(confirmMessage)) {
      stopRestTimer();
      setFinishError(null);
      usePRStore.getState().clearFiredNotifications();
      store.discardWorkout();
      router.push('/dashboard');
    }
  }, [store, router, stopRestTimer]);

  const handleDeleteSavedWorkout = useCallback(async () => {
    if (store.builderMode !== 'calendar_edit') return;
    const targetWorkoutId = store.saveTargetWorkoutId;
    if (!targetWorkoutId) {
      setFinishError('Missing saved workout reference. Please return to calendar and try again.');
      return;
    }

    if (!window.confirm('Delete this workout? This cannot be undone.')) return;

    stopRestTimer();
    setFinishError(null);
    setDeletingWorkout(true);
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user) {
        throw new Error('Unable to verify your account. Please try again.');
      }

      const { error: deleteError } = await supabase
        .from('workouts')
        .delete()
        .eq('id', targetWorkoutId)
        .eq('user_id', user.id);

      if (deleteError) {
        throw new Error(deleteError.message || 'Unable to delete workout.');
      }

      usePRStore.getState().clearFiredNotifications();
      store.discardWorkout();
      router.push('/dashboard');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to delete workout.';
      setFinishError(message);
    } finally {
      setDeletingWorkout(false);
    }
  }, [router, stopRestTimer, store, supabase]);

  const finishLabel = store.builderMode === 'template_builder'
    ? 'Save Template'
    : store.builderMode === 'standard'
      ? 'Finish'
      : 'Save';

  async function openTrainerTips(exerciseId: string, exerciseName: string) {
    setTipsModal({ exerciseId, exerciseName });
    setLoadingTips(true);
    setExerciseDetails(null);

    const { data } = await supabase
      .from('exercises')
      .select('id, name, instructions, equipment, level, primary_muscles, secondary_muscles')
      .eq('id', exerciseId)
      .single();

    if (data) {
      setExerciseDetails(data as ExerciseDetails);
    }
    setLoadingTips(false);
  }

  async function openHistory(exerciseId: string, exerciseName: string) {
    setHistoryModal({ exerciseId, exerciseName });
    setLoadingHistory(true);
    setHistoryData([]);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoadingHistory(false);
      return;
    }

    const { data } = await supabase
      .from('sets')
      .select('weight, reps, left_weight, left_reps, right_weight, right_reps, is_split_lr, set_number, is_warmup, workouts!inner(id, date, user_id)')
      .eq('exercise_id', exerciseId)
      .eq('workouts.user_id', user.id)
      .eq('is_completed', true)
      .order('workouts(date)', { ascending: false });

    if (data) {
      const workoutMap = new Map<string, { date: string; sets: typeof data }>();
      for (const row of data) {
        const workout = row.workouts as unknown as { id: string; date: string };
        const workoutId = workout.id;
        const date = workout.date;
        if (!workoutMap.has(workoutId)) {
          workoutMap.set(workoutId, { date, sets: [] });
        }
        workoutMap.get(workoutId)!.sets.push(row);
      }

      const history: HistoryEntry[] = Array.from(workoutMap.values())
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .map((w) => ({
          date: w.date,
          sets: w.sets
            .filter((s) => !s.is_warmup)
            .sort((a, b) => a.set_number - b.set_number)
            .map((s) => ({
              weight: s.weight,
              reps: s.reps,
              left_weight: s.left_weight,
              left_reps: s.left_reps,
              right_weight: s.right_weight,
              right_reps: s.right_reps,
              is_split_lr: s.is_split_lr || false,
              set_number: s.set_number,
            })),
        }));

      setHistoryData(history);
    }
    setLoadingHistory(false);
  }

  if (!store.isActive) return null;

  return (
    <NumberPadProvider startRestTimer={startRestTimer} onPRDetected={handlePRDetected}>
      <WorkoutContent
        store={store}
        unitSystem={unitSystem}
        elapsed={elapsed}
        saving={saving}
        deletingWorkout={deletingWorkout}
        restTimer={restTimer}
        stopRestTimer={stopRestTimer}
        startRestTimer={startRestTimer}
        handleFinish={handleFinish}
        handleDiscard={handleDiscard}
        handleDeleteSavedWorkout={handleDeleteSavedWorkout}
        openTrainerTips={openTrainerTips}
        openHistory={openHistory}
        historyModal={historyModal}
        setHistoryModal={setHistoryModal}
        historyData={historyData}
        loadingHistory={loadingHistory}
        trainingGuideMenu={trainingGuideMenu}
        setTrainingGuideMenu={setTrainingGuideMenu}
        tipsModal={tipsModal}
        setTipsModal={setTipsModal}
        exerciseDetails={exerciseDetails}
        loadingTips={loadingTips}
        router={router}
        toastQueue={toastQueue}
        dismissToast={dismissToast}
        finishError={finishError}
        onPRDetected={handlePRDetected}
        finishLabel={finishLabel}
      />
    </NumberPadProvider>
  );
}

function WorkoutContent({
  store,
  unitSystem,
  elapsed,
  saving,
  deletingWorkout,
  restTimer,
  stopRestTimer,
  startRestTimer,
  handleFinish,
  handleDiscard,
  handleDeleteSavedWorkout,
  openTrainerTips,
  openHistory,
  historyModal,
  setHistoryModal,
  historyData,
  loadingHistory,
  trainingGuideMenu,
  setTrainingGuideMenu,
  tipsModal,
  setTipsModal,
  exerciseDetails,
  loadingTips,
  router,
  toastQueue,
  dismissToast,
  finishError,
  onPRDetected,
  finishLabel,
}: {
  store: ActiveWorkoutState;
  unitSystem: 'imperial' | 'metric';
  elapsed: number;
  saving: boolean;
  deletingWorkout: boolean;
  restTimer: RestTimerState;
  stopRestTimer: () => void;
  startRestTimer: (seconds: number) => void;
  handleFinish: () => void;
  handleDiscard: () => void;
  handleDeleteSavedWorkout: () => void;
  openTrainerTips: (exerciseId: string, exerciseName: string) => void;
  openHistory: (exerciseId: string, exerciseName: string) => void;
  historyModal: { exerciseId: string; exerciseName: string } | null;
  setHistoryModal: (v: { exerciseId: string; exerciseName: string } | null) => void;
  historyData: HistoryEntry[];
  loadingHistory: boolean;
  trainingGuideMenu: ExerciseMenuState | null;
  setTrainingGuideMenu: (v: ExerciseMenuState | null) => void;
  tipsModal: { exerciseId: string; exerciseName: string } | null;
  setTipsModal: (v: { exerciseId: string; exerciseName: string } | null) => void;
  exerciseDetails: ExerciseDetails | null;
  loadingTips: boolean;
  router: ReturnType<typeof useRouter>;
  toastQueue: PRToastEntry[];
  dismissToast: () => void;
  finishError: string | null;
  onPRDetected: (exerciseName: string, pr: PRDetectionResult) => void;
  finishLabel: string;
}) {
  const { activeFocus, deactivate } = useNumberPad();
  const numberPadVisible = activeFocus !== null;
  const [showExercisePicker, setShowExercisePicker] = useState(false);
  const [pendingSetDelete, setPendingSetDelete] = useState<PendingSetDelete | null>(null);
  const [showSwipeDeleteHint, setShowSwipeDeleteHint] = useState(true);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Drag-to-reorder state
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const exerciseRefs = useRef<(HTMLDivElement | null)[]>([]);
  const exerciseMenuRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const touchStartY = useRef(0);
  const mouseDragCleanupRef = useRef<(() => void) | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  const clearMouseDragListeners = useCallback(() => {
    if (!mouseDragCleanupRef.current) return;
    mouseDragCleanupRef.current();
    mouseDragCleanupRef.current = null;
  }, []);

  function handleDragStart(index: number, clientY: number) {
    setDragIndex(index);
    setDragOverIndex(index);
    touchStartY.current = clientY;
    // Haptic feedback if available
    if (navigator.vibrate) navigator.vibrate(30);
  }

  function handleDragMove(clientY: number) {
    if (dragIndex === null) return;
    // Find which exercise card the touch is over
    for (let i = 0; i < exerciseRefs.current.length; i++) {
      const el = exerciseRefs.current[i];
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (clientY >= rect.top && clientY <= rect.bottom) {
        setDragOverIndex(i);
        return;
      }
    }
  }

  function handleDragEnd() {
    if (dragIndex !== null && dragOverIndex !== null && dragIndex !== dragOverIndex) {
      store.moveExercise(dragIndex, dragOverIndex);
    }
    clearMouseDragListeners();
    setDragIndex(null);
    setDragOverIndex(null);
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  function cancelDrag() {
    clearMouseDragListeners();
    setDragIndex(null);
    setDragOverIndex(null);
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  const clearPendingDelete = useCallback(() => {
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
    setPendingSetDelete(null);
  }, []);

  const handleDeleteSet = useCallback((exerciseIndex: number, setIndex: number) => {
    const state = useActiveWorkoutStore.getState();
    const exercise = state.exercises[exerciseIndex];
    if (!exercise || exercise.exerciseCategory === 'cardio') return;
    if (exercise.sets.length <= 1) return;

    const setToDelete = exercise.sets[setIndex];
    if (!setToDelete) return;

    if (activeFocus && activeFocus.exerciseIndex === exerciseIndex) {
      deactivate();
    }

    setShowSwipeDeleteHint(false);
    clearPendingDelete();
    state.removeSet(exerciseIndex, setIndex);
    setPendingSetDelete({
      exerciseIndex,
      exerciseId: exercise.exerciseId,
      exerciseName: exercise.exerciseName,
      setIndex,
      set: { ...setToDelete },
    });

    undoTimerRef.current = setTimeout(() => {
      undoTimerRef.current = null;
      setPendingSetDelete(null);
    }, 5000);
  }, [activeFocus, clearPendingDelete, deactivate]);

  const handleUndoDeleteSet = useCallback(() => {
    if (!pendingSetDelete) return;
    const state = useActiveWorkoutStore.getState();
    const preferredExercise = state.exercises[pendingSetDelete.exerciseIndex];
    const exerciseIndex = preferredExercise?.exerciseId === pendingSetDelete.exerciseId
      ? pendingSetDelete.exerciseIndex
      : state.exercises.findIndex((exercise) => exercise.exerciseId === pendingSetDelete.exerciseId);
    if (exerciseIndex === -1) {
      clearPendingDelete();
      return;
    }

    if (activeFocus && activeFocus.exerciseIndex === exerciseIndex) {
      deactivate();
    }

    const exercise = state.exercises[exerciseIndex];
    const insertAt = Math.max(0, Math.min(pendingSetDelete.setIndex, exercise.sets.length));
    state.insertSet(exerciseIndex, insertAt, pendingSetDelete.set);
    clearPendingDelete();
  }, [activeFocus, clearPendingDelete, deactivate, pendingSetDelete]);

  useEffect(() => () => {
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    clearMouseDragListeners();
  }, [clearMouseDragListeners]);

  const unit = weightUnit(unitSystem);
  const menuExerciseIndex = trainingGuideMenu
    ? (() => {
        const indexed = store.exercises[trainingGuideMenu.exerciseIndex];
        if (indexed?.exerciseId === trainingGuideMenu.exerciseId) {
          return trainingGuideMenu.exerciseIndex;
        }
        return store.exercises.findIndex((exercise) => exercise.exerciseId === trainingGuideMenu.exerciseId);
      })()
    : -1;
  const menuExercise = menuExerciseIndex >= 0 ? store.exercises[menuExerciseIndex] : null;
  const canToggleSplitMode = !!menuExercise && menuExercise.exerciseCategory !== 'cardio';
  const isCalendarEditMode = store.builderMode === 'calendar_edit';
  const dismissLabel = isCalendarEditMode ? 'Close' : 'Discard';

  useEffect(() => {
    if (!trainingGuideMenu) return;

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const activeContainer = exerciseMenuRefs.current[trainingGuideMenu.exerciseKey];
      const target = event.target as Node | null;
      if (!activeContainer || !target) return;
      if (!activeContainer.contains(target)) {
        setTrainingGuideMenu(null);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setTrainingGuideMenu(null);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown, { passive: true });
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [trainingGuideMenu, setTrainingGuideMenu]);

  return (
    <div
      className="relative flex min-h-dvh flex-col bg-background"
      onTouchEnd={() => { if (dragIndex !== null) handleDragEnd(); }}
      onTouchCancel={cancelDrag}
    >
      {/* PR Toast */}
      {toastQueue.length > 0 && (
        <PRToast
          key={`${toastQueue[0].exerciseName}-${toastQueue[0].metric}-${toastQueue[0].newValue}`}
          exerciseName={toastQueue[0].exerciseName}
          metric={toastQueue[0].metric}
          previousValue={toastQueue[0].previousValue}
          newValue={toastQueue[0].newValue}
          direction={toastQueue[0].direction}
          unitSystem={unitSystem}
          onDismiss={dismissToast}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-card border-b border-border">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            onClick={handleDiscard}
            disabled={saving || deletingWorkout}
            className={`min-h-[44px] px-2 text-sm font-medium ${
              isCalendarEditMode ? 'text-foreground' : 'text-destructive'
            }`}
          >
            {dismissLabel}
          </Button>
          {isCalendarEditMode && (
            <Button
              variant="ghost"
              onClick={handleDeleteSavedWorkout}
              loading={deletingWorkout}
              disabled={saving}
              aria-label="Delete workout"
              className="h-9 w-9 rounded-md p-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                <path d="M10 11v6" />
                <path d="M14 11v6" />
                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
              </svg>
            </Button>
          )}
        </div>
        <div className="text-center">
          <p className="font-semibold text-sm">{store.workoutName}</p>
          <p className="text-xs text-muted-foreground">{formatDuration(elapsed)}</p>
        </div>
        <Button variant="primary" size="sm" onClick={handleFinish} loading={saving} disabled={deletingWorkout}>
          {finishLabel}
        </Button>
      </div>
      {finishError && (
        <div className="border-b border-destructive/20 bg-destructive/10 px-4 py-2 text-xs text-destructive">
          {finishError}
        </div>
      )}

      {/* Exercise List */}
      <div ref={scrollContainerRef} className={`flex-1 overflow-y-auto px-4 py-4 space-y-6 ${numberPadVisible ? 'pb-64' : 'pb-20'}`}>
        {store.exercises.map((ex, exIdx) => {
          const prev = store.previousPerformance[ex.exerciseId] || [];
          const isAssistanceExercise = isAssistanceExerciseName(ex.exerciseName);
          const isDragging = dragIndex === exIdx;
          const isDragOver = dragOverIndex === exIdx && dragIndex !== null && dragIndex !== exIdx;
          const exerciseKey = `${ex.exerciseId}-${exIdx}`;
          const isMenuOpen = trainingGuideMenu?.exerciseKey === exerciseKey;
          return (
            <div
              key={exerciseKey}
              ref={(el) => { exerciseRefs.current[exIdx] = el; }}
              className={`bg-card rounded-xl p-4 transition-all duration-150 ${
                isDragging ? 'opacity-50 scale-[0.98]' : ''
              } ${isDragOver ? 'ring-2 ring-primary ring-offset-2' : ''}`}
            >
              <div className="flex items-start justify-between mb-3 gap-2">
                <div className="flex items-start gap-2 min-w-0">
                  {/* Drag handle — long press to reorder */}
                  <div
                    className="flex items-center justify-center w-8 h-10 -ml-1 cursor-grab active:cursor-grabbing touch-none"
                    onTouchStart={(e) => {
                      const touch = e.touches[0];
                      touchStartY.current = touch.clientY;
                      if (longPressTimer.current) {
                        clearTimeout(longPressTimer.current);
                        longPressTimer.current = null;
                      }
                      longPressTimer.current = setTimeout(() => {
                        handleDragStart(exIdx, touchStartY.current);
                      }, 300);
                    }}
                    onTouchMove={(e) => {
                      if (dragIndex === null && longPressTimer.current) {
                        // Cancel long press only after meaningful movement so jitter doesn't break drag.
                        if (Math.abs(e.touches[0].clientY - touchStartY.current) > 8) {
                          clearTimeout(longPressTimer.current);
                          longPressTimer.current = null;
                        }
                      }
                      if (dragIndex !== null) {
                        e.preventDefault();
                        handleDragMove(e.touches[0].clientY);
                      }
                    }}
                    onTouchEnd={() => {
                      if (longPressTimer.current) {
                        clearTimeout(longPressTimer.current);
                        longPressTimer.current = null;
                      }
                      if (dragIndex !== null) handleDragEnd();
                    }}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      clearMouseDragListeners();
                      handleDragStart(exIdx, e.clientY);

                      const handleMouseMove = (moveEvent: MouseEvent) => {
                        moveEvent.preventDefault();
                        handleDragMove(moveEvent.clientY);
                      };

                      const handleMouseUp = () => {
                        handleDragEnd();
                      };

                      window.addEventListener('mousemove', handleMouseMove);
                      window.addEventListener('mouseup', handleMouseUp, { once: true });
                      mouseDragCleanupRef.current = () => {
                        window.removeEventListener('mousemove', handleMouseMove);
                        window.removeEventListener('mouseup', handleMouseUp);
                      };
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="text-muted-foreground">
                      <circle cx="9" cy="6" r="1.5" />
                      <circle cx="15" cy="6" r="1.5" />
                      <circle cx="9" cy="12" r="1.5" />
                      <circle cx="15" cy="12" r="1.5" />
                      <circle cx="9" cy="18" r="1.5" />
                      <circle cx="15" cy="18" r="1.5" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-foreground">{ex.exerciseName}</h3>
                    {isAssistanceExercise && (
                      <div className="mt-1">
                        <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs text-primary">
                          Assistance (lower = harder)
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                <div
                  ref={(el) => {
                    exerciseMenuRefs.current[exerciseKey] = el;
                  }}
                  className="relative flex items-center shrink-0"
                >
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setTrainingGuideMenu(
                        isMenuOpen
                          ? null
                          : {
                              exerciseKey,
                              exerciseId: ex.exerciseId,
                              exerciseName: ex.exerciseName,
                              exerciseIndex: exIdx,
                            },
                      );
                    }}
                    aria-label={`Open options for ${ex.exerciseName}`}
                    aria-expanded={isMenuOpen}
                    className="h-8 w-8 rounded-md border border-border bg-background p-0 text-foreground hover:bg-accent"
                  >
                    <ChevronDown
                      size={18}
                      aria-hidden="true"
                      className={isMenuOpen ? 'rotate-180 text-foreground transition-transform' : 'text-foreground transition-transform'}
                    />
                  </Button>
                  {isMenuOpen && (
                    <div className="absolute right-0 top-10 z-40 w-56 rounded-md border border-border bg-card p-1 shadow-md">
                      <Button
                        variant="ghost"
                        onClick={() => {
                          openHistory(ex.exerciseId, ex.exerciseName);
                          setTrainingGuideMenu(null);
                        }}
                        className="h-9 w-full justify-start gap-2 rounded-sm px-2.5 text-left text-sm font-normal"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M3 12a9 9 0 1 0 3-6.7" />
                          <polyline points="3 3 3 9 9 9" />
                          <path d="M12 7v5l3 3" />
                        </svg>
                        Exercise History
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => {
                          openTrainerTips(ex.exerciseId, ex.exerciseName);
                          setTrainingGuideMenu(null);
                        }}
                        className="h-9 w-full justify-start gap-2 rounded-sm px-2.5 text-left text-sm font-normal"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <circle cx="12" cy="12" r="10" />
                          <path d="M12 16v-4" />
                          <path d="M12 8h.01" />
                        </svg>
                        Exercise Info
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => {
                          if (canToggleSplitMode && menuExercise) {
                            const nextMode = menuExercise.logMode === 'split_lr' ? 'combined' : 'split_lr';
                            store.setExerciseLogMode(menuExerciseIndex, nextMode);
                          }
                          setTrainingGuideMenu(null);
                        }}
                        disabled={!canToggleSplitMode}
                        className="h-9 w-full justify-start gap-2 rounded-sm px-2.5 text-left text-sm font-normal"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <polyline points="17 1 21 5 17 9" />
                          <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                          <polyline points="7 23 3 19 7 15" />
                          <path d="M21 13v2a4 4 0 0 1-4 4H3" />
                        </svg>
                        Split L/R
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => {
                          const searchQuery = encodeURIComponent(`${ex.exerciseName} proper form`);
                          window.open(`https://www.youtube.com/results?search_query=${searchQuery}`, '_blank');
                          setTrainingGuideMenu(null);
                        }}
                        className="h-9 w-full justify-start gap-2 rounded-sm px-2.5 text-left text-sm font-normal"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z" />
                          <polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02" />
                        </svg>
                        Watch the Movement
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => {
                          router.push(`/trainer?exerciseId=${ex.exerciseId}&exerciseName=${encodeURIComponent(ex.exerciseName)}`);
                          setTrainingGuideMenu(null);
                        }}
                        className="h-9 w-full justify-start gap-2 rounded-sm px-2.5 text-left text-sm font-normal"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                        </svg>
                        Chat with Trainer
                      </Button>
                      <div className="my-1 h-px bg-border" />
                      <Button
                        variant="ghost"
                        onClick={() => {
                          store.removeExercise(ex.exerciseId);
                          setTrainingGuideMenu(null);
                        }}
                        className="h-9 w-full justify-start gap-2 rounded-sm px-2.5 text-left text-sm font-normal text-destructive hover:bg-destructive/10 hover:text-destructive"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                          <path d="M10 11v6" />
                          <path d="M14 11v6" />
                          <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                        </svg>
                        Remove Exercise
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              {/* Column Headers - Cardio vs Strength */}
              {ex.exerciseCategory === 'cardio' ? (
                <div className="grid grid-cols-[40px_1fr_1fr_40px] gap-2 text-xs text-muted-foreground mb-2 text-center">
                  <span>SET</span>
                  <span>TIME</span>
                  <span>{distanceUnit(unitSystem).toUpperCase()}</span>
                  <span></span>
                </div>
              ) : (
                ex.logMode === 'split_lr' ? (
                  <div className="mb-2 grid grid-cols-[40px_1fr_1fr_40px] gap-2 text-center text-xs text-muted-foreground">
                    <span>SET</span>
                    <span>L ({unit.toUpperCase()} / REPS)</span>
                    <span>R ({unit.toUpperCase()} / REPS)</span>
                    <span></span>
                  </div>
                ) : (
                  <div className="grid grid-cols-[40px_1fr_1fr_1fr_40px] gap-2 text-xs text-muted-foreground mb-2 text-center">
                    <span>SET</span>
                    <span>PREV</span>
                    <span>{unit.toUpperCase()}</span>
                    <span>REPS</span>
                    <span></span>
                  </div>
                )
              )}

              {/* Set Rows - Cardio vs Strength */}
              {ex.exerciseCategory === 'cardio' ? (
                // Cardio: single row with time, distance, and pace (number pad flow)
                <div className="space-y-2">
                  {ex.sets.slice(0, 1).map((s, setIdx) => {
                    const pace = calculatePace(s.time, s.distance, unitSystem);
                    return (
                      <div key={s.id}>
                        <div
                          className={`grid grid-cols-[40px_1fr_1fr_40px] gap-2 items-center ${
                            s.isCompleted ? 'opacity-60' : ''
                          }`}
                        >
                          <span className="text-center text-sm font-medium text-muted-foreground">
                            {s.setNumber}
                          </span>
                          <SetInputCell
                            exerciseIndex={exIdx}
                            setIndex={setIdx}
                            field="time"
                            displayValue={formatTimeInput(s.time)}
                            rawValue={s.time}
                            placeholder="0:00"
                            isCompleted={s.isCompleted}
                          />
                          <SetInputCell
                            exerciseIndex={exIdx}
                            setIndex={setIdx}
                            field="distance"
                            displayValue={s.distance !== null ? String(toDisplayDistance(s.distance, unitSystem) ?? '') : ''}
                            rawValue={s.distance}
                            placeholder="0"
                            isCompleted={s.isCompleted}
                          />
                          <Button variant="ghost"
                            onClick={() => {
                              if (s.isCompleted) {
                                store.updateSet(exIdx, setIdx, { isCompleted: false, timestamp: null });
                              } else {
                                store.completeSet(exIdx, setIdx);
                              }
                            }}
                            className={`w-10 h-10 rounded-full flex items-center justify-center ${
                              s.isCompleted ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                            }`}
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          </Button>
                        </div>
                        {pace && (
                          <p className="text-center text-xs text-primary mt-1">
                            Pace: {pace}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                // Strength: custom number pad inputs
                ex.sets.map((s, setIdx) => {
                  const canDeleteSet = ex.sets.length > 1;
                  return (
                    <SwipeToDeleteRow
                      key={s.id}
                      enabled={canDeleteSet}
                      showHint={showSwipeDeleteHint}
                      onSwipeIntent={() => setShowSwipeDeleteHint(false)}
                      onDelete={() => handleDeleteSet(exIdx, setIdx)}
                    >
                      {ex.logMode === 'split_lr' ? (
                        <div
                          className={`grid grid-cols-[40px_1fr_1fr_40px] gap-2 items-center ${
                            s.isCompleted ? 'opacity-60' : ''
                          }`}
                        >
                          <WarmupToggle
                            isWarmup={s.isWarmup}
                            setNumber={s.setNumber}
                            onToggle={() => store.updateSet(exIdx, setIdx, { isWarmup: !s.isWarmup })}
                          />
                          <div className="grid grid-cols-2 gap-1">
                            <SetInputCell
                              exerciseIndex={exIdx}
                              setIndex={setIdx}
                              field="leftWeight"
                              displayValue={s.leftWeight !== null ? String(toDisplayWeight(s.leftWeight, unitSystem)) : ''}
                              rawValue={s.leftWeight}
                              placeholder="0"
                              isCompleted={s.isCompleted}
                            />
                            <SetInputCell
                              exerciseIndex={exIdx}
                              setIndex={setIdx}
                              field="leftReps"
                              displayValue={s.leftReps !== null ? String(s.leftReps) : ''}
                              rawValue={s.leftReps}
                              placeholder="0"
                              isCompleted={s.isCompleted}
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-1">
                            <SetInputCell
                              exerciseIndex={exIdx}
                              setIndex={setIdx}
                              field="rightWeight"
                              displayValue={s.rightWeight !== null ? String(toDisplayWeight(s.rightWeight, unitSystem)) : ''}
                              rawValue={s.rightWeight}
                              placeholder="0"
                              isCompleted={s.isCompleted}
                            />
                            <SetInputCell
                              exerciseIndex={exIdx}
                              setIndex={setIdx}
                              field="rightReps"
                              displayValue={s.rightReps !== null ? String(s.rightReps) : ''}
                              rawValue={s.rightReps}
                              placeholder="0"
                              isCompleted={s.isCompleted}
                            />
                          </div>
                          <Button variant="ghost"
                            onClick={() => {
                              if (s.isCompleted) {
                                store.updateSet(exIdx, setIdx, { isCompleted: false, timestamp: null });
                              } else {
                                store.completeSet(exIdx, setIdx);
                                if (!s.isWarmup) startRestTimer(ex.restTimerSeconds);
                                // PR detection for manual checkmark
                                const prevPerf = store.previousPerformance[ex.exerciseId] || [];
                                const prs = detectPRs(s, ex, prevPerf);
                                const prStoreState = usePRStore.getState();
                                for (const pr of prs) {
                                  if (store.workoutId && !prStoreState.hasFired(store.workoutId, ex.exerciseId, pr.metric)) {
                                    prStoreState.markFired(store.workoutId, ex.exerciseId, pr.metric);
                                    prStoreState.addPR({
                                      exerciseId: ex.exerciseId,
                                      exerciseName: ex.exerciseName,
                                      metric: pr.metric,
                                      previousValue: pr.previousValue,
                                      newValue: pr.newValue,
                                      date: new Date().toISOString(),
                                      workoutId: store.workoutId,
                                    });
                                    onPRDetected(ex.exerciseName, pr);
                                  }
                                }
                              }
                            }}
                            className={`w-10 h-10 rounded-full flex items-center justify-center ${
                              s.isCompleted ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                            }`}
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          </Button>
                        </div>
                      ) : (
                        <div
                          className={`grid grid-cols-[40px_1fr_1fr_1fr_40px] gap-2 items-center ${
                            s.isCompleted ? 'opacity-60' : ''
                          }`}
                        >
                          <WarmupToggle
                            isWarmup={s.isWarmup}
                            setNumber={s.setNumber}
                            onToggle={() => store.updateSet(exIdx, setIdx, { isWarmup: !s.isWarmup })}
                          />
                          <span className="text-center text-sm text-muted-foreground">
                            {(() => {
                              const previousSet = getPreviousSetForNumber(prev, setIdx + 1);
                              return previousSet
                                ? `${toDisplayWeight(previousSet.weight, unitSystem)}×${previousSet.reps}`
                                : '-';
                            })()}
                          </span>
                          <SetInputCell
                            exerciseIndex={exIdx}
                            setIndex={setIdx}
                            field="weight"
                            displayValue={s.weight !== null ? String(toDisplayWeight(s.weight, unitSystem)) : ''}
                            rawValue={s.weight}
                            placeholder="0"
                            isCompleted={s.isCompleted}
                          />
                          <SetInputCell
                            exerciseIndex={exIdx}
                            setIndex={setIdx}
                            field="reps"
                            displayValue={s.reps !== null ? String(s.reps) : ''}
                            rawValue={s.reps}
                            placeholder="0"
                            isCompleted={s.isCompleted}
                          />
                          <Button variant="ghost"
                            onClick={() => {
                              if (s.isCompleted) {
                                store.updateSet(exIdx, setIdx, { isCompleted: false, timestamp: null });
                              } else {
                                store.completeSet(exIdx, setIdx);
                                if (!s.isWarmup) startRestTimer(ex.restTimerSeconds);
                                // PR detection for manual checkmark
                                const prevPerf = store.previousPerformance[ex.exerciseId] || [];
                                const prs = detectPRs(s, ex, prevPerf);
                                const prStoreState = usePRStore.getState();
                                for (const pr of prs) {
                                  if (store.workoutId && !prStoreState.hasFired(store.workoutId, ex.exerciseId, pr.metric)) {
                                    prStoreState.markFired(store.workoutId, ex.exerciseId, pr.metric);
                                    prStoreState.addPR({
                                      exerciseId: ex.exerciseId,
                                      exerciseName: ex.exerciseName,
                                      metric: pr.metric,
                                      previousValue: pr.previousValue,
                                      newValue: pr.newValue,
                                      date: new Date().toISOString(),
                                      workoutId: store.workoutId,
                                    });
                                    onPRDetected(ex.exerciseName, pr);
                                  }
                                }
                              }
                            }}
                            className={`w-10 h-10 rounded-full flex items-center justify-center ${
                              s.isCompleted ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                            }`}
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          </Button>
                        </div>
                      )}
                    </SwipeToDeleteRow>
                  );
                })
              )}

              <div className="mt-2">
                {ex.exerciseCategory !== 'cardio' && (
                  <Button variant="ghost"
                    onClick={() => store.addSet(exIdx)}
                    className="w-full py-2 text-sm text-primary hover:text-primary/80"
                  >
                    + Add Set
                  </Button>
                )}
              </div>
            </div>
          );
        })}

        <Button
          variant="outline"
          fullWidth
          onClick={() => setShowExercisePicker(true)}
        >
          + Add Exercise
        </Button>
      </div>

      {pendingSetDelete && (
        <div className={`fixed left-4 right-4 z-[70] ${numberPadVisible ? 'bottom-64' : 'bottom-24'}`}>
          <div className="flex items-center justify-between rounded-xl border border-border bg-card px-3 py-2 shadow-sm">
            <p className="text-sm text-muted-foreground truncate pr-3">
              Set deleted from {pendingSetDelete.exerciseName}
            </p>
            <Button variant="ghost"
              onClick={handleUndoDeleteSet}
              className="text-sm font-semibold text-primary hover:text-primary/80"
            >
              Undo
            </Button>
          </div>
        </div>
      )}

      {/* Number Pad */}
      <NumberPad restTimer={restTimer} onStopRestTimer={stopRestTimer} />

      {/* Rest Timer - shown only when number pad is NOT visible */}
      {restTimer.isActive && !numberPadVisible && (
        <div className="fixed bottom-16 left-0 right-0 bg-card border-t border-border px-4 py-3 z-50">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Rest Timer</span>
            <Button variant="ghost"
              onClick={stopRestTimer}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Skip
            </Button>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-1000 ease-linear"
                style={{
                  width: `${(restTimer.secondsRemaining / restTimer.totalSeconds) * 100}%`,
                }}
              />
            </div>
            <span className="text-lg font-bold tabular-nums min-w-[60px] text-right">
              {Math.floor(restTimer.secondsRemaining / 60)}:{(restTimer.secondsRemaining % 60).toString().padStart(2, '0')}
            </span>
          </div>
        </div>
      )}

      {/* History Modal */}
      <Modal
        isOpen={!!historyModal}
        onClose={() => setHistoryModal(null)}
        title={historyModal?.exerciseName ? `${historyModal.exerciseName} Exercise History` : 'Exercise History'}
        actions={[
          { label: 'Close', onClick: () => setHistoryModal(null), variant: 'ghost' },
        ]}
      >
        {loadingHistory ? (
          <p className="text-muted-foreground text-sm text-center py-4">Loading...</p>
        ) : historyData.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-4">No logged sets found for this exercise yet.</p>
        ) : (
          <div className="space-y-4 max-h-80 overflow-y-auto">
            {historyData.map((entry, idx) => (
              <Card key={idx}>
                <p className="text-xs text-muted-foreground mb-2">
                  {new Date(entry.date).toLocaleDateString(undefined, {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </p>
                <div className="space-y-1">
                  {entry.sets.map((s, sIdx) => (
                    <p key={sIdx} className="text-sm text-muted-foreground">
                      Set {s.set_number}:{' '}
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
        )}
      </Modal>

      {/* Trainer Tips Modal */}
      <Modal
        isOpen={!!tipsModal}
        onClose={() => setTipsModal(null)}
        title={tipsModal?.exerciseName ? `${tipsModal.exerciseName}` : 'Details & Tips'}
        actions={[
          { label: 'Close', onClick: () => setTipsModal(null), variant: 'ghost' },
        ]}
      >
        {loadingTips ? (
          <p className="text-muted-foreground text-sm text-center py-4">Loading...</p>
        ) : !exerciseDetails ? (
          <p className="text-muted-foreground text-sm text-center py-4">No tips available for this exercise.</p>
        ) : (
          <div className="space-y-4 max-h-96 overflow-y-auto">
            {(exerciseDetails.equipment || exerciseDetails.level) && (
              <div>
                <h4 className="mb-2 text-sm font-medium text-muted-foreground">Setup</h4>
                <div className="flex flex-wrap gap-2">
                  {exerciseDetails.equipment && (
                    <span className="text-xs bg-muted px-2 py-1 rounded-full text-muted-foreground">
                      {exerciseDetails.equipment}
                    </span>
                  )}
                  {exerciseDetails.level && (
                    <span className="text-xs bg-muted px-2 py-1 rounded-full text-muted-foreground capitalize">
                      {exerciseDetails.level}
                    </span>
                  )}
                </div>
              </div>
            )}

            {(exerciseDetails.primary_muscles?.length > 0 || exerciseDetails.secondary_muscles?.length > 0) && (
              <div>
                <h4 className="mb-2 text-sm font-medium text-muted-foreground">Muscles Worked</h4>
                <div className="space-y-1">
                  {exerciseDetails.primary_muscles?.length > 0 && (
                    <p className="text-sm text-foreground">
                      <span className="text-muted-foreground">Primary:</span> {exerciseDetails.primary_muscles.join(', ')}
                    </p>
                  )}
                  {exerciseDetails.secondary_muscles?.length > 0 && (
                    <p className="text-sm text-muted-foreground">
                      <span className="text-muted-foreground">Secondary:</span> {exerciseDetails.secondary_muscles.join(', ')}
                    </p>
                  )}
                </div>
              </div>
            )}

            {exerciseDetails.instructions?.length > 0 && (
              <div>
                <h4 className="mb-2 text-sm font-medium text-muted-foreground">Form Tips</h4>
                <ol className="space-y-2">
                  {exerciseDetails.instructions.map((instruction, idx) => (
                    <li key={idx} className="text-sm text-muted-foreground flex gap-2">
                      <span className="text-primary font-medium">{idx + 1}.</span>
                      <span>{instruction}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Exercise Picker Overlay */}
      <ExercisePickerOverlay
        isOpen={showExercisePicker}
        onClose={() => setShowExercisePicker(false)}
        onSelect={(exercise) => {
          store.addExercise(exercise);
          setShowExercisePicker(false);
        }}
      />
    </div>
  );
}
