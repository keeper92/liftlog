import { type InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export default function Input({
  label,
  error,
  className = '',
  id,
  ...rest
}: InputProps) {
  const inputId = id || rest.name || label?.toLowerCase().replace(/\s+/g, '-');

  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={inputId}
          className="mb-1.5 block text-sm font-medium text-text-secondary"
        >
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={`
          min-h-[48px] w-full rounded-xl border bg-background px-4 text-text
          placeholder:text-text-muted
          transition-colors duration-150 ease-in-out
          focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary
          disabled:cursor-not-allowed disabled:opacity-50
          ${error ? 'border-error focus:ring-error/20 focus:border-error' : 'border-border'}
          ${className}
        `}
        {...rest}
      />
      {error && (
        <p className="mt-1.5 text-xs text-error">{error}</p>
      )}
    </div>
  );
}
