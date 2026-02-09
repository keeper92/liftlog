'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useActiveWorkoutStore } from '@/stores/activeWorkoutStore';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import WorkoutBuilder from './_components/WorkoutBuilder';

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

interface WeekStats {
  workouts: number;
  streak: number;
}

export default function DashboardPage() {
  const router = useRouter();
  const supabase = createClient();
  const { isActive, workoutId, startWorkout, addExerciseWithSets } = useActiveWorkoutStore();
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [weekStats, setWeekStats] = useState<WeekStats | null>(null);

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

      // Get week stats
      const { data: summary } = await supabase.rpc('get_progress_summary', {
        user_uuid: user.id,
      });
      if (summary) {
        setWeekStats({
          workouts: (summary as { weekWorkouts: number }).weekWorkouts,
          streak: (summary as { currentStreak: number }).currentStreak,
        });
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
    <div className="pb-24">
        {/* Header */}
        <div className="bg-surface px-5 pt-8 pb-6 border-b border-border">
          <p className="text-sm font-black text-primary tracking-tight">rep</p>
          <h1 className="text-2xl font-bold mt-1">Home</h1>
        </div>

        {/* Week Stats */}
        {weekStats && (
          <div className="px-5 py-4 bg-surface border-b border-border">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-primary">
                    <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                  </svg>
                </div>
                <div>
                  <p className="text-lg font-bold">{weekStats.workouts}</p>
                  <p className="text-xs text-text-muted">This week</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-full bg-warning/10 flex items-center justify-center">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-warning">
                    <path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83" />
                  </svg>
                </div>
                <div>
                  <p className="text-lg font-bold">{weekStats.streak}</p>
                  <p className="text-xs text-text-muted">Day streak</p>
                </div>
              </div>
            </div>
          </div>
        )}

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
  );
}
