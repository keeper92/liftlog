'use client';

import { usePathname } from 'next/navigation';
import { useActiveWorkoutStore } from '@/stores/activeWorkoutStore';

export default function MainContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isActive = useActiveWorkoutStore((s) => s.isActive);

  const isOnWorkoutPage = pathname.startsWith('/workout');
  const isWorkoutSession = pathname.startsWith('/workout/') && !pathname.startsWith('/workout/summary/');
  const showRibbon = isActive && !isOnWorkoutPage;
  const bottomPadding = isWorkoutSession ? 'pb-0' : showRibbon ? 'pb-52' : 'pb-40';

  return (
    <main className={`flex-1 ${bottomPadding}`}>
      {children}
    </main>
  );
}
