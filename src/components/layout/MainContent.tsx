'use client';

import { usePathname } from 'next/navigation';
import { useActiveWorkoutStore } from '@/stores/activeWorkoutStore';

export default function MainContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isActive = useActiveWorkoutStore((s) => s.isActive);

  const isOnWorkoutPage = pathname.startsWith('/workout');
  const showRibbon = isActive && !isOnWorkoutPage;

  return (
    <main className={`flex-1 ${showRibbon ? 'pb-28' : 'pb-16'}`}>
      {children}
    </main>
  );
}
