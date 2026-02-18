export const dynamic = 'force-dynamic';

import BottomNav from '@/components/layout/BottomNav';
import ActiveWorkoutRibbon from '@/components/layout/ActiveWorkoutRibbon';
import MainContent from '@/components/layout/MainContent';

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <MainContent>{children}</MainContent>
      <ActiveWorkoutRibbon />
      <BottomNav />
    </div>
  );
}
