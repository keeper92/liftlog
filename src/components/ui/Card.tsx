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
        ${onClick ? 'cursor-pointer transition-all hover:card-shadow-md active:scale-[0.99] text-left w-full' : ''}
        ${className}
      `}
    >
      {children}
    </Component>
  );
}
