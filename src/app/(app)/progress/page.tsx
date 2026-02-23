'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useSettingsStore } from '@/stores/settingsStore';
import { useActiveWorkoutStore } from '@/stores/activeWorkoutStore';
import { toDisplayWeight, weightUnit } from '@/lib/utils/units';
import { Button } from '@/components/ui/button-shadcn';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card-shadcn';
import { Select } from '@/components/ui/select-shadcn';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';

interface ExerciseOption {
  id: string;
  name: string;
}

interface ProgressPoint {
  workout_date: string;
  estimated_1rm: number;
  total_volume: number;
  best_weight: number;
  best_reps: number;
}

export default function ProgressPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const unitSystem = useSettingsStore((s) => s.unitSystem);
  const startWorkout = useActiveWorkoutStore((s) => s.startWorkout);
  const [exercises, setExercises] = useState<ExerciseOption[]>([]);
  const [selectedExercise, setSelectedExercise] = useState<string>('');
  const [progressData, setProgressData] = useState<ProgressPoint[]>([]);
  const [loading, setLoading] = useState(true);

  const unit = weightUnit(unitSystem);
  const selectedExerciseName = exercises.find((ex) => ex.id === selectedExercise)?.name ?? 'this exercise';
  const chartUnlockThreshold: number = 3;
  const chartConfig: ChartConfig = {
    maxWeight: {
      label: `Max Weight (${unit})`,
      color: 'var(--primary)',
    },
  };

  // Load exercises the user has done
  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get exercises the user has logged sets for
      const { data: setData } = await supabase
        .from('sets')
        .select('exercise_id, exercises(id, name), workouts!inner(user_id)')
        .eq('workouts.user_id', user.id);

      if (setData) {
        const exerciseMap = new Map<string, string>();
        for (const s of setData) {
          const ex = s.exercises as unknown as { id: string; name: string };
          if (ex) exerciseMap.set(ex.id, ex.name);
        }
        const opts = Array.from(exerciseMap.entries()).map(([id, name]) => ({ id, name }));
        opts.sort((a, b) => a.name.localeCompare(b.name));
        setExercises(opts);
        if (opts.length > 0) setSelectedExercise(opts[0].id);
      }

      setLoading(false);
    }
    load();
  }, [supabase]);

  // Load progress when exercise changes
  useEffect(() => {
    if (!selectedExercise) return;
    async function loadProgress() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase.rpc('get_exercise_progress', {
        user_uuid: user.id,
        exercise_uuid: selectedExercise,
      });
      if (data) setProgressData(data as ProgressPoint[]);
      else setProgressData([]);
    }
    loadProgress();
  }, [selectedExercise, supabase]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-dvh text-muted-foreground">Loading progress...</div>
    );
  }

  const chartData = progressData.map((p) => ({
    date: new Date(p.workout_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    maxWeight: Math.round(toDisplayWeight(p.best_weight, unitSystem)),
  }));
  const selectedExerciseStats = progressData.reduce(
    (stats, point) => ({
      maxWeight: Math.max(stats.maxWeight, point.best_weight),
      maxReps: Math.max(stats.maxReps, point.best_reps),
      estimated1RM: Math.max(stats.estimated1RM, point.estimated_1rm),
    }),
    { maxWeight: 0, maxReps: 0, estimated1RM: 0 },
  );
  const sessionsNeeded = Math.max(chartUnlockThreshold - chartData.length, 0);

  function handleStartWorkout() {
    startWorkout();
    const state = useActiveWorkoutStore.getState();
    if (state.workoutId) {
      router.push(`/workout/${state.workoutId}`);
    }
  }

  return (
    <div className="pb-24">
      <div className="mx-auto w-full max-w-3xl space-y-4 px-4 pt-4 sm:px-6">
        <header className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">Progress</h1>
          <p className="text-sm text-muted-foreground">Track trend lines and performance highs for each exercise.</p>
        </header>

        {exercises.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center py-10 text-center">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-full border bg-muted">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted-foreground">
                  <line x1="18" y1="20" x2="18" y2="10" />
                  <line x1="12" y1="20" x2="12" y2="4" />
                  <line x1="6" y1="20" x2="6" y2="14" />
                </svg>
              </span>
              <p className="mt-3 text-sm text-muted-foreground">No exercise data yet.</p>
              <p className="text-sm text-muted-foreground">Complete some workouts to see your progress.</p>
              <Button onClick={handleStartWorkout} size="sm" className="mt-4">
                Start Workout
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Exercise</CardTitle>
                <CardDescription>Choose an exercise to view trends and records.</CardDescription>
              </CardHeader>
              <CardContent>
                <Select
                  value={selectedExercise}
                  onChange={(e) => setSelectedExercise(e.target.value)}
                  className="h-10"
                >
                  {exercises.map((ex) => (
                    <option key={ex.id} value={ex.id}>{ex.name}</option>
                  ))}
                </Select>
              </CardContent>
            </Card>

            {chartData.length >= chartUnlockThreshold ? (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Lift Trend</CardTitle>
                  <CardDescription>Max Weight ({unit}) over time</CardDescription>
                </CardHeader>
                <CardContent>
                  <ChartContainer config={chartConfig} className="h-[220px]">
                    <LineChart data={chartData}>
                      <CartesianGrid vertical={false} />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                        tickMargin={8}
                      />
                      <YAxis
                        tick={{ fontSize: 10 }}
                        width={40}
                        axisLine={false}
                        tickLine={false}
                        tickMargin={8}
                      />
                      <ChartTooltip
                        cursor={{ stroke: 'var(--border)', strokeDasharray: '4 4' }}
                        content={<ChartTooltipContent indicator="line" />}
                      />
                      <Line
                        type="monotone"
                        dataKey="maxWeight"
                        stroke="var(--color-maxWeight)"
                        strokeWidth={2.5}
                        dot={{ fill: 'var(--color-maxWeight)', r: 4, strokeWidth: 0 }}
                        activeDot={{ r: 6, fill: 'var(--color-maxWeight)' }}
                      />
                    </LineChart>
                  </ChartContainer>
                </CardContent>
              </Card>
            ) : chartData.length > 0 ? (
              <Card>
                <CardContent className="py-8 text-center">
                  <p className="text-sm text-muted-foreground">
                    Max Weight: <span className="font-semibold text-foreground">{chartData[chartData.length - 1].maxWeight} {unit}</span>
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Log {sessionsNeeded} more {selectedExerciseName.toLowerCase()} session{sessionsNeeded === 1 ? '' : 's'} to unlock the trend chart.
                  </p>
                  <Button onClick={handleStartWorkout} size="sm" className="mt-4">
                    Log Session
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="py-8 text-center">
                  <p className="text-sm text-muted-foreground">No logged sessions for this exercise yet.</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Log {chartUnlockThreshold} {selectedExerciseName.toLowerCase()} session{chartUnlockThreshold === 1 ? '' : 's'} to unlock the trend chart.
                  </p>
                  <Button onClick={handleStartWorkout} size="sm" className="mt-4">
                    Start Workout
                  </Button>
                </CardContent>
              </Card>
            )}

            {progressData.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Exercise Stats</CardTitle>
                  <CardDescription>{selectedExerciseName}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-md border bg-muted/40 p-3 text-center">
                      <p className="text-xl font-semibold text-foreground tabular-nums">
                        {toDisplayWeight(selectedExerciseStats.maxWeight, unitSystem)}
                      </p>
                      <p className="text-xs text-muted-foreground">Max {unit}</p>
                    </div>
                    <div className="rounded-md border bg-muted/40 p-3 text-center">
                      <p className="text-xl font-semibold text-foreground tabular-nums">{selectedExerciseStats.maxReps}</p>
                      <p className="text-xs text-muted-foreground">Max Reps</p>
                    </div>
                    <div className="rounded-md border bg-muted/40 p-3 text-center">
                      <p className="text-xl font-semibold text-foreground tabular-nums">
                        {Math.round(toDisplayWeight(selectedExerciseStats.estimated1RM, unitSystem))}
                      </p>
                      <p className="text-xs text-muted-foreground">Est 1RM</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}
