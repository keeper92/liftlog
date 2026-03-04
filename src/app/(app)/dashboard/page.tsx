'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { isMissingSplitSetColumnsError } from '@/lib/supabase/schemaCompat';
import { DEMO_TOUR_PENDING_KEY } from '@/lib/constants/onboarding';
import { useActiveWorkoutStore } from '@/stores/activeWorkoutStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { formatAutoWorkoutName } from '@/lib/utils/workoutName';
import { buildExerciseSetSummaries } from '@/lib/utils/workoutSetSummary';
import { Button } from '@/components/ui/button-shadcn';
import { Card, CardContent } from '@/components/ui/card-shadcn';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import DemoFeatureTour from '@/components/onboarding/DemoFeatureTour';
import { useChatUIStore } from '@/stores/chatUIStore';
import HistoryOverlay from '@/components/history/HistoryOverlay';
import PRFeedOverlay from '@/components/pr/PRFeedOverlay';
import { usePRStore } from '@/stores/prStore';
import ExerciseSetSummaryList from '@/components/workout/ExerciseSetSummaryList';
import TemplateChips from '@/components/dashboard/TemplateChips';

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

interface RecentWorkout {
  id: string;
  name: string | null;
  date: string;
  sets?: Array<{
    exercise_id: string;
    set_number: number | null;
    weight: number | null;
    reps: number | null;
    is_split_lr?: boolean | null;
    left_weight?: number | null;
    left_reps?: number | null;
    right_weight?: number | null;
    right_reps?: number | null;
    exercises: { name: string } | Array<{ name: string }> | null;
  }> | null;
}

