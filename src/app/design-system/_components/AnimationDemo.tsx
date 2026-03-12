'use client';

import { useState } from 'react';

interface AnimationDemoProps {
  className: string;
  label: string;
}

export default function AnimationDemo({ className, label }: AnimationDemoProps) {
  const [key, setKey] = useState(0);

  return (
    <div className="flex flex-col items-center gap-3">
      <div
        key={key}
        className={`rounded-lg bg-primary/20 border border-primary/30 px-6 py-4 text-sm font-medium text-foreground ${className}`}
      >
        {label}
      </div>
      <button
        onClick={() => setKey((k) => k + 1)}
        className="text-xs font-mono text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
      >
        ↻ Replay
      </button>
    </div>
  );
}
