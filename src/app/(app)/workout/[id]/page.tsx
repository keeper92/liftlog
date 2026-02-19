'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useActiveWorkoutStore, type ActiveWorkoutState, type PerformanceSet } from '@/stores/activeWorkoutStore';
import { useSettingsStore } from '@/stores/settingsStore';
import {
  formatDuration,
  toDisplayWeight,
  weightUnit,
  formatTimeInput,
  parseTimeInput,
  distanceUnit,
  toDisplayDistance,
  toStorageDistance,
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
    <button
      className={`w-10 h-10 flex items-center justify-center rounded-lg text-sm font-medium select-none touch-none ${
        isWarmup ? 'text-warning bg-warning/10' : 'text-text-secondary'
      }`}
      onPointerDown={startPress}
      onPointerUp={cancelPress}
      onPointerLeave={cancelPress}
      onPointerCancel={cancelPress}
      title="Hold to toggle warm-up set"
    >
      {isWarmup ? 'W' : setNumber}
    </button>
  );
}

export default function ActiveWorkoutPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const store = useActiveWorkoutStore();
  const unitSystem = useSettingsStore((s) => s.unitSystem);
  const [elapsed, setElapsed] = useState(0);
  const [saving, setSaving] = useState(false);
  const [historyModal, setHistoryModal] = useState<{ exerciseId: string; exerciseName: string } | null>(null);
  const [historyData, setHistoryData] = useState<HistoryEntry[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [restTimer, setRestTimer] = useState<RestTimerState>({ isActive: false, secondsRemaining: 0, totalSeconds: 0 });
  const restTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [tipsModal, setTipsModal] = useState<{ exerciseId: string; exerciseName: string } | null>(null);
  const [exerciseDetails, setExerciseDetails] = useState<ExerciseDetails | null>(null);
  const [loadingTips, setLoadingTips] = useState(false);
  const [trainingGuideMenu, setTrainingGuideMenu] = useState<{ exerciseId: string; exerciseName: string } | null>(null);
  const [toastQueue, setToastQueue] = useState<{ exerciseName: string; metric: 'weight' | 'reps'; previousValue: number; newValue: number }[]>([]);
  const exercises = store.exercises;
  const previousPerformance = store.previousPerformance;
  const setPreviousPerformance = store.setPreviousPerformance;

  const handlePRDetected = useCallback((exerciseName: string, pr: PRDetectionResult) => {
    setToastQueue((prev) => [...prev, { exerciseName, metric: pr.metric, previousValue: pr.previousValue, newValue: pr.newValue }]);
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
    if (!restTimer.isActive || restTimer.secondsRemaining <= 0) return;

    restTimerRef.current = setTimeout(() => {
      setRestTimer((prev) => {
        if (!prev.isActive) return prev;

        const nextSeconds = prev.secondsRemaining - 1;
        if (nextSeconds <= 0) {
          return { isActive: false, secondsRemaining: 0, totalSeconds: 0 };
        }

        return {
          ...prev,
          secondsRemaining: nextSeconds,
        };
      });
    }, 1000);

    return () => {
      if (restTimerRef.current) clearTimeout(restTimerRef.current);
    };
  }, [restTimer.isActive, restTimer.secondsRemaining]);

  const startRestTimer = useCallback((seconds: number) => {
    setRestTimer({ isActive: true, secondsRemaining: seconds, totalSeconds: seconds });
  }, []);

  const stopRestTimer = useCallback(() => {
    setRestTimer({ isActive: false, secondsRemaining: 0, totalSeconds: 0 });
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
      }
    }

    if (exercises.length > 0) loadPrevious();
    return () => {
      cancelled = true;
    };
  }, [exercises, previousPerformance, setPreviousPerformance, supabase]);

  const handleFinish = useCallback(async () => {
    setSaving(true);
    usePRStore.getState().clearFiredNotifications();
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
          left_weight: ex.logMode === 'split_lr' ? s.leftWeight : null,
          left_reps: ex.logMode === 'split_lr' ? s.leftReps : null,
          right_weight: ex.logMode === 'split_lr' ? s.rightWeight : null,
          right_reps: ex.logMode === 'split_lr' ? s.rightReps : null,
          is_split_lr: ex.logMode === 'split_lr',
          time: s.time,
          distance: s.distance,
          is_warmup: s.isWarmup,
          is_completed: true,
        })),
    );

    if (setsToInsert.length > 0) {
      await supabase.from('sets').insert(setsToInsert);
    }

    const summaryUrl = result.templateId
      ? `/workout/summary/${workout.id}?templateId=${result.templateId}`
      : `/workout/summary/${workout.id}`;
    router.push(summaryUrl);
  }, [store, supabase, router]);

  const handleDiscard = useCallback(() => {
    if (window.confirm('Discard this workout? All progress will be lost.')) {
      usePRStore.getState().clearFiredNotifications();
      store.discardWorkout();
      router.push('/dashboard');
    }
  }, [store, router]);

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
        .slice(0, 10)
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
        restTimer={restTimer}
        stopRestTimer={stopRestTimer}
        startRestTimer={startRestTimer}
        handleFinish={handleFinish}
        handleDiscard={handleDiscard}
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
        onPRDetected={handlePRDetected}
      />
    </NumberPadProvider>
  );
}

