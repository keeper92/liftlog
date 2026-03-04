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
  selectedTemplateId?: string | null;
  onSelect: (template: TemplateSummary) => void;
}

export default function TemplateChips({ templates, selectedTemplateId, onSelect }: TemplateChipsProps) {
  if (templates.length === 0) return null;

  return (
    <div
      className="flex gap-2 overflow-x-auto py-1 scrollbar-hide"
      data-tour-anchor="saved-templates"
    >
      {templates.map((template) => (
        <Button
          key={template.id}
          variant={selectedTemplateId === template.id ? 'secondary' : 'outline'}
          size="sm"
          onClick={() => onSelect(template)}
          className="flex-shrink-0 rounded-full px-3 py-1.5 text-xs font-medium"
        >
          {template.name}
        </Button>
      ))}
    </div>
  );
}
