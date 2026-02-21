'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { ExerciseRow } from '@/lib/types/exercise';
import { canonicalizeExerciseName } from '@/lib/utils/exerciseNaming';

interface UseExerciseSearchReturn {
  exercises: ExerciseRow[];
  setExercises: React.Dispatch<React.SetStateAction<ExerciseRow[]>>;
  loading: boolean;
  search: string;
  setSearch: (v: string) => void;
  selectedMuscle: string | null;
  setSelectedMuscle: (v: string | null) => void;
  showCardio: boolean;
  setShowCardio: (v: boolean) => void;
  showRecentlyUsed: boolean;
  setShowRecentlyUsed: (v: boolean) => void;
  currentUserId: string | null;
}

export function useExerciseSearch(): UseExerciseSearchReturn {
  const supabase = useMemo(() => createClient(), []);

  const [exercises, setExercises] = useState<ExerciseRow[]>([]);
  const [search, setSearch] = useState('');
  const [selectedMuscle, setSelectedMuscle] = useState<string | null>(null);
  const [showCardio, setShowCardio] = useState(false);
  const [showRecentlyUsed, setShowRecentlyUsed] = useState(true);
  const [recentlyUsedIds, setRecentlyUsedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Fetch user ID and recently used exercise IDs on mount
  useEffect(() => {
    async function loadRecentlyUsed() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      setCurrentUserId(user.id);

      const { data } = await supabase
        .from('sets')
        .select('exercise_id, timestamp, workouts!inner(user_id)')
        .eq('workouts.user_id', user.id)
        .order('timestamp', { ascending: false });

      if (data) {
        const seen = new Set<string>();
        const recentIds: string[] = [];
        for (const row of data) {
          if (!seen.has(row.exercise_id)) {
            seen.add(row.exercise_id);
            recentIds.push(row.exercise_id);
          }
          if (recentIds.length >= 50) break;
        }
        setRecentlyUsedIds(recentIds);
      }
    }
    loadRecentlyUsed();
  }, [supabase]);

  // Fetch exercises based on current filters (debounced 300ms)
  useEffect(() => {
    async function load() {
      setLoading(true);

      if (showRecentlyUsed && recentlyUsedIds.length > 0) {
        const query = supabase
          .from('exercises')
          .select('id, name, category, primary_muscles, equipment, is_custom, user_id')
          .in('id', recentlyUsedIds);

        const { data } = await query;
        if (data) {
          if (search.trim()) {
            setExercises(rankExercisesBySearch(data, search, recentlyUsedIds));
          } else {
            const sorted = [...data].sort(
              (a, b) => recentlyUsedIds.indexOf(a.id) - recentlyUsedIds.indexOf(b.id)
            );
            setExercises(sorted);
          }
        }
      } else {
        let query = supabase
          .from('exercises')
          .select('id, name, category, primary_muscles, equipment, is_custom, user_id')
          .order('name')
          .limit(1000);
        if (showCardio) {
          query = query.in('name', [
            'Bicycling, Stationary',
            'Stairmaster',
            'Elliptical Trainer',
            'Rowing, Stationary',
            'Jogging, Treadmill',
          ]);
        } else if (selectedMuscle) {
          query = query.contains('primary_muscles', [selectedMuscle]);
        }

        const { data } = await query;
        if (data) {
          if (search.trim()) {
            setExercises(rankExercisesBySearch(data, search));
          } else {
            setExercises(data);
          }
        }
      }
      setLoading(false);
    }

    const debounce = setTimeout(load, 300);
    return () => clearTimeout(debounce);
  }, [search, selectedMuscle, showCardio, showRecentlyUsed, recentlyUsedIds, supabase]);

  return {
    exercises,
    setExercises,
    loading,
    search,
    setSearch,
    selectedMuscle,
    setSelectedMuscle,
    showCardio,
    setShowCardio,
    showRecentlyUsed,
    setShowRecentlyUsed,
    currentUserId,
  };
}

function normalizeForSearch(text: string): string {
  return canonicalizeExerciseName(text.toLowerCase())
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'for', 'from', 'in', 'of', 'on', 'the', 'to', 'with',
  'at', 'by', 'set', 'sets',
]);

const TOKEN_EXPANSIONS: Record<string, string[]> = {
  bicep: ['biceps'],
  biceps: ['bicep'],
  tricep: ['triceps'],
  triceps: ['tricep'],
  pec: ['pecs', 'chest'],
  pecs: ['pec', 'chest'],
  delt: ['delts', 'shoulders'],
  delts: ['delt', 'shoulders'],
  abs: ['ab', 'abdominals', 'core'],
  ab: ['abs', 'abdominals', 'core'],
  lat: ['lats'],
  lats: ['lat'],
  glute: ['glutes'],
  glutes: ['glute'],
  rdl: ['romanian', 'deadlift'],
  db: ['dumbbell'],
  bb: ['barbell'],
  chin: ['pullup', 'pull-up'],
  chinup: ['chin', 'pullup'],
  pullup: ['pull', 'up', 'chinup'],
  pulldown: ['pull', 'down'],
};

const EQUIPMENT_HINTS = ['machine', 'cable', 'dumbbell', 'barbell', 'smith', 'bodyweight', 'band'] as const;

