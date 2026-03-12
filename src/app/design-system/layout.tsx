import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Design System - Reps',
  robots: 'noindex, nofollow',
};

export default function DesignSystemLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      {children}
    </div>
  );
}
