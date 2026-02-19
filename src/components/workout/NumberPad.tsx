'use client';

import { useNumberPad } from './NumberPadContext';

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
  const { activeFocus, pressDigit, pressDecimal, pressBackspace, pressNext } = useNumberPad();

  if (!activeFocus) return null;

  const isReps = activeFocus.field === 'reps' || activeFocus.field === 'leftReps' || activeFocus.field === 'rightReps';
  const fieldLabelMap: Record<typeof activeFocus.field, string> = {
    weight: 'Weight',
    reps: 'Reps',
    leftWeight: 'Left Weight',
    leftReps: 'Left Reps',
    rightWeight: 'Right Weight',
    rightReps: 'Right Reps',
  };

  const handlePointerDown = (e: React.PointerEvent, action: () => void) => {
    e.stopPropagation();
    e.preventDefault();
    action();
  };

  const digitBtn = (digit: string) => (
    <button
      key={digit}
      onPointerDown={(e) => handlePointerDown(e, () => pressDigit(digit))}
      className="bg-[#2C2C2E] text-white text-xl font-medium rounded-lg min-h-[48px] flex items-center justify-center active:bg-[#3A3A3C] select-none"
    >
      {digit}
    </button>
  );

  return (
    <div
      className="fixed bottom-16 left-0 right-0 z-50 bg-[#1C1C1E] border-t border-[#3A3A3C] px-3 pb-2 pt-2"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Mini rest timer bar */}
      {restTimer.isActive && (
        <div className="flex items-center gap-2 mb-2 px-1">
          <div className="flex-1 h-1.5 bg-[#3A3A3C] rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-1000 ease-linear"
              style={{
                width: `${(restTimer.secondsRemaining / restTimer.totalSeconds) * 100}%`,
              }}
            />
          </div>
          <span className="text-xs text-white/70 tabular-nums min-w-[36px] text-right">
            {Math.floor(restTimer.secondsRemaining / 60)}:{(restTimer.secondsRemaining % 60).toString().padStart(2, '0')}
          </span>
          <button
            onPointerDown={(e) => handlePointerDown(e, onStopRestTimer)}
            className="text-xs text-white/50 hover:text-white/80"
          >
            Skip
          </button>
        </div>
      )}

      {/* Field indicator */}
      <div className="flex items-center justify-center mb-2">
        <span className="text-xs text-white/50 uppercase tracking-wide">
          {fieldLabelMap[activeFocus.field]}
        </span>
      </div>

      {/* Number grid: 4 rows x 4 cols, NEXT spans right column */}
      <div className="grid grid-cols-[1fr_1fr_1fr_minmax(72px,1fr)] gap-1.5">
        {/* Row 1 */}
        {digitBtn('1')}
        {digitBtn('2')}
        {digitBtn('3')}

        {/* NEXT button spanning 4 rows */}
        <button
          onPointerDown={(e) => handlePointerDown(e, pressNext)}
          className="row-span-4 bg-primary text-white font-bold text-base rounded-xl flex items-center justify-center active:bg-primary-dark select-none"
        >
          NEXT
        </button>

        {/* Row 2 */}
        {digitBtn('4')}
        {digitBtn('5')}
        {digitBtn('6')}

        {/* Row 3 */}
        {digitBtn('7')}
        {digitBtn('8')}
        {digitBtn('9')}

        {/* Row 4 */}
        <button
          onPointerDown={(e) => handlePointerDown(e, pressDecimal)}
          disabled={isReps}
          className={`bg-[#2C2C2E] text-white text-xl font-medium rounded-lg min-h-[48px] flex items-center justify-center select-none ${
            isReps ? 'opacity-30 pointer-events-none' : 'active:bg-[#3A3A3C]'
          }`}
        >
          .
        </button>
        {digitBtn('0')}
        <button
          onPointerDown={(e) => handlePointerDown(e, pressBackspace)}
          className="bg-[#2C2C2E] text-white rounded-lg min-h-[48px] flex items-center justify-center active:bg-[#3A3A3C] select-none"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z" />
            <line x1="18" y1="9" x2="12" y2="15" />
            <line x1="12" y1="9" x2="18" y2="15" />
          </svg>
        </button>
      </div>
    </div>
  );
}
