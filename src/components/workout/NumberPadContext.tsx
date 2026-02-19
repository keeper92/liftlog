'use client';

import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from 'react';
import { useActiveWorkoutStore } from '@/stores/activeWorkoutStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { usePRStore } from '@/stores/prStore';
import { toStorageWeight, toDisplayWeight } from '@/lib/utils/units';
import { detectPRs, type PRDetectionResult } from '@/lib/utils/prDetection';

export type NumberPadField =
  | 'weight'
  | 'reps'
  | 'leftWeight'
  | 'leftReps'
  | 'rightWeight'
  | 'rightReps';

interface NumberPadFocus {
  exerciseIndex: number;
  setIndex: number;
  field: NumberPadField;
}

interface NumberPadContextValue {
  activeFocus: NumberPadFocus | null;
  buffer: string;
  activate: (focus: NumberPadFocus, initialValue: number | null) => void;
  deactivate: () => void;
  pressDigit: (digit: string) => void;
  pressDecimal: () => void;
  pressBackspace: () => void;
  pressNext: () => void;
}

const NumberPadCtx = createContext<NumberPadContextValue | null>(null);

function isRepsField(field: NumberPadField): boolean {
  return field === 'reps' || field === 'leftReps' || field === 'rightReps';
}

function isWeightField(field: NumberPadField): boolean {
  return field === 'weight' || field === 'leftWeight' || field === 'rightWeight';
}

function getNextFieldForSplit(field: NumberPadField): NumberPadField {
  if (field === 'leftWeight') return 'leftReps';
  if (field === 'leftReps') return 'rightWeight';
  if (field === 'rightWeight') return 'rightReps';
  return 'rightReps';
}

export function useNumberPad() {
  const ctx = useContext(NumberPadCtx);
  if (!ctx) throw new Error('useNumberPad must be used within NumberPadProvider');
  return ctx;
}

interface NumberPadProviderProps {
  children: ReactNode;
  startRestTimer: (seconds: number) => void;
  onPRDetected?: (exerciseName: string, pr: PRDetectionResult) => void;
}

