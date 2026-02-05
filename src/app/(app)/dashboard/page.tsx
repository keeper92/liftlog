'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useActiveWorkoutStore } from '@/stores/activeWorkoutStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { formatRelativeDate, toDisplayWeight, weightUnit } from '@/lib/utils/units';
import Card from '@/components/ui/Card';
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
    <div className="px-4 pt-6 pb-4">
      <h1 className="text-2xl font-bold mb-6">LiftLog</h1>

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
        <div className="grid grid-cols-3 gap-3 mt-6">
          <Card className="text-center">
            <p className="text-2xl font-bold text-primary">{summary.currentStreak}</p>
            <p className="text-xs text-text-secondary mt-1">Day Streak</p>
          </Card>
          <Card className="text-center">
            <p className="text-2xl font-bold text-primary">{summary.weekWorkouts}</p>
            <p className="text-xs text-text-secondary mt-1">This Week</p>
          </Card>
          <Card className="text-center">
            <p className="text-2xl font-bold text-primary">
              {toDisplayWeight(summary.weekVolume, unitSystem).toLocaleString()}
            </p>
            <p className="text-xs text-text-secondary mt-1">{weightUnit(unitSystem)} Volume</p>
          </Card>
        </div>
      )}

      <div className="mt-8">
        <h2 className="text-lg font-semibold mb-3">Recent Workouts</h2>
        {recentWorkouts.length === 0 ? (
          <p className="text-text-muted text-sm">No workouts yet. Start your first one!</p>
        ) : (
          <div className="space-y-3">
            {recentWorkouts.map((w) => {
              const exerciseIds = new Set(w.sets.map((s) => s.exercise_id));
              const totalVolume = w.sets.reduce(
                (sum, s) => sum + ((s.weight || 0) * (s.reps || 0)),
                0,
              );
              return (
                <Card key={w.id}>
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium">{w.name || 'Workout'}</p>
                      <p className="text-sm text-text-secondary">{formatRelativeDate(w.date)}</p>
                    </div>
                    <div className="text-right text-sm text-text-secondary">
                      <p>{exerciseIds.size} exercises</p>
                      <p>{toDisplayWeight(totalVolume, unitSystem).toLocaleString()} {weightUnit(unitSystem)}</p>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
