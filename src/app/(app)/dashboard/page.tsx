'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useActiveWorkoutStore } from '@/stores/activeWorkoutStore';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import WorkoutBuilder from './_components/WorkoutBuilder';
import HistoryOverlay from '@/components/history/HistoryOverlay';

interface TemplateSummary {
  id: string;
  name: string;
  template_exercises: {
    exercise_id: string;
    order_index: number;
    default_sets: number;
    exercises: { name: string; category: string };
  }[];
}

interface ProgressSummary {
  currentStreak: number;
  longestStreak: number;
  totalWorkouts: number;
  weekWorkouts: number;
}

// Get the dates for the current week (Sun–Sat)
function getCurrentWeekDates(): { date: Date; key: string }[] {
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0 = Sunday
  const sunday = new Date(today);
  sunday.setDate(today.getDate() - dayOfWeek);

  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return { date: d, key };
  });
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function DashboardPage() {
  const router = useRouter();
  const supabase = createClient();
  const { isActive, workoutId, startWorkout, addExerciseWithSets } = useActiveWorkoutStore();
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [stats, setStats] = useState<ProgressSummary | null>(null);
  const [weekWorkoutDates, setWeekWorkoutDates] = useState<Set<string>>(new Set());
  const [showHistory, setShowHistory] = useState(false);

  const weekDates = getCurrentWeekDates();
  const todayKey = weekDates.find((d) => {
    const now = new Date();
    return d.date.getDate() === now.getDate() && d.date.getMonth() === now.getMonth() && d.date.getFullYear() === now.getFullYear();
  })?.key;

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: templatesData } = await supabase
        .from('workout_templates')
        .select('id, name, template_exercises(exercise_id, order_index, default_sets, exercises(name, category))')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(10);
      if (templatesData) setTemplates(templatesData as unknown as TemplateSummary[]);

      // Get progress summary (streak + totals)
      const { data: summary } = await supabase.rpc('get_progress_summary', {
        user_uuid: user.id,
      });
      if (summary) {
        const s = summary as { weekWorkouts: number; currentStreak: number; longestStreak?: number; totalWorkouts: number };
        setStats({
          currentStreak: s.currentStreak,
          longestStreak: s.longestStreak ?? s.currentStreak,
          totalWorkouts: s.totalWorkouts,
          weekWorkouts: s.weekWorkouts,
        });
      }

      // Get this week's workout dates for the week row dots
      const weekStart = weekDates[0].key;
      const weekEnd = weekDates[6].key;
      const { data: weekWorkouts } = await supabase
        .from('workouts')
        .select('date')
        .eq('user_id', user.id)
        .gte('date', weekStart)
        .lte('date', weekEnd + 'T23:59:59');
      if (weekWorkouts) {
        const dates = new Set(weekWorkouts.map((w) => (w.date as string).split('T')[0]));
        setWeekWorkoutDates(dates);
      }
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

  function handleStartFromTemplate(template: TemplateSummary) {
    const sortedExercises = [...template.template_exercises].sort(
      (a, b) => a.order_index - b.order_index
    );
    startWorkout(template.name, template.id);
    for (const ex of sortedExercises) {
      addExerciseWithSets(
        { id: ex.exercise_id, name: ex.exercises.name, category: ex.exercises.category },
        ex.default_sets || 3
      );
    }
    const state = useActiveWorkoutStore.getState();
    router.push(`/workout/${state.workoutId}`);
  }

  return (
    <>
      {/* History Overlay */}
      {showHistory && stats && (
        <HistoryOverlay
          onClose={() => setShowHistory(false)}
          longestStreak={stats.longestStreak}
          currentStreak={stats.currentStreak}
          totalWorkouts={stats.totalWorkouts}
        />
      )}

      <div className="pb-24">
        {/* Header */}
        <div className="bg-surface px-5 pt-8 pb-4 border-b border-border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-black text-primary tracking-tight">reps</p>
              <h1 className="text-2xl font-bold mt-1">Home</h1>
            </div>
            <div className="flex items-center gap-2">
              {/* Streak badge */}
              <button
                onClick={() => setShowHistory(true)}
                className="flex items-center gap-1 bg-surface-light rounded-full pl-2 pr-2.5 py-1.5 hover:bg-border/50 transition-colors"
              >
                <span className="text-sm font-bold text-text">{stats?.currentStreak ?? 0}</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-warning">
                  <path d="M13 2L3 14h9l-1 10 10-12h-9l1-10z" />
                </svg>
              </button>
              {/* Calendar icon */}
              <button
                onClick={() => setShowHistory(true)}
                className="w-9 h-9 flex items-center justify-center rounded-full bg-surface-light hover:bg-border/50 transition-colors"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-text">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Week Row */}
        <button
          onClick={() => setShowHistory(true)}
          className="w-full px-5 py-3 bg-surface border-b border-border hover:bg-surface-light/50 transition-colors"
        >
          <div className="flex items-center justify-around">
            {weekDates.map((wd, i) => {
              const isToday = wd.key === todayKey;
              const hasWorkout = weekWorkoutDates.has(wd.key);

              return (
                <div key={wd.key} className="flex flex-col items-center gap-1">
                  <span className={`text-[10px] font-medium ${isToday ? 'text-text' : 'text-text-muted'}`}>
                    {DAY_LABELS[i]}
                  </span>
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                      isToday
                        ? 'bg-text text-white'
                        : 'text-text'
                    }`}
                  >
                    {wd.date.getDate()}
                  </div>
                  <div className="h-1.5 flex items-center justify-center">
                    {hasWorkout && (
                      <span className={`w-1.5 h-1.5 rounded-full ${isToday ? 'bg-primary' : 'bg-text-muted'}`} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </button>

        {/* Start Workout Card */}
        <div className="p-5">
          <Card className="!p-5">
            <h2 className="text-lg font-bold mb-1">Ready to train?</h2>
            <p className="text-sm text-text-muted mb-4">
              {isActive ? 'You have a workout in progress.' : 'Start a quick workout or choose a template.'}
            </p>
            {isActive ? (
              <Button variant="primary" fullWidth onClick={handleResumeWorkout}>
                Resume Workout
              </Button>
            ) : (
              <Button variant="primary" fullWidth onClick={handleStartWorkout}>
                Start Workout
              </Button>
            )}
          </Card>
        </div>

        {/* Workout Builder */}
        {!isActive && (
          <div className="px-5">
            <WorkoutBuilder />
          </div>
        )}

        {/* Saved Templates */}
        <div className="px-5 mt-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-text">Saved Templates</h2>
            {templates.length > 0 && (
              <span className="text-xs text-text-muted">{templates.length} saved</span>
            )}
          </div>

          {templates.length === 0 ? (
            <Card>
              <div className="text-center py-4">
                <div className="w-12 h-12 rounded-full bg-surface-light flex items-center justify-center mx-auto mb-3">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-text-muted">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="12" y1="18" x2="12" y2="12" />
                    <line x1="9" y1="15" x2="15" y2="15" />
                  </svg>
                </div>
                <p className="text-sm text-text-muted">No templates yet</p>
                <p className="text-xs text-text-muted mt-1">Complete a workout and save it as a template</p>
              </div>
            </Card>
          ) : (
            <div className="space-y-3">
              {templates.map((t) => {
                const sortedExercises = [...t.template_exercises].sort(
                  (a, b) => a.order_index - b.order_index
                );
                const exerciseNames = sortedExercises.slice(0, 3).map((e) => e.exercises.name);
                const moreCount = t.template_exercises.length - 3;

                return (
                  <Card key={t.id} onClick={() => handleStartFromTemplate(t)}>
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm">{t.name}</p>
                        <p className="text-xs text-text-muted mt-0.5 truncate">
                          {exerciseNames.join(' • ')}
                          {moreCount > 0 && ` +${moreCount}`}
                        </p>
                      </div>
                      <div className="ml-3 text-text-muted">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
