'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useActiveWorkoutStore } from '@/stores/activeWorkoutStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { formatRelativeDate, toDisplayWeight, weightUnit } from '@/lib/utils/units';
import Button from '@/components/ui/Button';

interface ProgressSummary {
  totalWorkouts: number;
  weekWorkouts: number;
  weekVolume: number;
  currentStreak: number;
}

interface RecentWorkout {
  id: string;
  name: string | null;
  date: string;
  sets: { exercise_id: string; weight: number | null; reps: number | null }[];
}

export default function DashboardPage() {
  const router = useRouter();
  const supabase = createClient();
  const { isActive, workoutId, startWorkout } = useActiveWorkoutStore();
  const unitSystem = useSettingsStore((s) => s.unitSystem);
  const [summary, setSummary] = useState<ProgressSummary | null>(null);
  const [recentWorkouts, setRecentWorkouts] = useState<RecentWorkout[]>([]);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      const { data: summaryData } = await supabase.rpc('get_progress_summary', {
        user_uuid: user.id,
      });
      if (summaryData) setSummary(summaryData as ProgressSummary);

      const { data: workouts } = await supabase
        .from('workouts')
        .select('id, name, date, sets(exercise_id, weight, reps)')
        .order('date', { ascending: false })
        .limit(3);
      if (workouts) setRecentWorkouts(workouts as RecentWorkout[]);
    }
    load();
  }, []);

  function handleStartWorkout() {
    startWorkout();
    const state = useActiveWorkoutStore.getState();
    router.push(`/workout/${state.workoutId}`);
  }

  function handleResumeWorkout() {
    router.push(`/workout/${workoutId}`);
  }

  return (
    <div className="px-5 pt-8 pb-4">
      <p className="text-sm font-black text-text tracking-tight">rep</p>
      <h1 className="text-3xl font-bold mt-1 mb-8">Home</h1>

      {isActive ? (
        <Button variant="primary" fullWidth size="lg" onClick={handleResumeWorkout}>
          Resume Workout
        </Button>
      ) : (
        <Button variant="primary" fullWidth size="lg" onClick={handleStartWorkout}>
          Start Workout
        </Button>
      )}

      {summary && (
        <div className="flex items-baseline justify-between mt-8 py-4 border-y border-border">
          <div className="text-center flex-1">
            <p className="text-2xl font-bold">{summary.currentStreak}</p>
            <p className="text-xs text-text-muted mt-0.5">Day Streak</p>
          </div>
          <div className="text-center flex-1">
            <p className="text-2xl font-bold">{summary.weekWorkouts}</p>
            <p className="text-xs text-text-muted mt-0.5">This Week</p>
          </div>
          <div className="text-center flex-1">
            <p className="text-2xl font-bold">
              {toDisplayWeight(summary.weekVolume, unitSystem).toLocaleString()}
            </p>
            <p className="text-xs text-text-muted mt-0.5">{weightUnit(unitSystem)} Vol</p>
          </div>
        </div>
      )}

      <div className="mt-8">
        <h2 className="text-xs font-medium text-text-muted uppercase tracking-wider mb-4">Recent Workouts</h2>
        {recentWorkouts.length === 0 ? (
          <p className="text-text-muted text-sm">No workouts yet. Start your first one!</p>
        ) : (
          <div className="divide-y divide-border">
            {recentWorkouts.map((w) => {
              const exerciseIds = new Set(w.sets.map((s) => s.exercise_id));
              const totalVolume = w.sets.reduce(
                (sum, s) => sum + ((s.weight || 0) * (s.reps || 0)),
                0,
              );
              return (
                <div key={w.id} className="py-3.5 flex justify-between items-center">
                  <div>
                    <p className="font-medium text-sm">{w.name || 'Workout'}</p>
                    <p className="text-xs text-text-muted mt-0.5">{formatRelativeDate(w.date)}</p>
                  </div>
                  <div className="text-right text-xs text-text-muted">
                    <p>{exerciseIds.size} exercises</p>
                    <p>{toDisplayWeight(totalVolume, unitSystem).toLocaleString()} {weightUnit(unitSystem)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
