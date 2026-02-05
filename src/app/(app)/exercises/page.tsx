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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      let query = supabase
        .from('exercises')
        .select('id, name, category, primary_muscles, equipment')
        .order('name')
        .limit(50);

      if (search) {
        query = query.ilike('name', `%${search}%`);
      }
      if (selectedMuscle) {
        query = query.contains('primary_muscles', [selectedMuscle]);
      }

      const { data } = await query;
      if (data) setExercises(data);
      setLoading(false);
    }

    const debounce = setTimeout(load, 300);
    return () => clearTimeout(debounce);
  }, [search, selectedMuscle]);

  function handleSelectExercise(exercise: Exercise) {
    if (isSelecting) {
      addExercise({ id: exercise.id, name: exercise.name });
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
            onClick={() => setSelectedMuscle(null)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              !selectedMuscle ? 'bg-primary text-white' : 'bg-surface-light text-text-secondary'
            }`}
          >
            All
          </button>
          {MUSCLE_GROUPS.map((m) => (
            <button
              key={m}
              onClick={() => setSelectedMuscle(selectedMuscle === m ? null : m)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium capitalize transition-colors ${
                selectedMuscle === m ? 'bg-primary text-white' : 'bg-surface-light text-text-secondary'
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
                <p className="font-medium text-sm">{ex.name}</p>
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
