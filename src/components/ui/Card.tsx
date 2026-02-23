import { Card as ShadcnCard } from '@/components/ui/card-shadcn';
import { cn } from '@/lib/utils';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  noPadding?: boolean;
}

const baseClassName =
  'rounded-2xl border border-border bg-card text-card-foreground shadow-sm';

export default function Card({ children, className, onClick, noPadding = false }: CardProps) {
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          baseClassName,
          noPadding ? '' : 'p-4',
          'w-full cursor-pointer text-left transition-shadow hover:shadow-md',
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
