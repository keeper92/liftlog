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
        rounded-2xl bg-surface card-shadow
        ${noPadding ? '' : 'p-4'}
        ${onClick ? 'cursor-pointer card-shadow-interactive text-left w-full' : ''}
        ${className}
      `}
    >
      {children}
    </Component>
  );
}
