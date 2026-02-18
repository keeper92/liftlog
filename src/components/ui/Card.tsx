interface CardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  noPadding?: boolean;
}

export default function Card({ children, className = '', onClick, noPadding = false }: CardProps) {
  const Component = onClick ? 'button' : 'div';

  return (
    <Component
      onClick={onClick}
      className={`
        rounded-2xl border border-border/70 bg-surface card-shadow
        ${noPadding ? '' : 'p-4'}
        ${onClick ? 'cursor-pointer card-shadow-interactive hover:border-border-strong text-left w-full' : ''}
        ${className}
      `}
    >
      {children}
    </Component>
  );
}
