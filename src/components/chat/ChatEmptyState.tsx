'use client';

import { Button } from '@/components/ui/button-shadcn';
import type { TrainerProfile } from '@/lib/types/user';

interface ChatEmptyStateProps {
  suggestions: string[];
  onSuggestionSelect: (suggestion: string) => void;
  onStartProfileSetup: () => void;
  trainerProfile: TrainerProfile | null;
}

export default function ChatEmptyState({
  suggestions,
  onSuggestionSelect,
  onStartProfileSetup,
  trainerProfile,
}: ChatEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center">
      <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-4">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </div>
      <p className="text-foreground font-semibold mb-1">Your AI Trainer</p>
      <p className="text-muted-foreground text-sm mb-6">
        Ask me anything about your training
      </p>

      {!trainerProfile && (
        <Button
          type="button"
          variant="outline"
          onClick={onStartProfileSetup}
          className="mb-6 h-auto w-full max-w-sm justify-start rounded-xl border-primary/20 bg-primary/5 p-4 text-left hover:bg-primary/10"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Set up your training profile</p>
              <p className="text-xs text-muted-foreground mt-0.5">Quick chat so I can personalize your experience</p>
            </div>
          </div>
        </Button>
      )}

      <div className="flex flex-wrap justify-center gap-2">
        {suggestions.map((s) => (
          <Button
            type="button"
            key={s}
            onClick={() => onSuggestionSelect(s)}
            variant="outline"
            size="sm"
            className="rounded-full"
          >
            {s}
          </Button>
        ))}
      </div>
    </div>
  );
}
