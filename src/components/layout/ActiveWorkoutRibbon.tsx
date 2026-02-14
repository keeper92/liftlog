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

  // Don't render on workout pages, home (has its own resume button), or when no active workout
  const isOnWorkoutPage = pathname.startsWith('/workout');
  const isOnDashboard = pathname === '/dashboard';
  if (!isActive || !workoutId || isOnWorkoutPage || isOnDashboard) {
    return null;
  }

  return (
    <Link
      href={`/workout/${workoutId}`}
      className="fixed bottom-[calc(56px+env(safe-area-inset-bottom))] left-0 right-0 z-50 animate-slide-up"
    >
      <div className="mx-auto max-w-lg">
        <div className="mx-2 flex items-center justify-center rounded-xl bg-primary px-4 py-2.5 shadow-lg">
          <span className="text-sm font-semibold text-white">
            Resume Workout &rarr;
          </span>
        </div>
      </div>
    </Link>
  );
}
