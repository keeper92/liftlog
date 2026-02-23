import { type ButtonHTMLAttributes } from 'react';
import {
  Button as ShadcnButton,
  type ButtonSize,
  type ButtonVariant,
} from '@/components/ui/button-shadcn';
import { cn } from '@/lib/utils';

type LegacyButtonVariant = 'primary' | 'outline' | 'ghost' | 'danger';
type LegacyButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: LegacyButtonVariant;
  size?: LegacyButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
  unstyled?: boolean;
}

const variantMap: Record<LegacyButtonVariant, ButtonVariant> = {
  primary: 'default',
  outline: 'outline',
  ghost: 'ghost',
  danger: 'destructive',
};

const sizeMap: Record<LegacyButtonSize, ButtonSize> = {
  sm: 'sm',
  md: 'default',
  lg: 'lg',
};

export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  unstyled = false,
  disabled,
  children,
  className,
  ...rest
}: ButtonProps) {
  if (unstyled) {
    return (
      <button
        disabled={disabled || loading}
        className={cn(
          'disabled:cursor-not-allowed disabled:opacity-50',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30',
          fullWidth && 'w-full',
          className
        )}
        {...rest}
      >
        {loading && (
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
        )}
        {children}
      </button>
    );
  }

  return (
    <ShadcnButton
      variant={variantMap[variant]}
      size={sizeMap[size]}
      disabled={disabled || loading}
      className={cn(
        fullWidth && 'w-full',
        className
      )}
      {...rest}
    >
      {loading && (
        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
      )}
      {children}
    </ShadcnButton>
  );
}
