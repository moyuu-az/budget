import { forwardRef, type HTMLAttributes, type ElementType } from 'react';
import { cn } from '../../lib/cn';

type CardPadding = 'none' | 'sm' | 'md' | 'lg';

interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType;
  padding?: CardPadding;
  interactive?: boolean;
  glow?: 'blue' | 'green' | 'red' | 'purple' | 'none';
}

const paddingClasses: Record<CardPadding, string> = {
  none: '',
  sm: 'p-3',
  md: 'p-5',
  lg: 'p-6',
};

const glowClasses = {
  blue: 'shadow-[0_0_20px_rgba(79,70,229,0.15),0_0_40px_rgba(79,70,229,0.05)]',
  green: 'shadow-[0_0_20px_rgba(34,197,94,0.15),0_0_40px_rgba(34,197,94,0.05)]',
  red: 'shadow-[0_0_20px_rgba(239,68,68,0.15),0_0_40px_rgba(239,68,68,0.05)]',
  purple: 'shadow-[0_0_20px_rgba(139,92,246,0.15),0_0_40px_rgba(139,92,246,0.05)]',
  none: '',
} as const;

export const Card = forwardRef<HTMLElement, CardProps>(function Card(
  { as: Component = 'div', padding = 'md', interactive = false, glow = 'none', className, children, ...rest },
  ref,
) {
  return (
    <Component
      ref={ref}
      className={cn(
        'rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)]',
        'bg-[var(--color-surface-raised)] backdrop-blur-[12px]',
        'transition-[transform,box-shadow,border-color] duration-[var(--duration-base)]',
        interactive &&
          'cursor-pointer hover:-translate-y-0.5 hover:border-[var(--color-border-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)]',
        paddingClasses[padding],
        glowClasses[glow],
        className,
      )}
      tabIndex={interactive ? 0 : undefined}
      role={interactive ? 'button' : undefined}
      {...rest}
    >
      {children}
    </Component>
  );
});
