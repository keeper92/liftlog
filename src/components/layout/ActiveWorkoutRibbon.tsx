'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useActiveWorkoutStore } from '@/stores/activeWorkoutStore';

export default function ActiveWorkoutRibbon() {
  const pathname = usePathname();
  const { isActive, workoutId } = useActiveWorkoutStore();

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
