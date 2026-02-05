'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useSettingsStore } from '@/stores/settingsStore';
import { formatRelativeDate, formatDuration, toDisplayWeight, weightUnit } from '@/lib/utils/units';
import Card from '@/components/ui/Card';

interface HistoryWorkout {
  id: string;
  name: string | null;
  date: string;
  start_time: string;
  end_time: string | null;
  sets: {
    exercise_id: string;
    weight: number | null;
    reps: number | null;
  }[];
}

export default function HistoryPage() {
  const supabase = createClient();
  const unitSystem = useSettingsStore((s) => s.unitSystem);
  const [workouts, setWorkouts] = useState<HistoryWorkout[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('workouts')
        .select('id, name, date, start_time, end_time, sets(exercise_id, weight, reps)')
        .order('date', { ascending: false })
        .limit(50);
      if (data) setWorkouts(data as HistoryWorkout[]);
      setLoading(false);
    }
    load();
  }, []);

  const unit = weightUnit(unitSystem);

  // Group by month
  const grouped = new Map<string, HistoryWorkout[]>();
  for (const w of workouts) {
    const key = new Date(w.date).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    const list = grouped.get(key) || [];
    list.push(w);
    grouped.set(key, list);
  }

  return (
    <div className="px-4 pt-6 pb-20">
      <h1 className="text-2xl font-bold mb-6">History</h1>

      {loading ? (
        <p className="text-text-muted text-sm text-center py-8">Loading...</p>
      ) : workouts.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-text-muted">No workouts yet.</p>
          <p className="text-text-muted text-sm mt-1">Start your first workout!</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Array.from(grouped.entries()).map(([month, monthWorkouts]) => (
            <div key={month}>
              <h2 className="text-sm font-semibold text-text-secondary mb-3">{month}</h2>
              <div className="space-y-3">
                {monthWorkouts.map((w) => {
                  const exerciseIds = new Set(w.sets.map((s) => s.exercise_id));
                  const totalVolume = w.sets.reduce(
                    (sum, s) => sum + ((s.weight || 0) * (s.reps || 0)),
                    0,
                  );
                  const duration = w.end_time
                    ? Math.floor((new Date(w.end_time).getTime() - new Date(w.start_time).getTime()) / 1000)
                    : 0;

                  return (
                    <Card key={w.id}>
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-medium">{w.name || 'Workout'}</p>
                          <p className="text-sm text-text-secondary mt-0.5">{formatRelativeDate(w.date)}</p>
                        </div>
                        {duration > 0 && (
                          <span className="text-sm text-text-muted">{formatDuration(duration)}</span>
                        )}
                      </div>
                      <div className="flex gap-4 mt-2 text-xs text-text-muted">
                        <span>{exerciseIds.size} exercises</span>
                        <span>{w.sets.length} sets</span>
                        <span>{toDisplayWeight(totalVolume, unitSystem).toLocaleString()} {unit}</span>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
