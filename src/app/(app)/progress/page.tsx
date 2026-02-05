'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useSettingsStore } from '@/stores/settingsStore';
import { toDisplayWeight, weightUnit } from '@/lib/utils/units';
import Card from '@/components/ui/Card';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

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

interface PersonalRecord {
  exercise_id: string;
  exercise_name: string;
  max_weight: number;
  max_reps: number;
  max_volume: number;
  estimated_1rm: number;
}

export default function ProgressPage() {
  const supabase = createClient();
  const unitSystem = useSettingsStore((s) => s.unitSystem);
  const [exercises, setExercises] = useState<ExerciseOption[]>([]);
  const [selectedExercise, setSelectedExercise] = useState<string>('');
  const [progressData, setProgressData] = useState<ProgressPoint[]>([]);
  const [records, setRecords] = useState<PersonalRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const unit = weightUnit(unitSystem);

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

      // Load personal records
      const { data: prData } = await supabase.rpc('get_personal_records', { user_uuid: user.id });
      if (prData) setRecords((prData as PersonalRecord[]).slice(0, 10));

      setLoading(false);
    }
    load();
  }, []);

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
  }, [selectedExercise]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-dvh text-text-muted">Loading...</div>
    );
  }

  const chartData = progressData.map((p) => ({
    date: new Date(p.workout_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    e1rm: Math.round(toDisplayWeight(p.estimated_1rm, unitSystem)),
  }));

  return (
    <div className="px-5 pt-8 pb-20">
      <p className="text-xs font-medium text-text-muted uppercase tracking-wider">LiftLog</p>
      <h1 className="text-3xl font-bold mt-1 mb-8">Progress</h1>

      {exercises.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-text-muted">No exercise data yet.</p>
          <p className="text-text-muted text-sm mt-1">Complete some workouts to see your progress!</p>
        </div>
      ) : (
        <>
          {/* Exercise Picker */}
          <select
            value={selectedExercise}
            onChange={(e) => setSelectedExercise(e.target.value)}
            className="w-full bg-background border border-border rounded-xl px-4 py-3 min-h-[48px] text-sm mb-6 focus:border-primary outline-none appearance-none"
          >
            {exercises.map((ex) => (
              <option key={ex.id} value={ex.id}>{ex.name}</option>
            ))}
          </select>

          {/* Chart */}
          {chartData.length > 1 ? (
            <Card className="mb-6">
              <p className="text-sm font-medium mb-3">Estimated 1RM ({unit})</p>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={chartData}>
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9B9B9B' }} />
                  <YAxis tick={{ fontSize: 10, fill: '#9B9B9B' }} width={40} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#FFFFFF', border: '1px solid #E8E8E6', borderRadius: '8px' }}
                    labelStyle={{ color: '#6B6B6B' }}
                    itemStyle={{ color: '#E8710A' }}
                  />
                  <Line type="monotone" dataKey="e1rm" stroke="#E8710A" strokeWidth={2} dot={{ fill: '#E8710A', r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </Card>
          ) : chartData.length === 1 ? (
            <Card className="mb-6 text-center">
              <p className="text-sm text-text-muted">
                Estimated 1RM: <span className="font-bold text-primary-light">{chartData[0].e1rm} {unit}</span>
              </p>
              <p className="text-xs text-text-muted mt-1">Log more workouts to see a chart</p>
            </Card>
          ) : (
            <Card className="mb-6 text-center">
              <p className="text-sm text-text-muted">No data for this exercise yet</p>
            </Card>
          )}
        </>
      )}

      {/* Personal Records */}
      {records.length > 0 && (
        <>
          <h2 className="text-xs font-medium text-text-muted uppercase tracking-wider mb-4">Personal Records</h2>
          <div className="divide-y divide-border">
            {records.map((pr) => (
              <div key={pr.exercise_id} className="py-3.5">
                <p className="font-medium text-sm">{pr.exercise_name}</p>
                <div className="grid grid-cols-3 gap-2 mt-2">
                  <div>
                    <p className="text-lg font-bold text-primary">
                      {toDisplayWeight(pr.max_weight, unitSystem)}
                    </p>
                    <p className="text-xs text-text-muted">Max {unit}</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-primary">{pr.max_reps}</p>
                    <p className="text-xs text-text-muted">Max Reps</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-primary">
                      {Math.round(toDisplayWeight(pr.estimated_1rm, unitSystem))}
                    </p>
                    <p className="text-xs text-text-muted">Est 1RM</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
