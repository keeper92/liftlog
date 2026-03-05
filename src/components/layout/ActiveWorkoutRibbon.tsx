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
      className="fixed bottom-[calc(130px+env(safe-area-inset-bottom))] left-0 right-0 z-50 animate-slide-up lg:static lg:z-auto"
    >
      <div className="mx-auto max-w-[430px]">
        <div className="mx-3 flex items-center justify-center rounded-lg border border-primary/20 bg-primary px-4 py-3 shadow-sm">
          <span className="text-sm font-medium text-primary-foreground">
            Resume Workout &rarr;
          </span>
        </div>
      </div>
    </Link>
  );
}
