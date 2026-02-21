const ASSISTANCE_EXERCISE_PATTERN =
  /\b(assisted|assistance|counter[\s-]?weight|gravitron|supported[\s-]?(pull[\s-]?up|chin[\s-]?up)|band[\s-]?assisted|machine[\s-]?assisted)\b/i;

export function isAssistanceExerciseName(name: string): boolean {
  return ASSISTANCE_EXERCISE_PATTERN.test(name);
}
