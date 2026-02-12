'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { useActiveWorkoutStore } from '@/stores/activeWorkoutStore';

function formatDuration(totalSeconds: number): string {
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export default function ActiveWorkoutRibbon() {
  const pathname = usePathname();
  const { isActive, workoutId, workoutName, startTime } = useActiveWorkoutStore();
  const [elapsed, setElapsed] = useState(0);

  // Tick the elapsed timer every second
  useEffect(() => {
    if (!isActive || !startTime) {
      setElapsed(0);
      return;
    }

    // Set initial value immediately
    setElapsed(Math.floor((Date.now() - new Date(startTime).getTime()) / 1000));

    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - new Date(startTime).getTime()) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [isActive, startTime]);

  // Don't render on workout pages or when no active workout
  const isOnWorkoutPage = pathname.startsWith('/workout');
  if (!isActive || !workoutId || isOnWorkoutPage) {
    return null;
  }

  return (
    <Link
      href={`/workout/${workoutId}`}
      className="fixed bottom-[calc(56px+env(safe-area-inset-bottom))] left-0 right-0 z-50 animate-slide-up"
    >
      <div className="mx-auto max-w-lg">
        <div className="mx-2 flex items-center justify-between rounded-xl bg-primary px-4 py-2.5 shadow-lg">
          <div className="flex items-center gap-3 min-w-0">
            {/* Pulsing dot indicator */}
            <div className="relative flex-shrink-0">
              <div className="h-2.5 w-2.5 rounded-full bg-white" />
              <div className="absolute inset-0 h-2.5 w-2.5 animate-ping rounded-full bg-white opacity-75" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">
                {workoutName || 'Workout'}
              </p>
              <p className="text-xs text-white/80">
                {formatDuration(elapsed)}
              </p>
            </div>
          </div>
          <div className="flex-shrink-0 ml-3">
            <span className="text-sm font-semibold text-white">
              Resume &rarr;
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
