import * as React from 'react';
import { cn } from '@/lib/utils';

const buttonVariants = {
  default:
    'bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring/35',
  destructive:
    'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90 focus-visible:ring-2 focus-visible:ring-destructive/35',
  outline:
    'border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring/30',
  secondary:
    'bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/85 focus-visible:ring-2 focus-visible:ring-ring/30',
  ghost:
    'hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring/30',
  link: 'text-primary underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring/30',
} as const;

const buttonSizes = {
  default: 'h-10 px-4 py-2',
  sm: 'h-9 rounded-md px-3',
  lg: 'h-11 rounded-md px-8',
  icon: 'h-10 w-10',
} as const;

export type ButtonVariant = keyof typeof buttonVariants;
export type ButtonSize = keyof typeof buttonSizes;

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', type = 'button', ...props }, ref) => {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-colors',
          'focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50',
          buttonVariants[variant],
          buttonSizes[size],
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
