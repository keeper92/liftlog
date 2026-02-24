import { Card as ShadcnCard } from '@/components/ui/card-shadcn';
import { cn } from '@/lib/utils';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  noPadding?: boolean;
}

const baseClassName =
  'rounded-lg border bg-card text-card-foreground shadow-sm';

export default function Card({ children, className, onClick, noPadding = false }: CardProps) {
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          baseClassName,
          noPadding ? '' : 'p-4',
          'w-full cursor-pointer text-left transition-colors hover:bg-accent/30',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30',
          className
        )}
      >
        {children}
      </button>
    );
  }

  return (
    <ShadcnCard className={cn(baseClassName, noPadding ? '' : 'p-4', className)}>
      {children}
    </ShadcnCard>
  );
}
