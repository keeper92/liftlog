'use client';

import { usePathname } from 'next/navigation';
import { useActiveWorkoutStore } from '@/stores/activeWorkoutStore';

export default function MainContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isActive = useActiveWorkoutStore((s) => s.isActive);

  const isOnWorkoutPage = pathname.startsWith('/workout');
  const showRibbon = isActive && !isOnWorkoutPage;

  // All screens get consistent padding for chatbar + nav
  // With active workout ribbon: extra padding for ribbon
  const bottomPadding = showRibbon ? 'pb-48' : 'pb-40';

  return (
    <main className={`flex-1 ${bottomPadding}`}>
      {children}
    </main>
  );
}
