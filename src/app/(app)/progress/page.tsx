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
    maxWeight: Math.round(toDisplayWeight(p.best_weight, unitSystem)),
  }));

  return (
    <div className="pb-24">
      {/* Header */}
      <div className="bg-surface px-5 pt-4 pb-3 border-b border-border">
        <h1 className="text-xl font-bold">Progress</h1>
      </div>

      <div className="px-5 pt-4">
      {exercises.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-12 h-12 rounded-full bg-surface flex items-center justify-center mx-auto mb-3 card-shadow">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-text-muted">
              <line x1="18" y1="20" x2="18" y2="10" />
              <line x1="12" y1="20" x2="12" y2="4" />
              <line x1="6" y1="20" x2="6" y2="14" />
            </svg>
          </div>
          <p className="text-text-muted">No exercise data yet.</p>
          <p className="text-text-muted text-sm mt-1">Complete some workouts to see your progress!</p>
        </div>
      ) : (
        <>
          {/* Exercise Picker */}
          <div className="bg-surface rounded-2xl card-shadow mb-4">
            <select
              value={selectedExercise}
              onChange={(e) => setSelectedExercise(e.target.value)}
              className="w-full bg-transparent px-4 py-3.5 min-h-[48px] text-sm font-medium focus:outline-none appearance-none cursor-pointer"
            >
              {exercises.map((ex) => (
                <option key={ex.id} value={ex.id}>{ex.name}</option>
              ))}
            </select>
          </div>

          {/* Chart */}
          {chartData.length > 1 ? (
            <Card className="mb-4">
              <p className="text-sm font-semibold mb-3">Max Weight ({unit})</p>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={chartData}>
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#8E8E93' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#8E8E93' }} width={40} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#FFFFFF', border: 'none', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                    labelStyle={{ color: '#606065', fontSize: '12px' }}
                    itemStyle={{ color: '#FC4C02', fontSize: '14px', fontWeight: 600 }}
                  />
                  <Line type="monotone" dataKey="maxWeight" stroke="#FC4C02" strokeWidth={2.5} dot={{ fill: '#FC4C02', r: 4, strokeWidth: 0 }} activeDot={{ r: 6, fill: '#FC4C02' }} />
                </LineChart>
              </ResponsiveContainer>
            </Card>
          ) : chartData.length === 1 ? (
            <Card className="mb-4 text-center">
              <p className="text-sm text-text-muted">
                Max Weight: <span className="font-bold text-primary">{chartData[0].maxWeight} {unit}</span>
              </p>
              <p className="text-xs text-text-muted mt-1">Log more workouts to see a chart</p>
            </Card>
          ) : (
            <Card className="mb-4 text-center">
              <p className="text-sm text-text-muted">No data for this exercise yet</p>
            </Card>
          )}
        </>
      )}

      {/* Personal Records */}
      {records.length > 0 && (
        <div className="mt-6">
          <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">Personal Records</h2>
          <div className="space-y-3">
            {records.map((pr) => (
              <Card key={pr.exercise_id}>
                <p className="font-semibold text-sm mb-3">{pr.exercise_name}</p>
                <div className="grid grid-cols-3 gap-2">
                  <div className="text-center bg-surface-light rounded-xl py-2">
                    <p className="text-lg font-bold text-primary">
                      {toDisplayWeight(pr.max_weight, unitSystem)}
                    </p>
                    <p className="text-xs text-text-muted">Max {unit}</p>
                  </div>
                  <div className="text-center bg-surface-light rounded-xl py-2">
                    <p className="text-lg font-bold text-primary">{pr.max_reps}</p>
                    <p className="text-xs text-text-muted">Max Reps</p>
                  </div>
                  <div className="text-center bg-surface-light rounded-xl py-2">
                    <p className="text-lg font-bold text-primary">
                      {Math.round(toDisplayWeight(pr.estimated_1rm, unitSystem))}
                    </p>
                    <p className="text-xs text-text-muted">Est 1RM</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
