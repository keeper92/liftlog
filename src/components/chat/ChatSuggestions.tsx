'use client';

import { Button } from '@/components/ui/button-shadcn';

interface ChatSuggestionsProps {
  suggestions: string[];
  onSelect: (suggestion: string) => void;
  label?: string;
}

export default function ChatSuggestions({ suggestions, onSelect, label }: ChatSuggestionsProps) {
  if (suggestions.length === 0) return null;

  return (
    <div>
      {label && <p className="mb-2 text-sm font-medium text-muted-foreground">{label}</p>}
      <div className="flex flex-wrap gap-2">
        {suggestions.map((s) => (
          <Button
            type="button"
            key={s}
            onClick={() => onSelect(s)}
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
