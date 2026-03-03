'use client';

import { Button } from '@/components/ui/button-shadcn';

interface TemplateSummary {
  id: string;
  name: string;
  template_exercises: {
    exercise_id: string;
    order_index: number;
    default_sets: number;
    exercises: { name: string; category: string };
  }[];
}

interface TemplateChipsProps {
  templates: TemplateSummary[];
  onSelect: (template: TemplateSummary) => void;
}

export default function TemplateChips({ templates, onSelect }: TemplateChipsProps) {
  if (templates.length === 0) return null;

  return (
    <div
      className="flex gap-2 overflow-x-auto py-1 scrollbar-hide"
      data-tour-anchor="saved-templates"
    >
      {templates.map((template) => (
        <Button
          key={template.id}
          variant="outline"
          size="sm"
          onClick={() => onSelect(template)}
          className="flex-shrink-0 rounded-full px-3 py-1.5 text-xs font-medium border-border/60 bg-card"
        >
          {template.name}
        </Button>
      ))}
    </div>
  );
}
