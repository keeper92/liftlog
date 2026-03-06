'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ChevronRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { isMissingSplitSetColumnsError } from '@/lib/supabase/schemaCompat';
import { useActiveWorkoutStore } from '@/stores/activeWorkoutStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { formatAutoWorkoutName } from '@/lib/utils/workoutName';
import { buildExerciseSetSummaries } from '@/lib/utils/workoutSetSummary';
import { Button } from '@/components/ui/button-shadcn';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card-shadcn';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useChatUIStore } from '@/stores/chatUIStore';
import HistoryOverlay from '@/components/history/HistoryOverlay';
import PRFeedOverlay from '@/components/pr/PRFeedOverlay';
import { usePRStore } from '@/stores/prStore';
import ExerciseSetSummaryList from '@/components/workout/ExerciseSetSummaryList';

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
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem('selectedTemplateId');
  });
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [historyInitialDateKey, setHistoryInitialDateKey] = useState<string | null>(null);
  const [showPRFeed, setShowPRFeed] = useState(false);
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
        } else {
          setRecentWorkouts([]);
        }
      } else if (workoutError) {
        setRecentWorkouts([]);
      }
    }
    void load();
  }, [supabase]);

  useEffect(() => {
    const nextSelectedTemplateId = selectedTemplateId && templates.some((template) => template.id === selectedTemplateId)
      ? selectedTemplateId
      : templates[0]?.id ?? null;
    if (nextSelectedTemplateId) {
      window.localStorage.setItem('selectedTemplateId', nextSelectedTemplateId);
      return;
    }
    window.localStorage.removeItem('selectedTemplateId');
  }, [selectedTemplateId, templates]);

  // ─── Demo tour (disabled) ───────────────────────────────

  // ─── Register action chips ─────────────────────────────
  useEffect(() => {
    const chips = [];
    if (isActive) {
      chips.push({
        id: 'resume-workout',
        label: 'Resume workout',
        onAction: () => router.push(`/workout/${workoutId}`),
      });
    }
    setActionChips(chips);
    return () => clearActionChips();
  }, [isActive, workoutId, router, setActionChips, clearActionChips]);

  // ─── Helpers ────────────────────────────────────────────
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

  function formatDaysAgo(date: string) {
    const workoutDate = new Date(date);
    const today = new Date();
    const workoutMidnight = new Date(workoutDate.getFullYear(), workoutDate.getMonth(), workoutDate.getDate());
    const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const daysAgo = Math.max(0, Math.floor((todayMidnight.getTime() - workoutMidnight.getTime()) / 86_400_000));

    return daysAgo === 1 ? '1 day ago' : `${daysAgo} days ago`;
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

  function handleTemplateSelect(templateId: string) {
    setSelectedTemplateId(templateId);
    setTemplatePickerOpen(false);
  }

  function handleCreateTemplate() {
    setTemplatePickerOpen(false);
    openChat('create-template');
  }

  const effectiveSelectedTemplateId = selectedTemplateId && templates.some((template) => template.id === selectedTemplateId)
    ? selectedTemplateId
    : templates[0]?.id ?? null;
  const selectedTemplate = templates.find((template) => template.id === effectiveSelectedTemplateId) ?? null;
  const selectedTemplateName = templates.length === 0
    ? 'No templates yet'
    : 'Select Template';
  const latestWorkout = recentWorkouts[0] ?? null;
  const lastWorkoutSubtitle = latestWorkout
    ? `Last workout: ${latestWorkout.name || formatAutoWorkoutName(latestWorkout.date)} - ${formatDaysAgo(latestWorkout.date)}`
    : 'Last workout: No workouts yet';

  return (
    <>
      {/* Tour intro dialog */}
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

      <div className="mx-auto w-full max-w-3xl space-y-6 px-4 pt-4 sm:px-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
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
                <path d="M10 14.66v1.626a2 2 0 0 1-.976 1.696A5 5 0 0 0 7 21.978m7-7.318v1.626a2 2 0 0 0 .976 1.696A5 5 0 0 1 17 21.978M18 9h1.5a1 1 0 0 0 0-5H18M4 22h16" />
                <path d="M6 9a6 6 0 0 0 12 0V3a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1zm0 0H4.5a1 1 0 0 1 0-5H6" />
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

        <Card data-tour-anchor="saved-templates">
          <CardHeader className="pb-4">
            <CardTitle>Today&apos;s Workout</CardTitle>
            <p className="text-sm text-muted-foreground">{lastWorkoutSubtitle}</p>
          </CardHeader>
          <CardContent className="space-y-3">
            <Sheet open={templatePickerOpen} onOpenChange={setTemplatePickerOpen}>
              <Button
                type="button"
                variant="outline"
                className="w-full justify-between bg-muted/40 hover:bg-muted/60"
                onClick={() => setTemplatePickerOpen(true)}
              >
                <span className="truncate text-left">{selectedTemplateName}</span>
                <ChevronRight className="h-4 w-4 shrink-0 opacity-60" />
              </Button>
              <SheetContent
                side="bottom"
                portal={false}
                hideCloseButton
                className="inset-x-0 bottom-0 rounded-t-2xl p-0"
              >
                <div className="mx-auto mt-2 h-1.5 w-12 rounded-full bg-muted" />
                <SheetHeader className="px-4 pb-2 pt-3">
                  <SheetTitle>Choose template</SheetTitle>
                </SheetHeader>
                <div className="px-4 pb-4">
                  <ScrollArea className="h-[50vh]">
                    {templates.length > 0 ? (
                      <div className="space-y-1">
                        {templates.map((template) => {
                          const isSelected = template.id === effectiveSelectedTemplateId;
                          return (
                            <button
                              key={template.id}
                              type="button"
                              onClick={() => handleTemplateSelect(template.id)}
                              className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                                isSelected
                                  ? 'border-primary/40 bg-primary/10 text-foreground'
                                  : 'border-transparent hover:border-border hover:bg-muted/60'
                              }`}
                            >
                              <span className="truncate">{template.name}</span>
                              {isSelected ? (
                                <Check className="h-4 w-4 text-primary" />
                              ) : (
                                <span className="h-4 w-4" aria-hidden="true" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="flex h-[50vh] items-center justify-center rounded-md border border-dashed border-border bg-muted/30 px-4 text-sm text-muted-foreground">
                        No templates yet
                      </div>
                    )}
                  </ScrollArea>
                  <Button
                    variant="secondary"
                    className="mt-3 w-full"
                    onClick={handleCreateTemplate}
                  >
                    + Create new template
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
            <Button
              onClick={() => {
                if (selectedTemplate) handleStartFromTemplate(selectedTemplate);
              }}
              className="w-full"
              disabled={!selectedTemplate}
            >
              Start Workout
            </Button>
            <Button
              onClick={handleStartWorkout}
              variant="secondary"
              className="w-full"
            >
              Quick Start
            </Button>
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <section className="space-y-2">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-medium text-muted-foreground">Recent Activity</h2>
          </div>
          {recentWorkouts.length === 0 ? (
            <Card>
              <CardContent className="py-6 text-center">
                <p className="text-sm text-muted-foreground">No workouts logged yet.</p>
                <Button onClick={handleStartWorkout} size="sm" className="mt-4">
                  Start First Workout
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {recentWorkouts.map((workout) => (
                <Card key={workout.id}>
                  <CardContent className="space-y-3 py-4">
                    <div className="space-y-1">
                      <p className="text-base font-semibold">
                        {workout.name || formatAutoWorkoutName(workout.date)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatWorkoutDate(workout.date)}
                      </p>
                    </div>
                    <ExerciseSetSummaryList
                      summaries={getExerciseSummaries(workout)}
                      emptyText="No exercises logged."
                    />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
