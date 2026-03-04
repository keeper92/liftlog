'use client';

import { usePathname } from 'next/navigation';
import { useActiveWorkoutStore } from '@/stores/activeWorkoutStore';

export default function MainContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isActive = useActiveWorkoutStore((s) => s.isActive);

  const isOnWorkoutPage = pathname.startsWith('/workout');
  const isWorkoutSession = pathname.startsWith('/workout/') && !pathname.startsWith('/workout/summary/');
  const isTrainerPage = pathname === '/trainer';
  const showRibbon = isActive && !isOnWorkoutPage;

  // During workout sessions: no bottom padding (no nav/chatbar)
  // Trainer page: has its own layout, just needs nav padding
  // With active workout ribbon: extra padding for ribbon + chatbar + nav
  // Default: padding for chatbar + nav
  const bottomPadding = isWorkoutSession
    ? 'pb-0'
    : isTrainerPage
      ? 'pb-24'
      : showRibbon
        ? 'pb-48'
        : 'pb-40';

  return (
    <main className={`flex-1 ${bottomPadding}`}>
      {children}
    </main>
  );
}
