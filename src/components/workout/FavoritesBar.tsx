'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button-shadcn';
import type { ExerciseRow } from '@/lib/types/exercise';

interface FavoritesBarProps {
  onSelect: (exercise: { id: string; name: string; category: string }) => void;
  /** Exercise IDs already in the workout (shown as dimmed) */
  activeExerciseIds?: string[];
}

export default function FavoritesBar({ onSelect, activeExerciseIds = [] }: FavoritesBarProps) {
  const supabase = useMemo(() => createClient(), []);
  const [favorites, setFavorites] = useState<ExerciseRow[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);

  const activeSet = useMemo(() => new Set(activeExerciseIds), [activeExerciseIds]);

  // Load favorite IDs from user profile
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('preferences')
        .eq('id', user.id)
        .single();

      if (cancelled) return;

      const prefs = (profile?.preferences as Record<string, unknown>) || {};
      const ids = Array.isArray(prefs.favoriteExerciseIds)
        ? (prefs.favoriteExerciseIds as unknown[]).filter((id): id is string => typeof id === 'string')
        : [];
      setFavoriteIds(ids);
    }
    load();
    return () => { cancelled = true; };
  }, [supabase]);

  // Fetch exercise data for favorites
  useEffect(() => {
    if (favoriteIds.length === 0) {
      setFavorites([]);
      return;
    }
    let cancelled = false;
    async function loadExercises() {
      const { data } = await supabase
        .from('exercises')
        .select('id, name, category, primary_muscles, equipment')
        .in('id', favoriteIds);

      if (!cancelled && data) {
        // Sort by the order in favoriteIds
        const idOrder = new Map(favoriteIds.map((id, i) => [id, i]));
        const sorted = (data as ExerciseRow[]).sort(
          (a, b) => (idOrder.get(a.id) ?? 999) - (idOrder.get(b.id) ?? 999)
        );
        setFavorites(sorted);
      }
    }
    loadExercises();
    return () => { cancelled = true; };
  }, [favoriteIds, supabase]);

  if (favorites.length === 0) return null;

  return (
    <div className="flex gap-2 overflow-x-auto px-4 py-2 scrollbar-hide">
      {favorites.map((exercise) => {
        const isActive = activeSet.has(exercise.id);
        return (
          <Button
            key={exercise.id}
            variant="outline"
            size="sm"
            disabled={isActive}
            onClick={() => {
              if (!isActive) {
                onSelect({ id: exercise.id, name: exercise.name, category: exercise.category });
              }
            }}
            className={`flex-shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ${
              isActive
                ? 'border-primary/30 bg-primary/10 text-primary/60'
                : 'border-border/60 bg-card'
            }`}
          >
            {exercise.name}
          </Button>
        );
      })}
    </div>
  );
}
