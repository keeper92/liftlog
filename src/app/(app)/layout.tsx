export const dynamic = 'force-dynamic';

import BottomNav from '@/components/layout/BottomNav';

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <main className="flex-1 pb-16">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
