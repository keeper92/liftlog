const UNILATERAL_KEYWORD_PATTERN =
  /\b(one[-\s]?arm|single[-\s]?arm|one[-\s]?hand|single[-\s]?hand|alternat(?:e|ing)|unilateral|see[-\s]?saw)\b/gi;

const PARENS_PATTERN = /[()]/g;
const EXTRA_SPACE_PATTERN = /\s{2,}/g;

export function isUnilateralVariantName(name: string): boolean {
  return /\b(one[-\s]?arm|single[-\s]?arm|one[-\s]?hand|single[-\s]?hand|alternat(?:e|ing)|unilateral|see[-\s]?saw)\b/i.test(name);
}

export function canonicalizeExerciseName(name: string): string {
  return name
    .replace(PARENS_PATTERN, ' ')
    .replace(UNILATERAL_KEYWORD_PATTERN, ' ')
    .replace(EXTRA_SPACE_PATTERN, ' ')
    .trim();
}

export function getExerciseSearchCandidates(inputName: string): string[] {
  const normalized = inputName.trim();
  const canonical = canonicalizeExerciseName(normalized);
  const candidates = [canonical, normalized].filter(Boolean);
  return Array.from(new Set(candidates));
}

