'use client';

import { useEffect } from 'react';
import { toDisplayWeight, weightUnit } from '@/lib/utils/units';
import type { UnitSystem } from '@/lib/types/user';

interface PRToastProps {
  exerciseName: string;
  metric: 'weight' | 'reps';
  previousValue: number;
  newValue: number;
  unitSystem: UnitSystem;
  onDismiss: () => void;
}

export default function PRToast({ exerciseName, metric, previousValue, newValue, unitSystem, onDismiss }: PRToastProps) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 2200);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  const improvement = newValue - previousValue;
  const displayText =
    metric === 'weight'
      ? `+${toDisplayWeight(improvement, unitSystem)} ${weightUnit(unitSystem)} on ${exerciseName}!`
      : `+${improvement} reps on ${exerciseName}!`;

  return (
    <div className="fixed top-6 left-0 right-0 z-[110] flex justify-center pointer-events-none">
      <div className="animate-pr-toast pointer-events-auto bg-primary text-white px-5 py-3 rounded-2xl shadow-lg flex items-center gap-3 max-w-[90%]">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" className="flex-shrink-0">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
        <div>
          <p className="text-sm font-bold">New PR!</p>
          <p className="text-xs opacity-90">{displayText}</p>
        </div>
      </div>
    </div>
  );
}
