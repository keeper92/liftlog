'use client';

import * as React from 'react';
import { DayPicker } from 'react-day-picker';
import { cn } from '@/lib/utils';

export type CalendarProps = React.ComponentProps<typeof DayPicker> & {
  highlighted?: Date[];
};

const navButtonClass = cn(
  'inline-flex h-7 w-7 items-center justify-center rounded-md border border-input bg-background p-0 shadow-sm',
  'text-muted-foreground opacity-80 transition-colors hover:bg-accent hover:text-accent-foreground hover:opacity-100',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30',
  'disabled:pointer-events-none disabled:opacity-40',
);

export function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  highlighted = [],
  modifiers,
  modifiersClassNames,
  components,
  ...props
}: CalendarProps) {
  const mergedModifiers = React.useMemo(
    () => ({
      ...modifiers,
      highlighted,
    }),
    [highlighted, modifiers],
  );

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn('p-1', className)}
      modifiers={mergedModifiers}
      modifiersClassNames={{
        highlighted:
          'after:content-[""] after:absolute after:left-1/2 after:bottom-1.5 after:h-1 after:w-1 after:-translate-x-1/2 after:rounded-full after:bg-current',
        ...modifiersClassNames,
      }}
      classNames={{
        months: 'flex flex-col gap-2 sm:flex-row',
        month: 'space-y-3',
        month_caption: 'relative flex items-center justify-center pt-1',
        caption_label: 'text-sm font-medium',
        nav: 'flex items-center gap-1',
        button_previous: cn(navButtonClass, 'absolute left-1'),
        button_next: cn(navButtonClass, 'absolute right-1'),
        month_grid: 'w-full border-collapse space-y-1',
        weekdays: 'flex',
        weekday: 'w-9 rounded-md text-[0.75rem] font-medium text-muted-foreground',
        week: 'mt-1.5 flex w-full',
        day: cn(
          'relative p-0 text-center text-sm focus-within:relative focus-within:z-20',
          '[&:has([aria-selected])]:bg-accent/40 first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md',
        ),
        day_button: cn(
          'inline-flex h-9 w-9 items-center justify-center rounded-md p-0 text-sm font-normal',
          'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30',
        ),
        selected:
          'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground',
        today: 'border border-primary/35 text-foreground',
        outside:
          'text-muted-foreground opacity-55 aria-selected:bg-accent/50 aria-selected:text-muted-foreground aria-selected:opacity-40',
        disabled: 'text-muted-foreground opacity-40',
        range_middle: 'aria-selected:bg-accent aria-selected:text-accent-foreground',
        hidden: 'invisible',
        ...classNames,
      }}
      components={{
        Chevron: ({ className: chevronClassName, orientation = 'left', ...rest }) => {
          const rotationClass =
            orientation === 'up'
              ? '-rotate-90'
              : orientation === 'down'
                ? 'rotate-90'
                : orientation === 'right'
                  ? 'rotate-180'
                  : '';

          return (
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className={cn('h-4 w-4', rotationClass, chevronClassName)}
              {...rest}
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
          );
        },
        ...components,
      }}
      {...props}
    />
  );
}