function WorkoutContent({
  store,
  unitSystem,
  elapsed,
  saving,
  restTimer,
  stopRestTimer,
  startRestTimer,
  handleFinish,
  handleDiscard,
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
  onPRDetected,
}: {
  store: ActiveWorkoutState;
  unitSystem: 'imperial' | 'metric';
  elapsed: number;
  saving: boolean;
  restTimer: RestTimerState;
  stopRestTimer: () => void;
  startRestTimer: (seconds: number) => void;
  handleFinish: () => void;
  handleDiscard: () => void;
  openTrainerTips: (exerciseId: string, exerciseName: string) => void;
  openHistory: (exerciseId: string, exerciseName: string) => void;
  historyModal: { exerciseId: string; exerciseName: string } | null;
  setHistoryModal: (v: { exerciseId: string; exerciseName: string } | null) => void;
  historyData: HistoryEntry[];
  loadingHistory: boolean;
  trainingGuideMenu: { exerciseId: string; exerciseName: string } | null;
  setTrainingGuideMenu: (v: { exerciseId: string; exerciseName: string } | null) => void;
  tipsModal: { exerciseId: string; exerciseName: string } | null;
  setTipsModal: (v: { exerciseId: string; exerciseName: string } | null) => void;
  exerciseDetails: ExerciseDetails | null;
  loadingTips: boolean;
  router: ReturnType<typeof useRouter>;
  toastQueue: { exerciseName: string; metric: 'weight' | 'reps'; previousValue: number; newValue: number }[];
  dismissToast: () => void;
  onPRDetected: (exerciseName: string, pr: PRDetectionResult) => void;
}) {
  const { activeFocus, deactivate } = useNumberPad();
  const numberPadVisible = activeFocus !== null;
  const [showExercisePicker, setShowExercisePicker] = useState(false);

  // Drag-to-reorder state
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const exerciseRefs = useRef<(HTMLDivElement | null)[]>([]);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const dragStartY = useRef(0);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  function handleDragStart(index: number, clientY: number) {
    setDragIndex(index);
    setDragOverIndex(index);
    dragStartY.current = clientY;
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
    setDragIndex(null);
    setDragOverIndex(null);
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  function cancelDrag() {
    setDragIndex(null);
    setDragOverIndex(null);
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  const unit = weightUnit(unitSystem);

  return (
    <div
      className="flex flex-col min-h-dvh bg-background"
      onPointerDown={() => { if (numberPadVisible) deactivate(); }}
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
          unitSystem={unitSystem}
          onDismiss={dismissToast}
        />
      )}

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
      <div ref={scrollContainerRef} className={`flex-1 overflow-y-auto px-4 py-4 space-y-6 ${numberPadVisible ? 'pb-80' : 'pb-20'}`}>
        {store.exercises.map((ex, exIdx) => {
          const prev = store.previousPerformance[ex.exerciseId] || [];
          const isDragging = dragIndex === exIdx;
          const isDragOver = dragOverIndex === exIdx && dragIndex !== null && dragIndex !== exIdx;
          return (
            <div
              key={ex.exerciseId + exIdx}
              ref={(el) => { exerciseRefs.current[exIdx] = el; }}
              className={`bg-surface rounded-xl p-4 transition-all duration-150 ${
                isDragging ? 'opacity-50 scale-[0.98]' : ''
              } ${isDragOver ? 'ring-2 ring-primary ring-offset-2' : ''}`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  {/* Drag handle — long press to reorder */}
                  <div
                    className="flex items-center justify-center w-8 h-10 -ml-1 cursor-grab active:cursor-grabbing touch-none"
                    onTouchStart={(e) => {
                      const touch = e.touches[0];
                      longPressTimer.current = setTimeout(() => {
                        handleDragStart(exIdx, touch.clientY);
                      }, 300);
                    }}
                    onTouchMove={(e) => {
                      if (dragIndex === null && longPressTimer.current) {
                        // Cancel long press if finger moves before timer fires
                        clearTimeout(longPressTimer.current);
                        longPressTimer.current = null;
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
                    onMouseDown={() => {
                      // Desktop fallback: single click reorder not needed,
                      // but show visual hint on hover
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="text-text-muted">
                      <circle cx="9" cy="6" r="1.5" />
                      <circle cx="15" cy="6" r="1.5" />
                      <circle cx="9" cy="12" r="1.5" />
                      <circle cx="15" cy="12" r="1.5" />
                      <circle cx="9" cy="18" r="1.5" />
                      <circle cx="15" cy="18" r="1.5" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-semibold text-text">{ex.exerciseName}</h3>
                    <div className="flex items-center gap-2 mt-0.5">
                      <button
                        onClick={() => setTrainingGuideMenu({ exerciseId: ex.exerciseId, exerciseName: ex.exerciseName })}
                        className="text-xs text-primary hover:text-primary-light font-medium"
                      >
                        Training Guide
                      </button>
                      {ex.exerciseCategory !== 'cardio' && (
                        <button
                          onClick={() =>
                            store.setExerciseLogMode(exIdx, ex.logMode === 'split_lr' ? 'combined' : 'split_lr')
                          }
                          className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors ${
                            ex.logMode === 'split_lr'
                              ? 'border-primary/30 bg-primary/10 text-primary'
                              : 'border-border text-text-muted hover:text-text'
                          }`}
                        >
                          {ex.logMode === 'split_lr' ? 'Combined' : 'Split L/R'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => store.removeExercise(ex.exerciseId)}
                  className="text-text-muted text-xs hover:text-error"
                >
                  Remove
                </button>
              </div>

              {/* Column Headers - Cardio vs Strength */}
              {ex.exerciseCategory === 'cardio' ? (
                <div className="grid grid-cols-[40px_1fr_1fr_40px] gap-2 text-xs text-text-muted mb-2 text-center">
                  <span>SET</span>
                  <span>TIME</span>
                  <span>{distanceUnit(unitSystem).toUpperCase()}</span>
                  <span></span>
                </div>
              ) : (
                ex.logMode === 'split_lr' ? (
                  <div className="grid grid-cols-[40px_1fr_1fr_40px] gap-2 text-[11px] text-text-muted mb-2 text-center">
                    <span>SET</span>
                    <span>L ({unit.toUpperCase()} / REPS)</span>
                    <span>R ({unit.toUpperCase()} / REPS)</span>
                    <span></span>
                  </div>
                ) : (
                  <div className="grid grid-cols-[40px_1fr_1fr_1fr_40px] gap-2 text-xs text-text-muted mb-2 text-center">
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
                // Cardio: single row with time, distance, and pace (native inputs)
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
                          <span className="text-center text-sm font-medium text-text-secondary">
                            1
                          </span>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={formatTimeInput(s.time)}
                            onChange={(e) => {
                              const val = parseTimeInput(e.target.value);
                              store.updateSet(exIdx, setIdx, { time: val });
                            }}
                            className="bg-background rounded-lg px-2 py-2 text-center text-sm min-h-[44px] w-full border border-border focus:border-primary outline-none"
                            placeholder="0:00"
                          />
                          <input
                            type="number"
                            inputMode="decimal"
                            step="0.1"
                            value={s.distance !== null ? (toDisplayDistance(s.distance, unitSystem) ?? '') : ''}
                            onChange={(e) => {
                              const val = e.target.value ? toStorageDistance(parseFloat(e.target.value), unitSystem) : null;
                              store.updateSet(exIdx, setIdx, { distance: val });
                            }}
                            className="bg-background rounded-lg px-2 py-2 text-center text-sm min-h-[44px] w-full border border-border focus:border-primary outline-none"
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
                ex.sets.map((s, setIdx) => (
                  ex.logMode === 'split_lr' ? (
                    <div
                      key={s.id}
                      className={`grid grid-cols-[40px_1fr_1fr_40px] gap-2 items-center mb-2 ${
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
                      <button
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
                          s.isCompleted ? 'bg-success text-white' : 'bg-surface-light text-text-muted'
                        }`}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      </button>
                    </div>
                  ) : (
                    <div
                      key={s.id}
                      className={`grid grid-cols-[40px_1fr_1fr_1fr_40px] gap-2 items-center mb-2 ${
                        s.isCompleted ? 'opacity-60' : ''
                      }`}
                    >
                      <WarmupToggle
                        isWarmup={s.isWarmup}
                        setNumber={s.setNumber}
                        onToggle={() => store.updateSet(exIdx, setIdx, { isWarmup: !s.isWarmup })}
                      />
                      <span className="text-center text-sm text-text-muted">
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
                      <button
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
                          s.isCompleted ? 'bg-success text-white' : 'bg-surface-light text-text-muted'
                        }`}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      </button>
                    </div>
                  )
                ))
              )}

              <div className="flex gap-4 mt-2">
                {ex.exerciseCategory !== 'cardio' && (
                  <button
                    onClick={() => store.addSet(exIdx)}
                    className="flex-1 py-2 text-sm text-primary hover:text-primary-light"
                  >
                    + Add Set
                  </button>
                )}
                <button
                  onClick={() => openHistory(ex.exerciseId, ex.exerciseName)}
                  className="flex-1 py-2 text-sm text-text-muted hover:text-text"
                >
                  Training Log
                </button>
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

      {/* Number Pad */}
      <NumberPad restTimer={restTimer} onStopRestTimer={stopRestTimer} />

      {/* Rest Timer - shown only when number pad is NOT visible */}
      {restTimer.isActive && !numberPadVisible && (
        <div className="fixed bottom-16 left-0 right-0 bg-surface border-t border-border px-4 py-3 z-50">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Rest Timer</span>
            <button
              onClick={stopRestTimer}
              className="text-xs text-text-muted hover:text-text"
            >
              Skip
            </button>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2 bg-surface-light rounded-full overflow-hidden">
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
        title={historyModal?.exerciseName ? `${historyModal.exerciseName} Training Log` : 'Training Log'}
        actions={[
          { label: 'Close', onClick: () => setHistoryModal(null), variant: 'ghost' },
        ]}
      >
        {loadingHistory ? (
          <p className="text-text-muted text-sm text-center py-4">Loading...</p>
        ) : historyData.length === 0 ? (
          <p className="text-text-muted text-sm text-center py-4">No logged sets found for this exercise yet.</p>
        ) : (
          <div className="space-y-4 max-h-80 overflow-y-auto">
            {historyData.map((entry, idx) => (
              <Card key={idx}>
                <p className="text-xs text-text-muted mb-2">
                  {new Date(entry.date).toLocaleDateString(undefined, {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </p>
                <div className="space-y-1">
                  {entry.sets.map((s, sIdx) => (
                    <p key={sIdx} className="text-sm text-text-secondary">
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

      {/* Training Guide Menu */}
      <Modal
        isOpen={!!trainingGuideMenu}
        onClose={() => setTrainingGuideMenu(null)}
        title="Training Guide"
        actions={[
          { label: 'Cancel', onClick: () => setTrainingGuideMenu(null), variant: 'ghost' },
        ]}
      >
        <div className="space-y-2">
          <button
            onClick={() => {
              if (trainingGuideMenu) {
                openTrainerTips(trainingGuideMenu.exerciseId, trainingGuideMenu.exerciseName);
              }
              setTrainingGuideMenu(null);
            }}
            className="w-full py-3 px-4 text-left bg-surface-light hover:bg-surface-light/80 rounded-lg flex items-center gap-3 transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
            <div>
              <p className="font-medium text-text">Details & Tips</p>
              <p className="text-xs text-text-muted">Equipment, muscles, and form instructions</p>
            </div>
          </button>

          <button
            onClick={() => {
              if (trainingGuideMenu) {
                const searchQuery = encodeURIComponent(`${trainingGuideMenu.exerciseName} proper form`);
                window.open(`https://www.youtube.com/results?search_query=${searchQuery}`, '_blank');
              }
              setTrainingGuideMenu(null);
            }}
            className="w-full py-3 px-4 text-left bg-surface-light hover:bg-surface-light/80 rounded-lg flex items-center gap-3 transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-500">
              <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z" />
              <polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02" />
            </svg>
            <div>
              <p className="font-medium text-text">Watch the Movement</p>
              <p className="text-xs text-text-muted">View exercise demos on YouTube</p>
            </div>
          </button>

          <button
            onClick={() => {
              if (trainingGuideMenu) {
                router.push(`/trainer?exerciseId=${trainingGuideMenu.exerciseId}&exerciseName=${encodeURIComponent(trainingGuideMenu.exerciseName)}`);
              }
              setTrainingGuideMenu(null);
            }}
            className="w-full py-3 px-4 text-left bg-surface-light hover:bg-surface-light/80 rounded-lg flex items-center gap-3 transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <div>
              <p className="font-medium text-text">Chat with AI Trainer</p>
              <p className="text-xs text-text-muted">Get personalized guidance and answers</p>
            </div>
          </button>
        </div>
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
          <p className="text-text-muted text-sm text-center py-4">Loading...</p>
        ) : !exerciseDetails ? (
          <p className="text-text-muted text-sm text-center py-4">No tips available for this exercise.</p>
        ) : (
          <div className="space-y-4 max-h-96 overflow-y-auto">
            {(exerciseDetails.equipment || exerciseDetails.level) && (
              <div>
                <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Setup</h4>
                <div className="flex flex-wrap gap-2">
                  {exerciseDetails.equipment && (
                    <span className="text-xs bg-surface-light px-2 py-1 rounded-full text-text-secondary">
                      {exerciseDetails.equipment}
                    </span>
                  )}
                  {exerciseDetails.level && (
                    <span className="text-xs bg-surface-light px-2 py-1 rounded-full text-text-secondary capitalize">
                      {exerciseDetails.level}
                    </span>
                  )}
                </div>
              </div>
            )}

            {(exerciseDetails.primary_muscles?.length > 0 || exerciseDetails.secondary_muscles?.length > 0) && (
              <div>
                <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Muscles Worked</h4>
                <div className="space-y-1">
                  {exerciseDetails.primary_muscles?.length > 0 && (
                    <p className="text-sm text-text">
                      <span className="text-text-muted">Primary:</span> {exerciseDetails.primary_muscles.join(', ')}
                    </p>
                  )}
                  {exerciseDetails.secondary_muscles?.length > 0 && (
                    <p className="text-sm text-text-secondary">
                      <span className="text-text-muted">Secondary:</span> {exerciseDetails.secondary_muscles.join(', ')}
                    </p>
                  )}
                </div>
              </div>
            )}

            {exerciseDetails.instructions?.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Form Tips</h4>
                <ol className="space-y-2">
                  {exerciseDetails.instructions.map((instruction, idx) => (
                    <li key={idx} className="text-sm text-text-secondary flex gap-2">
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
