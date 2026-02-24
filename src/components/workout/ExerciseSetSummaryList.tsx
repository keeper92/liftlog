import type { ExerciseSetSummary } from '@/lib/utils/workoutSetSummary';

interface ExerciseSetSummaryListProps {
  summaries: ExerciseSetSummary[];
  emptyText?: string;
}

export default function ExerciseSetSummaryList({
  summaries,
  emptyText = 'No exercises logged.',
}: ExerciseSetSummaryListProps) {
  if (summaries.length === 0) {
    return (
      <p className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
        {emptyText}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {summaries.map((exercise, exerciseIndex) => (
        <div
          key={`${exercise.name}-${exerciseIndex}`}
          className="rounded-md border bg-muted/30 px-3 py-2"
        >
          <p className="break-words text-sm font-medium text-foreground">{exercise.name}</p>
          <div className="mt-1.5 space-y-1">
            {exercise.sets.map((set, setIndex) => (
              <div
                key={`${exercise.name}-${exerciseIndex}-set-${setIndex}`}
                className="grid grid-cols-[2.25rem_1fr] items-start gap-2 text-xs"
              >
                <span className="font-medium tabular-nums text-muted-foreground">
                  S{set.setNumber ?? setIndex + 1}
                </span>
                <span className="break-words tabular-nums text-foreground">{set.detail}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