export function NumberPadProvider({ children, startRestTimer, onPRDetected }: NumberPadProviderProps) {
  const store = useActiveWorkoutStore();
  const unitSystem = useSettingsStore((s) => s.unitSystem);
  const [activeFocus, setActiveFocus] = useState<NumberPadFocus | null>(null);
  const [buffer, setBuffer] = useState('');
  const bufferRef = useRef('');
  const focusRef = useRef<NumberPadFocus | null>(null);

  const flushBuffer = useCallback((buf: string, focus: NumberPadFocus) => {
    if (isWeightField(focus.field)) {
      const parsed = parseFloat(buf);
      const val = isNaN(parsed) || buf === '' ? null : toStorageWeight(parsed, unitSystem);
      const updateField: Partial<Record<NumberPadField, number | null>> = { [focus.field]: val };
      store.updateSet(focus.exerciseIndex, focus.setIndex, updateField);
    } else {
      const parsed = parseInt(buf);
      const val = isNaN(parsed) || buf === '' ? null : parsed;
      const updateField: Partial<Record<NumberPadField, number | null>> = { [focus.field]: val };
      store.updateSet(focus.exerciseIndex, focus.setIndex, updateField);
    }
  }, [store, unitSystem]);

  const activate = useCallback((focus: NumberPadFocus, initialValue: number | null) => {
    // Flush previous focus if switching cells
    if (focusRef.current) {
      flushBuffer(bufferRef.current, focusRef.current);
    }

    let initBuf = '';
    if (initialValue !== null && initialValue !== 0) {
      if (isWeightField(focus.field)) {
        const display = toDisplayWeight(initialValue, unitSystem);
        initBuf = String(display);
      } else {
        initBuf = String(initialValue);
      }
    }

    bufferRef.current = initBuf;
    focusRef.current = focus;
    setBuffer(initBuf);
    setActiveFocus(focus);
  }, [flushBuffer, unitSystem]);

  const deactivate = useCallback(() => {
    if (focusRef.current) {
      flushBuffer(bufferRef.current, focusRef.current);
    }
    bufferRef.current = '';
    focusRef.current = null;
    setBuffer('');
    setActiveFocus(null);
  }, [flushBuffer]);

  const pressDigit = useCallback((digit: string) => {
    const focus = focusRef.current;
    if (!focus) return;

    const maxLen = focus.field === 'weight' ? 6 : 3;
    if (bufferRef.current.length >= maxLen) return;

    const next = bufferRef.current + digit;
    bufferRef.current = next;
    setBuffer(next);
    flushBuffer(next, focus);
  }, [flushBuffer]);

  const pressDecimal = useCallback(() => {
    const focus = focusRef.current;
    if (!focus || isRepsField(focus.field)) return;
    if (bufferRef.current.includes('.')) return;

    const next = bufferRef.current + '.';
    bufferRef.current = next;
    setBuffer(next);
  }, []);

  const pressBackspace = useCallback(() => {
    const focus = focusRef.current;
    if (!focus || bufferRef.current.length === 0) return;

    const next = bufferRef.current.slice(0, -1);
    bufferRef.current = next;
    setBuffer(next);
    flushBuffer(next, focus);
  }, [flushBuffer]);

  const pressNext = useCallback(() => {
    const focus = focusRef.current;
    if (!focus) return;

    flushBuffer(bufferRef.current, focus);

    if (focus.field === 'weight' || focus.field === 'leftWeight' || focus.field === 'rightWeight') {
      // Move to reps field for the current side.
      const set = store.exercises[focus.exerciseIndex]?.sets[focus.setIndex];
      const nextField =
        focus.field === 'weight'
          ? 'reps'
          : focus.field === 'leftWeight'
            ? 'leftReps'
            : 'rightReps';
      const repsVal = set?.[nextField] ?? null;
      let initBuf = '';
      if (repsVal !== null && repsVal !== 0) {
        initBuf = String(repsVal);
      }

      const newFocus: NumberPadFocus = { ...focus, field: nextField };
      bufferRef.current = initBuf;
      focusRef.current = newFocus;
      setBuffer(initBuf);
      setActiveFocus(newFocus);
    } else if (focus.field === 'leftReps') {
      // Split mode: jump from left reps to right weight.
      const set = store.exercises[focus.exerciseIndex]?.sets[focus.setIndex];
      const rightWeight = set?.rightWeight ?? null;
      let initBuf = '';
      if (rightWeight !== null && rightWeight !== 0) {
        initBuf = String(toDisplayWeight(rightWeight, unitSystem));
      }

      const newFocus: NumberPadFocus = { ...focus, field: getNextFieldForSplit(focus.field) };
      bufferRef.current = initBuf;
      focusRef.current = newFocus;
      setBuffer(initBuf);
      setActiveFocus(newFocus);
    } else {
      // Complete the set and start rest timer
      const ex = store.exercises[focus.exerciseIndex];
      if (ex) {
        const setBeforeComplete = ex.sets[focus.setIndex];
        store.completeSet(focus.exerciseIndex, focus.setIndex);
        if (ex.exerciseCategory !== 'cardio' && !setBeforeComplete?.isWarmup) {
          startRestTimer(ex.restTimerSeconds);
        }

        // PR detection
        if (setBeforeComplete && onPRDetected) {
          const prev = store.previousPerformance[ex.exerciseId] || [];
          const prs = detectPRs(setBeforeComplete, ex, prev);
          const prStore = usePRStore.getState();
          for (const pr of prs) {
            if (store.workoutId && !prStore.hasFired(store.workoutId, ex.exerciseId, pr.metric)) {
              prStore.markFired(store.workoutId, ex.exerciseId, pr.metric);
              prStore.addPR({
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

        // Auto-advance to next incomplete set in same exercise
        const nextSetIdx = ex.sets.findIndex(
          (s, idx) => idx > focus.setIndex && !s.isCompleted
        );

        if (nextSetIdx !== -1) {
          const nextSet = ex.sets[nextSetIdx];
          const nextField: NumberPadField = ex.logMode === 'split_lr' ? 'leftWeight' : 'weight';
          const weightVal = nextField === 'leftWeight' ? nextSet.leftWeight : nextSet.weight;
          let initBuf = '';
          if (weightVal !== null && weightVal !== 0) {
            const display = toDisplayWeight(weightVal, unitSystem);
            initBuf = String(display);
          }

          const newFocus: NumberPadFocus = {
            exerciseIndex: focus.exerciseIndex,
            setIndex: nextSetIdx,
            field: nextField,
          };
          bufferRef.current = initBuf;
          focusRef.current = newFocus;
          setBuffer(initBuf);
          setActiveFocus(newFocus);
          return;
        }
      }

      // No more sets, deactivate
      bufferRef.current = '';
      focusRef.current = null;
      setBuffer('');
      setActiveFocus(null);
    }
  }, [flushBuffer, store, startRestTimer, unitSystem, onPRDetected]);

  return (
    <NumberPadCtx.Provider
      value={{ activeFocus, buffer, activate, deactivate, pressDigit, pressDecimal, pressBackspace, pressNext }}
    >
      {children}
    </NumberPadCtx.Provider>
  );
}