const BODY_HINT_PATTERNS: Array<{ queryTerms: string[]; nameTerms: string[] }> = [
  { queryTerms: ['chest', 'pec', 'pecs'], nameTerms: ['chest', 'pec', 'bench', 'fly', 'crossover'] },
  { queryTerms: ['back', 'lat', 'lats'], nameTerms: ['back', 'lat', 'lats', 'row', 'pulldown', 'pullup', 'chinup'] },
  { queryTerms: ['shoulder', 'delt', 'delts'], nameTerms: ['shoulder', 'delt', 'delts', 'lateral', 'upright'] },
  { queryTerms: ['bicep', 'biceps'], nameTerms: ['bicep', 'biceps', 'curl'] },
  { queryTerms: ['tricep', 'triceps'], nameTerms: ['tricep', 'triceps', 'pressdown', 'pushdown'] },
  { queryTerms: ['hamstring', 'hamstrings'], nameTerms: ['hamstring', 'hamstrings', 'leg', 'curl', 'rdl'] },
  { queryTerms: ['glute', 'glutes'], nameTerms: ['glute', 'glutes', 'hip', 'thrust', 'bridge'] },
  { queryTerms: ['calf', 'calves'], nameTerms: ['calf', 'calves'] },
  { queryTerms: ['ab', 'abs', 'abdominals', 'core'], nameTerms: ['ab', 'abs', 'abdominals', 'core', 'crunch', 'sit', 'plank'] },
];

function maybeSingular(token: string): string {
  if (token.length <= 4) return token;
  if (token.endsWith('ies')) return `${token.slice(0, -3)}y`;
  if (token.endsWith('s') && !token.endsWith('ss')) return token.slice(0, -1);
  return token;
}

function tokenizeSearch(search: string): string[] {
  const baseTokens = normalizeForSearch(search)
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length > 0 && !STOP_WORDS.has(token));

  const tokenSet = new Set<string>();
  for (const rawToken of baseTokens) {
    tokenSet.add(rawToken);
    const singular = maybeSingular(rawToken);
    if (singular !== rawToken) tokenSet.add(singular);
    const expansions = TOKEN_EXPANSIONS[rawToken];
    if (expansions) {
      for (const expanded of expansions) {
        if (!STOP_WORDS.has(expanded)) tokenSet.add(expanded);
      }
    }
  }

  return Array.from(tokenSet);
}

function levenshteinDistance(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: b.length + 1 }, () => Array(a.length + 1).fill(0));
  for (let i = 0; i <= b.length; i += 1) dp[i][0] = i;
  for (let j = 0; j <= a.length; j += 1) dp[0][j] = j;

  for (let i = 1; i <= b.length; i += 1) {
    for (let j = 1; j <= a.length; j += 1) {
      dp[i][j] = b[i - 1] === a[j - 1]
        ? dp[i - 1][j - 1]
        : Math.min(dp[i - 1][j - 1], dp[i][j - 1], dp[i - 1][j]) + 1;
    }
  }
  return dp[b.length][a.length];
}

function scoreExerciseName(name: string, query: string, tokens: string[]): number {
  const normalizedName = normalizeForSearch(name);
  if (!normalizedName || tokens.length === 0) return 0;

  const words = normalizedName.split(' ').filter((word) => word && !STOP_WORDS.has(word));
  const queryWords = query.split(' ').filter(Boolean).filter((token) => !STOP_WORDS.has(token));
  let score = 0;
  if (normalizedName === query) score += 220;
  if (normalizedName.startsWith(query)) score += 140;
  if (normalizedName.includes(query)) score += 95;

  let matchedTokens = 0;
  for (const token of tokens) {
    if (words.includes(token)) {
      matchedTokens += 1;
      score += 34;
      continue;
    }
    if (words.some((word) => word.startsWith(token) || token.startsWith(word))) {
      matchedTokens += 1;
      score += 22;
      continue;
    }
    if (token.length >= 5 && words.some((word) => Math.abs(word.length - token.length) <= 1 && levenshteinDistance(word, token) <= 1)) {
      matchedTokens += 1;
      score += 16;
      continue;
    }
    if (token.length >= 5 && normalizedName.includes(token)) {
      matchedTokens += 1;
      score += 12;
    }
  }

  if (matchedTokens === 0) return 0;
  const minMatches = Math.min(
    queryWords.length,
    Math.max(1, Math.ceil(queryWords.length * 0.66)),
  );
  if (matchedTokens < minMatches) return 0;
  const queryEquipmentHint = EQUIPMENT_HINTS.find((hint) => queryWords.includes(hint));
  if (queryEquipmentHint) {
    if (words.includes(queryEquipmentHint)) {
      score += 36;
    } else {
      score -= 12;
    }
  }

  const bodyHint = BODY_HINT_PATTERNS.find((hint) =>
    hint.queryTerms.some((term) => queryWords.includes(term))
  );
  if (bodyHint) {
    const matchesBodyHint = bodyHint.nameTerms.some((term) => words.includes(term));
    score += matchesBodyHint ? 24 : -12;
  }

  if (matchedTokens === tokens.length) score += 80;
  score += Math.round((matchedTokens / tokens.length) * 40);

  return score;
}

function rankExercisesBySearch(
  exercises: ExerciseRow[],
  search: string,
  recentOrder?: string[],
): ExerciseRow[] {
  const query = normalizeForSearch(search);
  const tokens = tokenizeSearch(search);
  if (!query || tokens.length === 0) return exercises;

  const scored = exercises
    .map((exercise) => ({
      exercise,
      score: scoreExerciseName(exercise.name, query, tokens),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (recentOrder) {
        const ai = recentOrder.indexOf(a.exercise.id);
        const bi = recentOrder.indexOf(b.exercise.id);
        if (ai !== bi) return ai - bi;
      }
      return a.exercise.name.localeCompare(b.exercise.name);
    });

  return scored.map((entry) => entry.exercise);
}
