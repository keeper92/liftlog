export const dynamic = 'force-dynamic';

import BottomNav from '@/components/layout/BottomNav';
import ActiveWorkoutRibbon from '@/components/layout/ActiveWorkoutRibbon';
import DesktopMobileFrame from '@/components/layout/DesktopMobileFrame';
import MainContent from '@/components/layout/MainContent';
import WorkoutOutboxSync from '@/components/sync/WorkoutOutboxSync';
import { ChatBar } from '@/components/chat';

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <DesktopMobileFrame>
      <div className="relative flex min-h-dvh flex-col bg-background lg:h-full lg:min-h-0">
        <WorkoutOutboxSync />
        <MainContent>{children}</MainContent>
        <ActiveWorkoutRibbon />
        <ChatBar />
        <BottomNav />
      </div>
    </DesktopMobileFrame>
  );
}
