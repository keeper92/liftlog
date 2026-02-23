'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useSettingsStore } from '@/stores/settingsStore';
import { useActiveWorkoutStore } from '@/stores/activeWorkoutStore';
import { toDisplayWeight, weightUnit } from '@/lib/utils/units';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
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
      <div className="px-5 pt-4">
      <div className="mb-5">
        <p className="ui-kicker">Progress</p>
      </div>
      {exercises.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-12 h-12 rounded-full border border-border/80 bg-card flex items-center justify-center mx-auto mb-3 card-shadow">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted-foreground">
              <line x1="18" y1="20" x2="18" y2="10" />
              <line x1="12" y1="20" x2="12" y2="4" />
              <line x1="6" y1="20" x2="6" y2="14" />
            </svg>
          </div>
          <p className="text-muted-foreground">No exercise data yet.</p>
          <p className="text-muted-foreground text-sm mt-1">Complete some workouts to see your progress!</p>
          <Button onClick={handleStartWorkout} size="sm" className="mt-4">
            Start Workout
          </Button>
        </div>
      ) : (
        <>
          {/* Exercise Picker */}
          <div className="relative bg-card rounded-2xl border border-border/70 card-shadow mb-4">
            <Select
              value={selectedExercise}
              onChange={(e) => setSelectedExercise(e.target.value)}
              className="w-full bg-transparent px-4 py-3.5 pr-10 min-h-[48px] text-sm font-medium focus:outline-none appearance-none cursor-pointer"
            >
              {exercises.map((ex) => (
                <option key={ex.id} value={ex.id}>{ex.name}</option>
              ))}
            </Select>
            <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted-foreground">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
          </div>

          {/* Chart */}
          {chartData.length >= chartUnlockThreshold ? (
            <Card className="mb-4">
              <p className="ui-kicker mb-2">Lift Trend</p>
              <p className="text-sm font-semibold mb-3">Max Weight ({unit})</p>
              <ChartContainer config={chartConfig} className="h-[200px]">
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
            </Card>
          ) : chartData.length > 0 ? (
            <Card className="mb-4 text-center">
              <p className="text-sm text-muted-foreground">
                Max Weight: <span className="font-bold text-primary">{chartData[chartData.length - 1].maxWeight} {unit}</span>
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                Log {sessionsNeeded} more {selectedExerciseName.toLowerCase()} session{sessionsNeeded === 1 ? '' : 's'} to unlock trend chart.
              </p>
              <Button onClick={handleStartWorkout} size="sm" className="mt-4">
                Log Session
              </Button>
            </Card>
          ) : (
            <Card className="mb-4 text-center">
              <p className="text-sm text-muted-foreground">No logged sessions for this exercise yet.</p>
              <p className="text-xs text-muted-foreground mt-2">
                Log {chartUnlockThreshold} {selectedExerciseName.toLowerCase()} session{chartUnlockThreshold === 1 ? '' : 's'} to unlock trend chart.
              </p>
              <Button onClick={handleStartWorkout} size="sm" className="mt-4">
                Start Workout
              </Button>
            </Card>
          )}

          {progressData.length > 0 && (
            <div className="mt-6">
              <h2 className="ui-kicker mb-3">Exercise Stats</h2>
              <Card>
                <p className="font-semibold text-sm mb-3">{selectedExerciseName}</p>
                <div className="grid grid-cols-3 gap-2">
                  <div className="text-center bg-background rounded-xl py-2">
                    <p className="text-lg font-bold text-primary">
                      {toDisplayWeight(selectedExerciseStats.maxWeight, unitSystem)}
                    </p>
                    <p className="text-xs text-muted-foreground">Max {unit}</p>
                  </div>
                  <div className="text-center bg-background rounded-xl py-2">
                    <p className="text-lg font-bold text-primary">{selectedExerciseStats.maxReps}</p>
                    <p className="text-xs text-muted-foreground">Max Reps</p>
                  </div>
                  <div className="text-center bg-background rounded-xl py-2">
                    <p className="text-lg font-bold text-primary">
                      {Math.round(toDisplayWeight(selectedExerciseStats.estimated1RM, unitSystem))}
                    </p>
                    <p className="text-xs text-muted-foreground">Est 1RM</p>
                  </div>
                </div>
              </Card>
            </div>
          )}
        </>
      )}
      </div>
    </div>
  );
}
