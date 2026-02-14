'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { ExerciseRow } from '@/lib/types/exercise';

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
  const supabase = createClient();

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
  }, []);

  // Fetch exercises based on current filters (debounced 300ms)
  useEffect(() => {
    async function load() {
      setLoading(true);

      if (showRecentlyUsed && recentlyUsedIds.length > 0) {
        let query = supabase
          .from('exercises')
          .select('id, name, category, primary_muscles, equipment, is_custom, user_id')
          .in('id', recentlyUsedIds);

        if (search) {
          query = query.ilike('name', `%${search}%`);
        }

        const { data } = await query;
        if (data) {
          const sorted = [...data].sort(
            (a, b) => recentlyUsedIds.indexOf(a.id) - recentlyUsedIds.indexOf(b.id)
          );
          setExercises(sorted);
        }
      } else {
        let query = supabase
          .from('exercises')
          .select('id, name, category, primary_muscles, equipment, is_custom, user_id')
          .order('name')
          .limit(50);

        if (search) {
          query = query.ilike('name', `%${search}%`);
        }
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
        if (data) setExercises(data);
      }
      setLoading(false);
    }

    const debounce = setTimeout(load, 300);
    return () => clearTimeout(debounce);
  }, [search, selectedMuscle, showCardio, showRecentlyUsed, recentlyUsedIds]);

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
