'use client';

import * as React from 'react';
import { useNumberPad } from './NumberPadContext';
import { Button } from '@/components/ui/button-shadcn';
import { Card } from '@/components/ui/card-shadcn';
import { cn } from '@/lib/utils';

interface RestTimerState {
  isActive: boolean;
  secondsRemaining: number;
  totalSeconds: number;
}

interface NumberPadProps {
  restTimer: RestTimerState;
  onStopRestTimer: () => void;
}

export default function NumberPad({ restTimer, onStopRestTimer }: NumberPadProps) {
  const { activeFocus, pressDigit, pressDecimal, pressBackspace, pressNext, deactivate } = useNumberPad();

  if (!activeFocus) return null;

  const isReps = activeFocus.field === 'reps' || activeFocus.field === 'leftReps' || activeFocus.field === 'rightReps';
  const fieldLabelMap: Record<typeof activeFocus.field, string> = {
    weight: 'Weight',
    reps: 'Reps',
    leftWeight: 'Left Weight',
    leftReps: 'Left Reps',
    rightWeight: 'Right Weight',
    rightReps: 'Right Reps',
    time: 'Time',
    distance: 'Distance',
  };
  const decimalLabel = activeFocus.field === 'time' ? ':' : '.';

  const handlePointerDown = (e: React.PointerEvent, action: () => void) => {
    e.stopPropagation();
    e.preventDefault();
    action();
  };

  const digitBtn = (digit: string) => (
    <Button
      key={digit}
      type="button"
      variant="outline"
      onPointerDown={(e) => handlePointerDown(e, () => pressDigit(digit))}
      className="h-10 rounded-md border-border/60 bg-background text-lg font-medium shadow-none select-none active:bg-accent"
    >
      {digit}
    </Button>
  );

  return (
    <div className="fixed inset-x-0 bottom-[6.5rem] z-50 px-2 lg:absolute lg:inset-x-0 lg:bottom-[6.5rem]">
      <div className="mx-auto flex w-full max-w-[430px] justify-center">
        <Card
          className="w-[min(22rem,calc(100vw-1rem))] rounded-lg border-border/70 bg-card px-2.5 pb-2 pt-2 shadow-sm"
          onPointerDown={(e) => e.stopPropagation()}
        >
          {/* Mini rest timer bar */}
          {restTimer.isActive && (
            <div className="mb-2 flex items-center gap-2 px-1">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-all duration-1000 ease-linear"
                  style={{
                    width: `${(restTimer.secondsRemaining / restTimer.totalSeconds) * 100}%`,
                  }}
                />
              </div>
              <span className="min-w-[36px] text-right text-xs tabular-nums text-muted-foreground">
                {Math.floor(restTimer.secondsRemaining / 60)}:{(restTimer.secondsRemaining % 60).toString().padStart(2, '0')}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onPointerDown={(e) => handlePointerDown(e, onStopRestTimer)}
                className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
              >
                Skip
              </Button>
            </div>
          )}

          {/* Field indicator */}
          <div className="mb-2 flex items-center justify-between px-1">
            <span className="text-xs font-medium text-muted-foreground">
              {fieldLabelMap[activeFocus.field]}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onPointerDown={(e) => handlePointerDown(e, deactivate)}
              className="h-6 w-6 rounded-full text-muted-foreground hover:text-foreground"
              aria-label="Close numpad"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </Button>
          </div>

          {/* Number grid: 4 rows x 4 cols, NEXT spans right column */}
          <div className="grid grid-cols-[1fr_1fr_1fr_minmax(64px,1fr)] gap-1.5">
            {/* Row 1 */}
            {digitBtn('1')}
            {digitBtn('2')}
            {digitBtn('3')}

            {/* NEXT button spanning 4 rows */}
            <Button
              type="button"
              onPointerDown={(e) => handlePointerDown(e, pressNext)}
              className="row-span-4 h-auto select-none rounded-md bg-primary text-sm font-semibold text-primary-foreground active:bg-primary/85"
            >
              NEXT
            </Button>

            {/* Row 2 */}
            {digitBtn('4')}
            {digitBtn('5')}
            {digitBtn('6')}

            {/* Row 3 */}
            {digitBtn('7')}
            {digitBtn('8')}
            {digitBtn('9')}

            {/* Row 4 */}
            <Button
              type="button"
              variant="outline"
              onPointerDown={(e) => handlePointerDown(e, pressDecimal)}
              disabled={isReps}
              className={cn(
                'h-10 select-none rounded-md border-border/60 bg-background text-lg font-medium shadow-none',
                isReps ? 'pointer-events-none opacity-40' : 'active:bg-accent',
              )}
            >
              {decimalLabel}
            </Button>
            {digitBtn('0')}
            <Button
              type="button"
              variant="outline"
              onPointerDown={(e) => handlePointerDown(e, pressBackspace)}
              className="h-10 select-none rounded-md border-border/60 bg-background shadow-none active:bg-accent"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z" />
                <line x1="18" y1="9" x2="12" y2="15" />
                <line x1="12" y1="9" x2="18" y2="15" />
              </svg>
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
