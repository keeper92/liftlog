interface CardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

export default function Card({ children, className = '', onClick }: CardProps) {
  const Component = onClick ? 'button' : 'div';

  return (
    <Component
      onClick={onClick}
      className={`
        rounded-2xl border border-border bg-surface p-4
        ${onClick ? 'cursor-pointer transition-colors hover:bg-surface-light active:bg-surface-light text-left w-full' : ''}
        ${className}
      `}
    >
      {children}
    </Component>
  );
}
