'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button-shadcn';
import { cn } from '@/lib/utils';

const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

interface CalendarProps extends React.HTMLAttributes<HTMLDivElement> {
  month?: Date;
  onMonthChange?: (month: Date) => void;
  selected?: Date;
  onDateSelect?: (date?: Date) => void;
  highlighted?: Date[];
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function getDaysInMonth(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

function getFirstDayOfMonth(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
}

export function Calendar({
  className,
  month,
  onMonthChange,
  selected,
  onDateSelect,
  highlighted = [],
  ...props
}: CalendarProps) {
  const [internalMonth, setInternalMonth] = React.useState<Date>(startOfMonth(month ?? selected ?? new Date()));
  const isControlledMonth = typeof month !== 'undefined';
  const displayMonth = isControlledMonth ? startOfMonth(month) : internalMonth;

  const selectedDateKey = selected ? toDateKey(selected) : null;
  const todayDateKey = toDateKey(new Date());
  const highlightedDateKeys = React.useMemo(() => new Set(highlighted.map((date) => toDateKey(date))), [highlighted]);

  const daysInMonth = getDaysInMonth(displayMonth);
  const firstDay = getFirstDayOfMonth(displayMonth);
  const monthLabel = displayMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  function moveMonth(offset: number) {
    const nextMonth = new Date(displayMonth.getFullYear(), displayMonth.getMonth() + offset, 1);
    if (!isControlledMonth) {
      setInternalMonth(nextMonth);
    }
    onMonthChange?.(nextMonth);
  }

  return (
    <div className={cn('space-y-3', className)} {...props}>
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-md"
          onClick={() => moveMonth(-1)}
          aria-label="Go to previous month"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </Button>
        <p className="text-sm font-medium">{monthLabel}</p>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-md"
          onClick={() => moveMonth(1)}
          aria-label="Go to next month"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {DAY_LABELS.map((day) => (
          <div key={day} className="text-center text-xs text-muted-foreground py-1 font-medium">
            {day}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: firstDay }).map((_, i) => (
          <div key={`empty-${i}`} className="h-9 w-9" />
        ))}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const date = new Date(displayMonth.getFullYear(), displayMonth.getMonth(), day);
          const dateKey = toDateKey(date);
          const isSelected = selectedDateKey === dateKey;
          const isToday = todayDateKey === dateKey;
          const isHighlighted = highlightedDateKeys.has(dateKey);

          return (
            <Button
              key={dateKey}
              type="button"
              variant="ghost"
              className={cn(
                'h-9 w-9 rounded-md p-0 text-xs font-medium relative',
                isSelected && 'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground',
                !isSelected && isToday && 'border border-primary/40 text-foreground',
                !isSelected && !isToday && 'hover:bg-accent hover:text-accent-foreground',
              )}
              onClick={() => onDateSelect?.(isSelected ? undefined : date)}
            >
              <time dateTime={dateKey}>{day}</time>
              {isHighlighted && !isSelected && (
                <span className="absolute bottom-1.5 h-1 w-1 rounded-full bg-primary" />
              )}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
