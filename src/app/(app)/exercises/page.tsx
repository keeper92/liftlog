'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useActiveWorkoutStore } from '@/stores/activeWorkoutStore';
import { MUSCLE_GROUPS } from '@/lib/constants';

interface Exercise {
  id: string;
  name: string;
  category: string;
  primary_muscles: string[];
  equipment: string | null;
}

// Display names for cardio exercises (cleaner than DB names)
const CARDIO_DISPLAY_NAMES: Record<string, string> = {
  'Jogging, Treadmill': 'Treadmill',
  'Bicycling, Stationary': 'Stationary Bike',
  'Rowing, Stationary': 'Rowing Machine',
};

export default function ExercisesPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-dvh text-text-muted">Loading...</div>}>
      <ExercisesContent />
    </Suspense>
  );
}

function ExercisesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isSelecting = searchParams.get('select') === 'true';
  const supabase = createClient();
  const addExercise = useActiveWorkoutStore((s) => s.addExercise);

  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [search, setSearch] = useState('');
  const [selectedMuscle, setSelectedMuscle] = useState<string | null>(null);
  const [showCardio, setShowCardio] = useState(false);
  const [showRecentlyUsed, setShowRecentlyUsed] = useState(false);
  const [recentlyUsedIds, setRecentlyUsedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch recently used exercise IDs on mount
  useEffect(() => {
    async function loadRecentlyUsed() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('sets')
        .select('exercise_id, timestamp, workouts!inner(user_id)')
        .eq('workouts.user_id', user.id)
        .order('timestamp', { ascending: false });

      if (data) {
        // Get unique exercise IDs in order of most recent use
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

  useEffect(() => {
    async function load() {
      setLoading(true);

      if (showRecentlyUsed && recentlyUsedIds.length > 0) {
        // Fetch exercises by recently used IDs
        let query = supabase
          .from('exercises')
          .select('id, name, category, primary_muscles, equipment')
          .in('id', recentlyUsedIds);

        if (search) {
          query = query.ilike('name', `%${search}%`);
        }

        const { data } = await query;
        if (data) {
          // Sort by recently used order
          const sorted = [...data].sort(
            (a, b) => recentlyUsedIds.indexOf(a.id) - recentlyUsedIds.indexOf(b.id)
          );
          setExercises(sorted);
        }
      } else {
        let query = supabase
          .from('exercises')
          .select('id, name, category, primary_muscles, equipment')
          .order('name')
          .limit(50);

        if (search) {
          query = query.ilike('name', `%${search}%`);
        }
        if (showCardio) {
          // Only show these 5 cardio exercises
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

  function handleSelectExercise(exercise: Exercise) {
    if (isSelecting) {
      addExercise({ id: exercise.id, name: exercise.name, category: exercise.category });
      router.back();
    }
  }

  return (
    <div className="flex flex-col min-h-dvh">
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-center gap-3 mb-4">
          {isSelecting && (
            <button onClick={() => router.back()} className="text-text-secondary min-h-[44px] flex items-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
          )}
          <h1 className="text-2xl font-bold">{isSelecting ? 'Add Exercise' : 'Exercises'}</h1>
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Search exercises..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-background border border-border rounded-xl pl-10 pr-4 py-3 min-h-[48px] text-sm focus:border-primary outline-none"
          />
        </div>

        {/* Muscle Filter */}
        <div className="flex overflow-x-auto gap-2 pb-2 -mx-4 px-4 scrollbar-hide">
          <button
            onClick={() => {
              setShowRecentlyUsed(true);
              setShowCardio(false);
              setSelectedMuscle(null);
            }}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              showRecentlyUsed ? 'bg-primary text-white' : 'bg-surface-light text-text-secondary'
            }`}
          >
            Recently Used
          </button>
          <button
            onClick={() => {
              setShowRecentlyUsed(false);
              setShowCardio(false);
              setSelectedMuscle(null);
            }}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              !showRecentlyUsed && !showCardio && !selectedMuscle ? 'bg-primary text-white' : 'bg-surface-light text-text-secondary'
            }`}
          >
            All
          </button>
          <button
            onClick={() => {
              setShowRecentlyUsed(false);
              setShowCardio(true);
              setSelectedMuscle(null);
            }}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              showCardio ? 'bg-primary text-white' : 'bg-surface-light text-text-secondary'
            }`}
          >
            Cardio
          </button>
          {MUSCLE_GROUPS.map((m) => (
            <button
              key={m}
              onClick={() => {
                setShowRecentlyUsed(false);
                setShowCardio(false);
                setSelectedMuscle(selectedMuscle === m ? null : m);
              }}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium capitalize transition-colors ${
                !showRecentlyUsed && !showCardio && selectedMuscle === m ? 'bg-primary text-white' : 'bg-surface-light text-text-secondary'
              }`}
            >
              {m.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* Exercise List */}
      <div className="flex-1 overflow-y-auto px-4 pb-20">
        {loading ? (
          <p className="text-text-muted text-sm text-center py-8">Loading...</p>
        ) : exercises.length === 0 ? (
          <p className="text-text-muted text-sm text-center py-8">No exercises found</p>
        ) : (
          <div className="space-y-1">
            {exercises.map((ex) => (
              <button
                key={ex.id}
                onClick={() => handleSelectExercise(ex)}
                className="w-full text-left px-3 py-3 rounded-xl hover:bg-surface-light transition-colors min-h-[44px]"
              >
                <p className="font-medium text-sm">{CARDIO_DISPLAY_NAMES[ex.name] || ex.name}</p>
                <div className="flex gap-2 mt-1">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-surface text-text-secondary capitalize">
                    {ex.category.replace('_', ' ')}
                  </span>
                  {ex.primary_muscles.slice(0, 2).map((m) => (
                    <span key={m} className="text-xs text-text-muted capitalize">
                      {m.replace('_', ' ')}
                    </span>
                  ))}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
