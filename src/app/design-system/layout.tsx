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
    <>
      <style>{`body { background-color: #ffffff !important; color: #000000 !important; }`}</style>
      <div className="min-h-dvh">
        {children}
      </div>
    </>
  );
}
