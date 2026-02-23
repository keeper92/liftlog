import { type InputHTMLAttributes } from 'react';
import { Input as ShadcnInput } from '@/components/ui/input-shadcn';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export default function Input({
  label,
  error,
  className,
  id,
  ...rest
}: InputProps) {
  const inputId = id || rest.name || label?.toLowerCase().replace(/\s+/g, '-');

  return (
    <div className="w-full space-y-1.5">
      {label && <Label htmlFor={inputId}>{label}</Label>}
      <ShadcnInput
        id={inputId}
        className={cn(
          'h-10 rounded-md',
          error && 'border-destructive focus-visible:ring-destructive/25',
          className
        )}
        {...rest}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
