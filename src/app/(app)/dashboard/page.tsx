'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { DEMO_TOUR_PENDING_KEY } from '@/lib/constants/onboarding';
import { useActiveWorkoutStore } from '@/stores/activeWorkoutStore';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Modal from '@/components/ui/Modal';
import DemoFeatureTour from '@/components/onboarding/DemoFeatureTour';

import HistoryOverlay from '@/components/history/HistoryOverlay';
import PRFeedOverlay from '@/components/pr/PRFeedOverlay';
import { usePRStore } from '@/stores/prStore';

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

export default function DashboardPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { isActive, workoutId, startWorkout, addExerciseWithSets } = useActiveWorkoutStore();
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [stats, setStats] = useState<ProgressSummary | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showPRFeed, setShowPRFeed] = useState(false);
  const [tourStage, setTourStage] = useState<'idle' | 'intro' | 'active'>('idle');
  const unreadCount = usePRStore((s) => s.unreadCount);

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

    }
    load();
  }, [supabase]);

  useEffect(() => {
    const pendingTour = sessionStorage.getItem(DEMO_TOUR_PENDING_KEY);
    if (pendingTour !== '1') return;
    const frameId = window.requestAnimationFrame(() => {
      setTourStage('intro');
    });
    return () => window.cancelAnimationFrame(frameId);
  }, []);

  function closeTour() {
    sessionStorage.removeItem(DEMO_TOUR_PENDING_KEY);
    setTourStage('idle');
  }

  function startTour() {
    sessionStorage.removeItem(DEMO_TOUR_PENDING_KEY);
    setTourStage('active');
  }

  function handleStartWorkout() {
    startWorkout();
    const state = useActiveWorkoutStore.getState();
    router.push(`/workout/${state.workoutId}`);
  }

  function handleResumeWorkout() {
    router.push(`/workout/${workoutId}`);
  }

  function handleStartWorkoutFromOverlay() {
    setShowHistory(false);
    setShowPRFeed(false);
    handleStartWorkout();
  }

  function handleCreateTemplateWithAI() {
    setShowHistory(false);
    setShowPRFeed(false);
    router.push('/trainer?intent=create-template');
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
      <Modal
        isOpen={tourStage === 'intro'}
        onClose={closeTour}
        title="Welcome to the demo"
        actions={[
          { label: 'Skip', variant: 'ghost', onClick: closeTour },
          { label: 'Start Tour', onClick: startTour },
        ]}
      >
        <p className="text-sm leading-relaxed">
          This quick tour highlights the main features so you can explore the app in under a minute.
        </p>
      </Modal>

      {tourStage === 'active' && <DemoFeatureTour onFinish={closeTour} />}

      {/* History Overlay */}
      {showHistory && stats && (
        <HistoryOverlay
          onClose={() => setShowHistory(false)}
          onStartWorkout={handleStartWorkoutFromOverlay}
          longestStreak={stats.longestStreak}
          currentStreak={stats.currentStreak}
          totalWorkouts={stats.totalWorkouts}
        />
      )}

      {/* PR Feed Overlay */}
      {showPRFeed && (
        <PRFeedOverlay
          onClose={() => setShowPRFeed(false)}
          onStartWorkout={handleStartWorkoutFromOverlay}
        />
      )}

      <div className="pb-24">
        {/* Header and utility actions */}
        <div className="px-5 pt-4 flex items-center justify-between gap-3">
          <div>
            <p className="ui-kicker">Dashboard</p>
            <h1 className="mt-1 text-[22px] font-semibold tracking-tight text-text">Train with intent</h1>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
          {/* Records button */}
          <button
            onClick={() => setShowPRFeed(true)}
            data-tour-anchor="pr-feed"
            aria-label="Open personal records"
            className="ui-icon-pill relative h-10 px-3 flex items-center justify-center gap-1.5 rounded-full text-xs font-medium text-text-secondary"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-text">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
            <span>Records</span>
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 bg-primary text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
          {/* Consistency button */}
          <button
            onClick={() => setShowHistory(true)}
            data-tour-anchor="history"
            aria-label="Open consistency calendar"
            className="ui-icon-pill h-10 px-3 flex items-center justify-center gap-1.5 rounded-full text-xs font-medium text-text-secondary"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-text">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            <span>Consistency</span>
          </button>
          </div>
        </div>

        {/* Start Workout Card */}
        <div className="px-5 pt-5">
          <Card className="!p-6">
            <p className="ui-kicker mb-2">Quick Start</p>
            <h2 className="text-lg font-bold mb-1">Ready to train?</h2>
            <p className="text-sm text-text-secondary mb-4">
              {isActive ? 'You have a workout in progress.' : 'Start a quick workout or choose a template.'}
            </p>
            {isActive ? (
              <Button
                variant="primary"
                fullWidth
                onClick={handleResumeWorkout}
                data-tour-anchor="start-workout"
              >
                Resume Workout
              </Button>
            ) : (
              <Button
                variant="primary"
                fullWidth
                onClick={handleStartWorkout}
                data-tour-anchor="start-workout"
              >
                Start Workout
              </Button>
            )}
          </Card>
        </div>

        {stats && (
          <div className="px-5 pt-4">
            <Card className="!p-4">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-base font-semibold text-text">{stats.weekWorkouts}</p>
                  <p className="text-[11px] text-text-muted mt-0.5">This Week</p>
                </div>
                <div>
                  <p className="text-base font-semibold text-text">{stats.currentStreak}</p>
                  <p className="text-[11px] text-text-muted mt-0.5">Current Streak</p>
                </div>
                <div>
                  <p className="text-base font-semibold text-text">{stats.totalWorkouts}</p>
                  <p className="text-[11px] text-text-muted mt-0.5">Sessions Logged</p>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* Saved Templates */}
        <div className="px-5 mt-6" data-tour-anchor="saved-templates">
          <div className="flex items-center justify-between mb-3">
            <h2 className="ui-kicker">Saved Templates</h2>
            {templates.length > 0 && (
              <span className="text-xs text-text-muted">{templates.length} saved</span>
            )}
          </div>

          {templates.length === 0 ? (
            <Card>
              <div className="text-center py-4">
                <div className="w-12 h-12 rounded-full border border-border/80 bg-surface-light flex items-center justify-center mx-auto mb-3">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-text-muted">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="12" y1="18" x2="12" y2="12" />
                    <line x1="9" y1="15" x2="15" y2="15" />
                  </svg>
                </div>
                <p className="text-sm text-text-muted">No templates yet</p>
                <p className="text-xs text-text-muted mt-1">Build your first one with AI Trainer</p>
                <Button onClick={handleCreateTemplateWithAI} size="sm" className="mt-4">
                  Create Template with AI
                </Button>
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
                      <div className="ml-3 w-8 h-8 rounded-full bg-surface-light text-text-muted flex items-center justify-center">
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
