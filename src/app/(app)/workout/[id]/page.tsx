'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useActiveWorkoutStore } from '@/stores/activeWorkoutStore';
import { useSettingsStore } from '@/stores/settingsStore';
import {
  formatDuration,
  toDisplayWeight,
  toStorageWeight,
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

interface HistoryEntry {
  date: string;
  sets: { weight: number | null; reps: number | null; set_number: number }[];
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

export default function ActiveWorkoutPage() {
  const router = useRouter();
  const supabase = createClient();
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

  // Quick-log flow: track active input for weight→reps→complete
  const [activeInput, setActiveInput] = useState<{ exIdx: number; setIdx: number; field: 'weight' | 'reps' } | null>(null);
  const inputRefs = useRef<Map<string, HTMLInputElement>>(new Map());
  const nextButtonRef = useRef<HTMLButtonElement>(null);

  const getInputKey = (exIdx: number, setIdx: number, field: 'weight' | 'reps') =>
    `${exIdx}-${setIdx}-${field}`;

  const setInputRef = (exIdx: number, setIdx: number, field: 'weight' | 'reps', el: HTMLInputElement | null) => {
    const key = getInputKey(exIdx, setIdx, field);
    if (el) {
      inputRefs.current.set(key, el);
    } else {
      inputRefs.current.delete(key);
    }
  };

  const handleInputFocus = (exIdx: number, setIdx: number, field: 'weight' | 'reps') => {
    setActiveInput({ exIdx, setIdx, field });
  };

  const blurTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleInputBlur = useCallback((e: React.FocusEvent) => {
    // Don't clear if focus is moving to the Next button or another tracked input
    const relatedTarget = e.relatedTarget as HTMLElement | null;
    if (relatedTarget && (
      relatedTarget === nextButtonRef.current ||
      relatedTarget.dataset.trackedInput === 'true'
    )) {
      return;
    }
    // Delay clearing so that tapping an input doesn't flash the Next button
    // (the Next button render can cause a transient blur on mobile)
    if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
    blurTimeoutRef.current = setTimeout(() => {
      // Only clear if no input is focused after the delay
      const active = document.activeElement;
      if (!active || active.tagName !== 'INPUT' || !('trackedInput' in (active as HTMLElement).dataset)) {
        setActiveInput(null);
      }
    }, 100);
  }, []);

  // Cancel pending blur when a new focus arrives
  const handleInputFocusWrapped = (exIdx: number, setIdx: number, field: 'weight' | 'reps') => {
    if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
    handleInputFocus(exIdx, setIdx, field);
  };

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

  // Rest timer countdown
  useEffect(() => {
    if (restTimer.isActive && restTimer.secondsRemaining > 0) {
      restTimerRef.current = setTimeout(() => {
        setRestTimer((prev) => ({
          ...prev,
          secondsRemaining: prev.secondsRemaining - 1,
        }));
      }, 1000);
    } else if (restTimer.isActive && restTimer.secondsRemaining === 0) {
      // Timer finished
      setRestTimer({ isActive: false, secondsRemaining: 0, totalSeconds: 0 });
    }
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

  const handleNext = useCallback(() => {
    if (!activeInput) return;
    const { exIdx, setIdx, field } = activeInput;

    if (field === 'weight') {
      // Move focus to reps
      const repsKey = getInputKey(exIdx, setIdx, 'reps');
      const repsInput = inputRefs.current.get(repsKey);
      if (repsInput) {
        repsInput.focus();
        repsInput.select();
      }
      setActiveInput({ exIdx, setIdx, field: 'reps' });
    } else if (field === 'reps') {
      // Complete the set and start rest timer
      const exercise = store.exercises[exIdx];
      const s = exercise?.sets[setIdx];
      if (s && !s.isCompleted) {
        store.completeSet(exIdx, setIdx);
        startRestTimer(exercise.restTimerSeconds);
      }
      // Blur the current input
      const repsKey = getInputKey(exIdx, setIdx, 'reps');
      const repsInput = inputRefs.current.get(repsKey);
      if (repsInput) repsInput.blur();
      setActiveInput(null);
    }
  }, [activeInput, store, startRestTimer]);

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
      .select('weight, reps, set_number, is_warmup, workouts!inner(id, date, user_id)')
      .eq('exercise_id', exerciseId)
      .eq('workouts.user_id', user.id)
      .eq('is_completed', true)
      .order('workouts(date)', { ascending: false });

    if (data) {
      // Group sets by workout
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

      // Convert to array and sort by date
      const history: HistoryEntry[] = Array.from(workoutMap.values())
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 10)
        .map((w) => ({
          date: w.date,
          sets: w.sets
            .filter((s) => !s.is_warmup)
            .sort((a, b) => a.set_number - b.set_number)
            .map((s) => ({ weight: s.weight, reps: s.reps, set_number: s.set_number })),
        }));

      setHistoryData(history);
    }
    setLoadingHistory(false);
  }

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
            <div key={ex.exerciseId + exIdx} className="bg-surface rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="flex flex-col gap-0.5">
                    <button
                      onClick={() => store.moveExercise(exIdx, exIdx - 1)}
                      disabled={exIdx === 0}
                      className={`p-1 rounded ${exIdx === 0 ? 'text-text-muted/30' : 'text-text-muted hover:text-text'}`}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="18 15 12 9 6 15" />
                      </svg>
                    </button>
                    <button
                      onClick={() => store.moveExercise(exIdx, exIdx + 1)}
                      disabled={exIdx === store.exercises.length - 1}
                      className={`p-1 rounded ${exIdx === store.exercises.length - 1 ? 'text-text-muted/30' : 'text-text-muted hover:text-text'}`}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </button>
                  </div>
                  <div>
                      <h3 className="font-semibold text-text">{ex.exerciseName}</h3>
                      <button
                        onClick={() => setTrainingGuideMenu({ exerciseId: ex.exerciseId, exerciseName: ex.exerciseName })}
                        className="text-xs text-primary hover:text-primary-light font-medium"
                      >
                        Training Guide
                      </button>
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
                <div className="grid grid-cols-[40px_1fr_1fr_1fr_40px] gap-2 text-xs text-text-muted mb-2 text-center">
                  <span>SET</span>
                  <span>PREV</span>
                  <span>{unit.toUpperCase()}</span>
                  <span>REPS</span>
                  <span></span>
                </div>
              )}

              {/* Set Rows - Cardio vs Strength */}
              {ex.exerciseCategory === 'cardio' ? (
                // Cardio: single row with time, distance, and pace
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
                // Strength: multiple set rows
                ex.sets.map((s, setIdx) => (
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
                      ref={(el) => setInputRef(exIdx, setIdx, 'weight', el)}
                      data-tracked-input="true"
                      type="number"
                      inputMode="decimal"
                      value={s.weight !== null ? toDisplayWeight(s.weight, unitSystem) : ''}
                      onChange={(e) => {
                        const val = e.target.value ? toStorageWeight(parseFloat(e.target.value), unitSystem) : null;
                        store.updateSet(exIdx, setIdx, { weight: val });
                      }}
                      onFocus={() => handleInputFocusWrapped(exIdx, setIdx, 'weight')}
                      onBlur={handleInputBlur}
                      className={`bg-background rounded-lg px-2 py-2 text-center text-sm min-h-[44px] w-full border outline-none ${
                        activeInput?.exIdx === exIdx && activeInput?.setIdx === setIdx && activeInput?.field === 'weight'
                          ? 'border-primary ring-1 ring-primary'
                          : 'border-border focus:border-primary'
                      }`}
                      placeholder="0"
                    />
                    <input
                      ref={(el) => setInputRef(exIdx, setIdx, 'reps', el)}
                      data-tracked-input="true"
                      type="number"
                      inputMode="numeric"
                      value={s.reps ?? ''}
                      onChange={(e) => {
                        const val = e.target.value ? parseInt(e.target.value) : null;
                        store.updateSet(exIdx, setIdx, { reps: val });
                      }}
                      onFocus={() => handleInputFocusWrapped(exIdx, setIdx, 'reps')}
                      onBlur={handleInputBlur}
                      className={`bg-background rounded-lg px-2 py-2 text-center text-sm min-h-[44px] w-full border outline-none ${
                        activeInput?.exIdx === exIdx && activeInput?.setIdx === setIdx && activeInput?.field === 'reps'
                          ? 'border-primary ring-1 ring-primary'
                          : 'border-border focus:border-primary'
                      }`}
                      placeholder="0"
                    />
                    <button
                      onClick={() => {
                        if (s.isCompleted) {
                          store.updateSet(exIdx, setIdx, { isCompleted: false, timestamp: null });
                        } else {
                          store.completeSet(exIdx, setIdx);
                          startRestTimer(ex.restTimerSeconds);
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
                  History
                </button>
              </div>
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

      {/* Next button - quick-log flow */}
      {activeInput && !store.exercises[activeInput.exIdx]?.sets[activeInput.setIdx]?.isCompleted && (
        <div className="fixed bottom-0 left-0 right-0 z-[60] px-4 py-3 bg-surface border-t border-border">
          <button
            ref={nextButtonRef}
            onMouseDown={(e) => e.preventDefault()}
            onTouchEnd={(e) => {
              e.preventDefault();
              handleNext();
            }}
            onClick={handleNext}
            className="w-full py-3 rounded-xl bg-primary text-white font-semibold text-base active:bg-primary-light"
          >
            {activeInput.field === 'weight' ? 'Next → Reps' : 'Log Set ✓'}
          </button>
        </div>
      )}

      {/* Rest Timer - positioned above BottomNav */}
      {restTimer.isActive && (
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
        title={historyModal?.exerciseName ? `${historyModal.exerciseName} History` : 'History'}
        actions={[
          { label: 'Close', onClick: () => setHistoryModal(null), variant: 'ghost' },
        ]}
      >
        {loadingHistory ? (
          <p className="text-text-muted text-sm text-center py-4">Loading...</p>
        ) : historyData.length === 0 ? (
          <p className="text-text-muted text-sm text-center py-4">No history found for this exercise.</p>
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
                      Set {s.set_number}: {s.weight ? `${toDisplayWeight(s.weight, unitSystem)} ${unit}` : '-'} × {s.reps || '-'} reps
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
            {/* Equipment & Setup */}
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

            {/* Muscles */}
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

            {/* Form Tips */}
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
    </div>
  );
}
