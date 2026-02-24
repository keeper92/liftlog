export const dynamic = 'force-dynamic';

import BottomNav from '@/components/layout/BottomNav';
import ActiveWorkoutRibbon from '@/components/layout/ActiveWorkoutRibbon';
import DesktopMobileFrame from '@/components/layout/DesktopMobileFrame';
import MainContent from '@/components/layout/MainContent';
import WorkoutOutboxSync from '@/components/sync/WorkoutOutboxSync';

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <DesktopMobileFrame>
      <div className="flex min-h-dvh flex-col bg-background lg:min-h-full">
        <WorkoutOutboxSync />
        <MainContent>{children}</MainContent>
        <ActiveWorkoutRibbon />
        <BottomNav />
      </div>
    </DesktopMobileFrame>
  );
}
