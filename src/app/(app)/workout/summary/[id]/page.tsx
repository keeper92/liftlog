'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useSettingsStore } from '@/stores/settingsStore';
import { formatDuration, toDisplayWeight, weightUnit } from '@/lib/utils/units';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';

interface WorkoutData {
  id: string;
  name: string | null;
  start_time: string;
  end_time: string | null;
  sets: {
    exercise_id: string;
    weight: number | null;
    reps: number | null;
    set_number: number;
    is_warmup: boolean;
    exercises: { name: string };
  }[];
}

export default function WorkoutSummaryPage() {
  const params = useParams();
  const router = useRouter();
  const supabase = createClient();
  const unitSystem = useSettingsStore((s) => s.unitSystem);
  const [workout, setWorkout] = useState<WorkoutData | null>(null);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('workouts')
        .select('id, name, start_time, end_time, sets(exercise_id, weight, reps, set_number, is_warmup, exercises(name))')
        .eq('id', params.id as string)
        .single();
      if (data) setWorkout(data as unknown as WorkoutData);
    }
    load();
  }, [params.id]);

  if (!workout) {
    return <div className="flex items-center justify-center min-h-dvh text-text-muted">Loading...</div>;
  }

  const duration = workout.end_time
    ? Math.floor((new Date(workout.end_time).getTime() - new Date(workout.start_time).getTime()) / 1000)
    : 0;
  const exerciseMap = new Map<string, { name: string; sets: typeof workout.sets }>();
  for (const s of workout.sets) {
    const existing = exerciseMap.get(s.exercise_id) || { name: s.exercises.name, sets: [] };
    existing.sets.push(s);
    exerciseMap.set(s.exercise_id, existing);
  }
  const totalVolume = workout.sets.reduce((sum, s) => sum + ((s.weight || 0) * (s.reps || 0)), 0);
  const unit = weightUnit(unitSystem);

  return (
    <div className="px-4 pt-8 pb-20">
      <div className="text-center mb-8">
        <div className="w-16 h-16 rounded-full bg-success/20 flex items-center justify-center mx-auto mb-4">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#2DA44E" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold">Workout Complete!</h1>
        <p className="text-text-secondary mt-1">{workout.name || 'Workout'}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-8">
        <Card className="text-center">
          <p className="text-xl font-bold">{formatDuration(duration)}</p>
          <p className="text-xs text-text-secondary mt-1">Duration</p>
        </Card>
        <Card className="text-center">
          <p className="text-xl font-bold">{exerciseMap.size}</p>
          <p className="text-xs text-text-secondary mt-1">Exercises</p>
        </Card>
        <Card className="text-center">
          <p className="text-xl font-bold">{workout.sets.length}</p>
          <p className="text-xs text-text-secondary mt-1">Sets</p>
        </Card>
        <Card className="text-center">
          <p className="text-xl font-bold">{toDisplayWeight(totalVolume, unitSystem).toLocaleString()}</p>
          <p className="text-xs text-text-secondary mt-1">{unit} Volume</p>
        </Card>
      </div>

      <h2 className="text-xs font-medium text-text-muted uppercase tracking-wider mb-4">Exercises</h2>
      <div className="space-y-3 mb-8">
        {Array.from(exerciseMap.entries()).map(([exId, { name, sets }]) => (
          <Card key={exId}>
            <p className="font-medium mb-2">{name}</p>
            <div className="space-y-1">
              {sets
                .sort((a, b) => a.set_number - b.set_number)
                .map((s, i) => (
                  <p key={i} className="text-sm text-text-secondary">
                    {s.is_warmup ? 'Warmup' : `Set ${s.set_number}`}:{' '}
                    {s.weight ? `${toDisplayWeight(s.weight, unitSystem)} ${unit}` : '-'} × {s.reps || '-'} reps
                  </p>
                ))}
            </div>
          </Card>
        ))}
      </div>

      <Button variant="primary" fullWidth onClick={() => router.push('/dashboard')}>
        Done
      </Button>
    </div>
  );
}
