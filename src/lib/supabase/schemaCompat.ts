const SPLIT_SET_COLUMNS = [
  'is_split_lr',
  'left_weight',
  'left_reps',
  'right_weight',
  'right_reps',
] as const;

interface PostgrestLikeError {
  code?: unknown;
  message?: unknown;
  details?: unknown;
  hint?: unknown;
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function isMissingSplitSetColumnsError(error: unknown): boolean {
  const pgError = (error ?? {}) as PostgrestLikeError;
  const code = asText(pgError.code);
  const joined = [
    asText(pgError.message),
    asText(pgError.details),
    asText(pgError.hint),
    error instanceof Error ? error.message : '',
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (!joined) return false;

  const mentionsSplitColumn = SPLIT_SET_COLUMNS.some((column) => joined.includes(column));
  if (!mentionsSplitColumn) return false;

  return (
    code === 'PGRST204' ||
    code === '42703' ||
    joined.includes('schema cache') ||
    joined.includes('could not find') ||
    joined.includes('does not exist')
  );
}
