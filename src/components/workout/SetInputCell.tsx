'use client';

import { useRef, useEffect } from 'react';
import { useNumberPad, type NumberPadField } from './NumberPadContext';

interface SetInputCellProps {
  exerciseIndex: number;
  setIndex: number;
  field: NumberPadField;
  displayValue: string;
  rawValue: number | null;
  placeholder: string;
  isCompleted: boolean;
}

export default function SetInputCell({
  exerciseIndex,
  setIndex,
  field,
  displayValue,
  rawValue,
  placeholder,
  isCompleted,
}: SetInputCellProps) {
  const { activeFocus, buffer, activate } = useNumberPad();
  const cellRef = useRef<HTMLDivElement>(null);

  const isActive =
    activeFocus?.exerciseIndex === exerciseIndex &&
    activeFocus?.setIndex === setIndex &&
    activeFocus?.field === field;

  // Scroll into view when activated
  useEffect(() => {
    if (isActive && cellRef.current) {
      cellRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [isActive]);

  const handleTap = (e: React.PointerEvent) => {
    e.stopPropagation();
    if (isCompleted && !isActive) return;
    activate({ exerciseIndex, setIndex, field }, rawValue);
  };

  const shownValue = isActive ? buffer : displayValue;

  return (
    <div
      ref={cellRef}
      onPointerDown={handleTap}
      className={`bg-background rounded-lg px-2 py-2 text-center text-sm min-h-[44px] w-full border flex items-center justify-center select-none ${
        isActive
          ? 'border-primary ring-2 ring-primary/20'
          : 'border-border'
      } ${isCompleted && !isActive ? 'opacity-60 cursor-not-allowed' : ''}`}
    >
      {shownValue ? (
        <span>
          {shownValue}
          {isActive && <span className="animate-pulse ml-px">|</span>}
        </span>
      ) : (
        <span className={isActive ? 'text-muted-foreground' : 'text-muted-foreground/50'}>
          {isActive && <span className="animate-pulse mr-px">|</span>}
          {!isActive && placeholder}
        </span>
      )}
    </div>
  );
}