export default function DashboardPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { isActive, workoutId, startWorkout, addExerciseWithSets } = useActiveWorkoutStore();
  const unitSystem = useSettingsStore((s) => s.unitSystem);
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [stats, setStats] = useState<ProgressSummary | null>(null);
  const [recentWorkouts, setRecentWorkouts] = useState<RecentWorkout[]>([]);
  const [recentWorkoutIndex, setRecentWorkoutIndex] = useState(0);
  const [showHistory, setShowHistory] = useState(false);
  const [historyInitialDateKey, setHistoryInitialDateKey] = useState<string | null>(null);
  const [showPRFeed, setShowPRFeed] = useState(false);
  const [tourStage, setTourStage] = useState<'idle' | 'intro' | 'active'>('idle');
  const unreadCount = usePRStore((s) => s.unreadCount);

  const setActionChips = useChatUIStore((s) => s.setActionChips);
  const clearActionChips = useChatUIStore((s) => s.clearActionChips);
  const openChat = useChatUIStore((s) => s.openChat);

  // ─── Load data ──────────────────────────────────────────
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

      const { data: workoutData, error: workoutError } = await supabase
        .from('workouts')
        .select('id, name, date, sets(exercise_id, set_number, weight, reps, is_split_lr, left_weight, left_reps, right_weight, right_reps, exercises(name))')
        .eq('user_id', user.id)
        .order('date', { ascending: false })
        .limit(12);

      if (workoutData && !workoutError) {
        setRecentWorkouts(workoutData as unknown as RecentWorkout[]);
        setRecentWorkoutIndex(0);
      } else if (isMissingSplitSetColumnsError(workoutError)) {
        const { data: legacyWorkoutData, error: legacyWorkoutError } = await supabase
          .from('workouts')
          .select('id, name, date, sets(exercise_id, set_number, weight, reps, exercises(name))')
          .eq('user_id', user.id)
          .order('date', { ascending: false })
          .limit(12);

        if (legacyWorkoutData && !legacyWorkoutError) {
          const normalized = (legacyWorkoutData as unknown as RecentWorkout[]).map((workout) => ({
            ...workout,
            sets: (workout.sets ?? []).map((set) => ({
              ...set,
              is_split_lr: false,
              left_weight: null,
              left_reps: null,
              right_weight: null,
              right_reps: null,
            })),
          }));
          setRecentWorkouts(normalized);
          setRecentWorkoutIndex(0);
        } else {
          setRecentWorkouts([]);
          setRecentWorkoutIndex(0);
        }
      } else if (workoutError) {
        setRecentWorkouts([]);
        setRecentWorkoutIndex(0);
      }
    }
    void load();
  }, [supabase]);

  // ─── Demo tour ──────────────────────────────────────────
  useEffect(() => {
    const pendingTour = sessionStorage.getItem(DEMO_TOUR_PENDING_KEY);
    if (pendingTour !== '1') return;
    const frameId = window.requestAnimationFrame(() => {
      setTourStage('intro');
    });
    return () => window.cancelAnimationFrame(frameId);
  }, []);

  // ─── Register action chips ─────────────────────────────
  useEffect(() => {
    const chips = [];
    if (isActive) {
      chips.push({
        id: 'quick-start',
        label: 'Resume workout',
        onAction: () => router.push(`/workout/${workoutId}`),
      });
    } else {
      chips.push({
        id: 'quick-start',
        label: 'Quick start',
        onAction: () => {
          startWorkout();
          const state = useActiveWorkoutStore.getState();
          router.push(`/workout/${state.workoutId}`);
        },
      });
    }
    chips.push({
      id: 'create-template',
      label: '+ Template',
      onAction: () => openChat('create-template'),
    });
    setActionChips(chips);
    return () => clearActionChips();
  }, [isActive, workoutId, router, startWorkout, openChat, setActionChips, clearActionChips]);

  // ─── Helpers ────────────────────────────────────────────
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

  function handleStartWorkoutFromOverlay() {
    setShowHistory(false);
    setHistoryInitialDateKey(null);
    setShowPRFeed(false);
    handleStartWorkout();
  }

  function formatWorkoutDate(date: string) {
    return new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  function toDateKey(value: string): string {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      const year = parsed.getFullYear();
      const month = String(parsed.getMonth() + 1).padStart(2, '0');
      const day = String(parsed.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    const [dateKey] = value.split('T');
    return dateKey;
  }

  function openHistory(dateKey: string | null = null) {
    setShowPRFeed(false);
    setHistoryInitialDateKey(dateKey);
    setShowHistory(true);
  }

  function getExerciseSummaries(workout: RecentWorkout) {
    return buildExerciseSetSummaries(
      (workout.sets || []).map((set) => {
        const exercise = Array.isArray(set.exercises) ? set.exercises[0] : set.exercises;
        return {
          exerciseId: set.exercise_id,
          exerciseName: exercise?.name || 'Exercise',
          setNumber: set.set_number,
          weight: set.weight,
          reps: set.reps,
          isSplitLR: set.is_split_lr,
          leftWeight: set.left_weight,
          leftReps: set.left_reps,
          rightWeight: set.right_weight,
          rightReps: set.right_reps,
        };
      }),
      unitSystem,
    );
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

  const safeRecentWorkoutIndex = recentWorkouts.length === 0
    ? 0
    : Math.min(recentWorkoutIndex, recentWorkouts.length - 1);
  const activeRecentWorkout = recentWorkouts[safeRecentWorkoutIndex] ?? null;
  const canShowOlderWorkout = safeRecentWorkoutIndex < recentWorkouts.length - 1;
  const canShowNewerWorkout = safeRecentWorkoutIndex > 0;
  const activeWorkoutExerciseSummaries = activeRecentWorkout
    ? getExerciseSummaries(activeRecentWorkout)
    : [];

  return (
    <>
      {/* Tour intro dialog */}
      <Dialog
        open={tourStage === 'intro'}
        onOpenChange={(open) => {
          if (!open) closeTour();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Welcome to the demo</DialogTitle>
            <DialogDescription>
              This quick tour highlights the main features so you can explore the app in under a minute.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={closeTour}>Skip</Button>
            <Button onClick={startTour}>Start Tour</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {tourStage === 'active' && <DemoFeatureTour onFinish={closeTour} />}

      {showHistory && stats && (
        <HistoryOverlay
          onClose={() => {
            setShowHistory(false);
            setHistoryInitialDateKey(null);
          }}
          onStartWorkout={handleStartWorkoutFromOverlay}
          longestStreak={stats.longestStreak}
          currentStreak={stats.currentStreak}
          totalWorkouts={stats.totalWorkouts}
          initialDateKey={historyInitialDateKey}
        />
      )}

      {showPRFeed && (
        <PRFeedOverlay
          onClose={() => setShowPRFeed(false)}
          onStartWorkout={handleStartWorkoutFromOverlay}
        />
      )}

      <div className="mx-auto w-full max-w-3xl space-y-3 px-4 pt-4 sm:px-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
            <p className="text-sm text-muted-foreground">Your training hub.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => setShowPRFeed(true)}
              data-tour-anchor="pr-feed"
              aria-label="Open personal records"
              className="relative"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
              {unreadCount > 0 && (
                <span className="absolute -right-1 -top-1 inline-flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-xs font-semibold text-primary-foreground">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => openHistory()}
              data-tour-anchor="history"
              aria-label="Open consistency calendar"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            </Button>
          </div>
        </div>

        {/* Template chips */}
        <TemplateChips templates={templates} onSelect={handleStartFromTemplate} />

        {/* Recent Activity */}
        <section className="space-y-2">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold tracking-tight">Recent Activity</h2>
          </div>
          <Card className="relative">
            {recentWorkouts.length === 0 ? (
              <CardContent className="py-6 text-center">
                <p className="text-sm text-muted-foreground">No workouts logged yet.</p>
                <Button onClick={handleStartWorkout} size="sm" className="mt-4">
                  Start First Workout
                </Button>
              </CardContent>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setRecentWorkoutIndex((idx) => Math.min(idx + 1, recentWorkouts.length - 1))}
                  disabled={!canShowOlderWorkout}
                  className="absolute left-2 top-1/2 z-10 h-9 w-9 -translate-y-1/2"
                  aria-label="Show older workout"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setRecentWorkoutIndex((idx) => Math.max(idx - 1, 0))}
                  disabled={!canShowNewerWorkout}
                  className="absolute right-2 top-1/2 z-10 h-9 w-9 -translate-y-1/2"
                  aria-label="Show newer workout"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </Button>
                <CardContent className="space-y-4 px-14 py-4">
                  {activeRecentWorkout && (
                    <>
                      <div className="space-y-1 text-center">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => openHistory(toDateKey(activeRecentWorkout.date))}
                          className="h-auto max-w-full px-2 py-0.5 text-base font-semibold"
                        >
                          <span className="break-words">
                            {activeRecentWorkout.name || formatAutoWorkoutName(activeRecentWorkout.date)}
                          </span>
                        </Button>
                        <p className="text-xs text-muted-foreground">
                          {formatWorkoutDate(activeRecentWorkout.date)}
                        </p>
                      </div>

                      <ExerciseSetSummaryList
                        summaries={activeWorkoutExerciseSummaries}
                        emptyText="No exercises logged."
                      />
                    </>
                  )}
                </CardContent>
              </>
            )}
          </Card>
        </section>
      </div>
    </>
  );
}
