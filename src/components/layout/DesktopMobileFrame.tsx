import { cn } from '@/lib/utils';

interface DesktopMobileFrameProps {
  children: React.ReactNode;
  className?: string;
}

export default function DesktopMobileFrame({
  children,
  className,
}: DesktopMobileFrameProps) {
  return (
    <div className={cn('min-h-dvh w-full lg:flex lg:items-end lg:justify-center lg:bg-muted/35 lg:px-5 lg:py-4', className)}>
      <div className="mx-auto min-h-dvh w-full lg:h-[932px] lg:max-h-[calc(100dvh-2rem)] lg:min-h-0 lg:w-[430px] lg:overflow-hidden lg:rounded-[2rem] lg:border lg:border-border/70 lg:bg-background lg:shadow-2xl">
        {children}
      </div>
    </div>
  );
}
