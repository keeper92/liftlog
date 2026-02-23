'use client';

import { useNumberPad } from './NumberPadContext';
import Button from '@/components/ui/Button';

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
    <Button unstyled
      key={digit}
      onPointerDown={(e) => handlePointerDown(e, () => pressDigit(digit))}
      className="rounded-lg border border-border/40 bg-background/20 text-primary-foreground text-lg font-medium min-h-[42px] flex items-center justify-center active:bg-background/30 select-none"
    >
      {digit}
    </Button>
  );

  return (
    <div
      className="fixed bottom-[4.5rem] right-2 z-50 w-[min(22rem,calc(100vw-1rem))] rounded-2xl border border-border/60 bg-foreground px-2.5 pb-2 pt-2 shadow-2xl"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Mini rest timer bar */}
      {restTimer.isActive && (
        <div className="flex items-center gap-2 mb-2 px-1">
          <div className="flex-1 h-1.5 bg-background/25 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-1000 ease-linear"
              style={{
                width: `${(restTimer.secondsRemaining / restTimer.totalSeconds) * 100}%`,
              }}
            />
          </div>
          <span className="text-xs text-primary-foreground/70 tabular-nums min-w-[36px] text-right">
            {Math.floor(restTimer.secondsRemaining / 60)}:{(restTimer.secondsRemaining % 60).toString().padStart(2, '0')}
          </span>
          <Button unstyled
            onPointerDown={(e) => handlePointerDown(e, onStopRestTimer)}
            className="text-xs text-primary-foreground/50 hover:text-primary-foreground/80"
          >
            Skip
          </Button>
        </div>
      )}

      {/* Field indicator */}
      <div className="flex items-center justify-between mb-2 px-1">
        <span className="text-xs text-primary-foreground/50 uppercase tracking-wide">
          {fieldLabelMap[activeFocus.field]}
        </span>
        <Button unstyled
          onPointerDown={(e) => handlePointerDown(e, deactivate)}
          className="w-6 h-6 rounded-full text-primary-foreground/70 hover:text-primary-foreground hover:bg-background/20 flex items-center justify-center"
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
        <Button unstyled
          onPointerDown={(e) => handlePointerDown(e, pressNext)}
          className="row-span-4 bg-primary text-primary-foreground font-bold text-sm rounded-xl flex items-center justify-center active:bg-primary/85 select-none"
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
        <Button unstyled
          onPointerDown={(e) => handlePointerDown(e, pressDecimal)}
          disabled={isReps}
          className={`rounded-lg border border-border/40 bg-background/20 text-primary-foreground text-lg font-medium min-h-[42px] flex items-center justify-center select-none ${
            isReps ? 'opacity-30 pointer-events-none' : 'active:bg-background/30'
          }`}
        >
          {decimalLabel}
        </Button>
        {digitBtn('0')}
        <Button unstyled
          onPointerDown={(e) => handlePointerDown(e, pressBackspace)}
          className="rounded-lg border border-border/40 bg-background/20 text-primary-foreground min-h-[42px] flex items-center justify-center active:bg-background/30 select-none"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z" />
            <line x1="18" y1="9" x2="12" y2="15" />
            <line x1="12" y1="9" x2="18" y2="15" />
          </svg>
        </Button>
      </div>
    </div>
  );
}
