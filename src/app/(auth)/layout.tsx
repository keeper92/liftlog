export const dynamic = 'force-dynamic';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-background px-4 py-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_color-mix(in_srgb,var(--primary)_16%,transparent)_0%,transparent_55%)]" />
      <div className="relative w-full max-w-md">
        {children}
      </div>
    </div>
  );
}
