import type { SupabaseClient } from '@supabase/supabase-js';

export interface ExerciseMatch {
  inputName: string;
  matchedExercise: {
    id: string;
    name: string;
    category: string;
  } | null;
  confidence: number;
  alternatives: { id: string; name: string; score: number }[];
}

/**
 * Fuzzy match exercise names against the database using PostgreSQL trigram similarity.
 * Returns matches with confidence scores and alternatives for low-confidence matches.
 */
export async function matchExercises(
  supabase: SupabaseClient,
  exerciseNames: string[]
): Promise<ExerciseMatch[]> {
  const results: ExerciseMatch[] = [];

  for (const inputName of exerciseNames) {
    const normalizedInput = inputName.toLowerCase().trim();

    // Query using trigram similarity
    const { data: matches, error } = await supabase
      .rpc('match_exercise_name', { search_name: normalizedInput })
      .limit(5);

    if (error || !matches || matches.length === 0) {
      // Fallback to ILIKE search if trigram fails
      const { data: fallbackMatches } = await supabase
        .from('exercises')
        .select('id, name, category')
        .ilike('name', `%${normalizedInput}%`)
        .limit(5);

      if (fallbackMatches && fallbackMatches.length > 0) {
        const best = fallbackMatches[0];
        results.push({
          inputName,
          matchedExercise: {
            id: best.id,
            name: best.name,
            category: best.category,
          },
          confidence: 0.6, // Medium confidence for ILIKE matches
          alternatives: fallbackMatches.slice(1).map((m) => ({
            id: m.id,
            name: m.name,
            score: 0.5,
          })),
        });
      } else {
        results.push({
          inputName,
          matchedExercise: null,
          confidence: 0,
          alternatives: [],
        });
      }
      continue;
    }

    const best = matches[0] as { id: string; name: string; category: string; similarity: number };
    const alternatives = (matches as { id: string; name: string; category: string; similarity: number }[])
      .slice(1)
      .map((m) => ({
        id: m.id,
        name: m.name,
        score: m.similarity,
      }));

    results.push({
      inputName,
      matchedExercise: {
        id: best.id,
        name: best.name,
        category: best.category,
      },
      confidence: best.similarity,
      alternatives,
    });
  }

  return results;
}

/**
 * Simple similarity check without database (for client-side preview)
 */
export function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  const aLower = a.toLowerCase();
  const bLower = b.toLowerCase();

  for (let i = 0; i <= bLower.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= aLower.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= bLower.length; i++) {
    for (let j = 1; j <= aLower.length; j++) {
      if (bLower.charAt(i - 1) === aLower.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[bLower.length][aLower.length];
}

export function calculateSimilarity(a: string, b: string): number {
  const distance = levenshteinDistance(a, b);
  const maxLength = Math.max(a.length, b.length);
  return maxLength === 0 ? 1 : 1 - distance / maxLength;
}
