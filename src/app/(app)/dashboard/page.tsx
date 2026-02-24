'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { DEMO_TOUR_PENDING_KEY } from '@/lib/constants/onboarding';
import { useActiveWorkoutStore } from '@/stores/activeWorkoutStore';
import { formatAutoWorkoutName } from '@/lib/utils/workoutName';
import { Button } from '@/components/ui/button-shadcn';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card-shadcn';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input-shadcn';
import { Label } from '@/components/ui/label';
import DemoFeatureTour from '@/components/onboarding/DemoFeatureTour';

import HistoryOverlay from '@/components/history/HistoryOverlay';
import PRFeedOverlay from '@/components/pr/PRFeedOverlay';
import { usePRStore } from '@/stores/prStore';
import ExercisePickerOverlay from '@/components/workout/ExercisePickerOverlay';

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
    reps: number | null;
    is_split_lr?: boolean | null;
    left_reps?: number | null;
    right_reps?: number | null;
    exercises: { name: string } | Array<{ name: string }> | null;
  }> | null;
}

interface ManualTemplateExercise {
  exerciseId: string;
  name: string;
  category: string;
  defaultSets: number;
}

export default function DashboardPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { isActive, workoutId, startWorkout, addExerciseWithSets } = useActiveWorkoutStore();
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [stats, setStats] = useState<ProgressSummary | null>(null);
  const [recentWorkouts, setRecentWorkouts] = useState<RecentWorkout[]>([]);
  const [recentWorkoutIndex, setRecentWorkoutIndex] = useState(0);
  const [showHistory, setShowHistory] = useState(false);
  const [historyInitialDateKey, setHistoryInitialDateKey] = useState<string | null>(null);
  const [showPRFeed, setShowPRFeed] = useState(false);
  const [tourStage, setTourStage] = useState<'idle' | 'intro' | 'active'>('idle');
  const [showManualTemplateModal, setShowManualTemplateModal] = useState(false);
  const [showTemplateExercisePicker, setShowTemplateExercisePicker] = useState(false);
  const [manualTemplateName, setManualTemplateName] = useState('');
  const [manualTemplateExercises, setManualTemplateExercises] = useState<ManualTemplateExercise[]>([]);
  const [savingManualTemplate, setSavingManualTemplate] = useState(false);
  const [manualTemplateError, setManualTemplateError] = useState<string | null>(null);
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

      const { data: workoutData } = await supabase
        .from('workouts')
        .select('id, name, date, sets(exercise_id, set_number, reps, is_split_lr, left_reps, right_reps, exercises(name))')
        .eq('user_id', user.id)
        .order('date', { ascending: false })
        .limit(12);
      if (workoutData) {
        setRecentWorkouts(workoutData as unknown as RecentWorkout[]);
        setRecentWorkoutIndex(0);
      }
    }
    void load();
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
    const grouped = new Map<string, { name: string; reps: string[] }>();
    const orderedSets = [...(workout.sets || [])].sort(
      (a, b) => (a.set_number ?? 0) - (b.set_number ?? 0),
    );

    for (const set of orderedSets) {
      const exercise = Array.isArray(set.exercises) ? set.exercises[0] : set.exercises;
      const name = exercise?.name?.trim() || 'Exercise';
      const key = set.exercise_id;
      if (!grouped.has(key)) grouped.set(key, { name, reps: [] });

      const repsLabel = set.is_split_lr
        ? `L${set.left_reps ?? '-'} / R${set.right_reps ?? '-'}`
        : set.reps !== null
          ? `${set.reps}`
          : '-';
      grouped.get(key)!.reps.push(repsLabel);
    }

    return Array.from(grouped.values()).map((group) => {
      const visibleReps = group.reps.slice(0, 6);
      const hiddenCount = Math.max(group.reps.length - visibleReps.length, 0);
      const repsText = hiddenCount > 0
        ? `${visibleReps.join(' / ')} / +${hiddenCount}`
        : visibleReps.join(' / ');

      return {
        name: group.name,
        setCount: group.reps.length,
        repsText,
      };
    });
  }

  function handleCreateTemplateWithAI() {
    setShowHistory(false);
    setShowPRFeed(false);
    router.push('/trainer?intent=create-template');
  }

  function openManualTemplateBuilder() {
    setShowHistory(false);
    setShowPRFeed(false);
    setManualTemplateName('');
    setManualTemplateExercises([]);
    setManualTemplateError(null);
    setShowManualTemplateModal(true);
  }

  function closeManualTemplateBuilder() {
    if (savingManualTemplate) return;
    setShowManualTemplateModal(false);
    setShowTemplateExercisePicker(false);
    setManualTemplateError(null);
  }

  function addExerciseToManualTemplate(exercise: { id: string; name: string; category: string }) {
    setManualTemplateError(null);
    setManualTemplateExercises((prev) => {
      if (prev.some((item) => item.exerciseId === exercise.id)) {
        setManualTemplateError('Exercise already added to this template.');
        return prev;
      }
      return [
        ...prev,
        {
          exerciseId: exercise.id,
          name: exercise.name,
          category: exercise.category,
          defaultSets: 3,
        },
      ];
    });
  }

  function updateManualTemplateSets(index: number, value: string) {
    const parsed = Number.parseInt(value, 10);
    setManualTemplateExercises((prev) => {
      const next = [...prev];
      if (!next[index]) return prev;
      next[index] = {
        ...next[index],
        defaultSets: Number.isFinite(parsed) ? Math.max(1, Math.min(12, parsed)) : 1,
      };
      return next;
    });
  }

  function removeManualTemplateExercise(index: number) {
    setManualTemplateExercises((prev) => prev.filter((_, i) => i !== index));
  }

  function moveManualTemplateExercise(index: number, direction: 'up' | 'down') {
    setManualTemplateExercises((prev) => {
      const target = direction === 'up' ? index - 1 : index + 1;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function handleSaveManualTemplate() {
    const trimmedName = manualTemplateName.trim();
    if (!trimmedName) {
      setManualTemplateError('Template name is required.');
      return;
    }
    if (manualTemplateExercises.length === 0) {
      setManualTemplateError('Add at least one exercise.');
      return;
    }

    setSavingManualTemplate(true);
    setManualTemplateError(null);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setManualTemplateError('Please sign in again.');
      setSavingManualTemplate(false);
      return;
    }

    const { data: template, error: templateError } = await supabase
      .from('workout_templates')
      .insert({ user_id: user.id, name: trimmedName })
      .select('id')
      .single();

    if (templateError || !template) {
      setManualTemplateError(templateError?.message || 'Could not create template.');
      setSavingManualTemplate(false);
      return;
    }

    const templateRows = manualTemplateExercises.map((exercise, index) => ({
      template_id: template.id,
      exercise_id: exercise.exerciseId,
      order_index: index,
      default_sets: exercise.defaultSets,
    }));

    const { error: templateExercisesError } = await supabase
      .from('template_exercises')
      .insert(templateRows);

    if (templateExercisesError) {
      setManualTemplateError(templateExercisesError.message || 'Could not save template exercises.');
      await supabase.from('workout_templates').delete().eq('id', template.id);
      setSavingManualTemplate(false);
      return;
    }

    const { data: templatesData } = await supabase
      .from('workout_templates')
      .select('id, name, template_exercises(exercise_id, order_index, default_sets, exercises(name, category))')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(10);
    if (templatesData) setTemplates(templatesData as unknown as TemplateSummary[]);
    setSavingManualTemplate(false);
    setShowManualTemplateModal(false);
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

      <Dialog
        open={showManualTemplateModal}
        onOpenChange={(open) => {
          if (!open) closeManualTemplateBuilder();
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Build Template</DialogTitle>
            <DialogDescription>Create your own workout template.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {manualTemplateError && (
              <div className="rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {manualTemplateError}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="manual-template-name">Template Name</Label>
              <Input
                id="manual-template-name"
                value={manualTemplateName}
                onChange={(e) => setManualTemplateName(e.target.value)}
                placeholder="e.g., Push Day"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Exercises</Label>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowTemplateExercisePicker(true)}
                >
                  + Add Exercise
                </Button>
              </div>

              <div className="max-h-64 space-y-2 overflow-y-auto rounded-md border p-3">
                {manualTemplateExercises.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No exercises yet. Add one to start building your template.</p>
                ) : (
                  manualTemplateExercises.map((exercise, index) => (
                    <div key={`${exercise.exerciseId}-${index}`} className="grid grid-cols-[1fr_72px_90px] items-center gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{exercise.name}</p>
                        <p className="text-xs text-muted-foreground capitalize">{exercise.category.replace('_', ' ')}</p>
                      </div>
                      <Input
                        type="number"
                        min={1}
                        max={12}
                        value={exercise.defaultSets}
                        onChange={(e) => updateManualTemplateSets(index, e.target.value)}
                        className="h-8 text-center"
                      />
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={() => moveManualTemplateExercise(index, 'up')}
                          className="h-7 w-7"
                          aria-label="Move exercise up"
                        >
                          ↑
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={() => moveManualTemplateExercise(index, 'down')}
                          className="h-7 w-7"
                          aria-label="Move exercise down"
                        >
                          ↓
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={() => removeManualTemplateExercise(index)}
                          className="h-7 w-7"
                          aria-label="Remove exercise"
                        >
                          ×
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <p className="text-xs text-muted-foreground">Default sets per exercise.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={closeManualTemplateBuilder} disabled={savingManualTemplate}>
              Cancel
            </Button>
            <Button onClick={handleSaveManualTemplate} disabled={savingManualTemplate}>
              {savingManualTemplate ? 'Saving...' : 'Save Template'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ExercisePickerOverlay
        isOpen={showTemplateExercisePicker}
        onClose={() => setShowTemplateExercisePicker(false)}
        onSelect={(exercise) => {
          addExerciseToManualTemplate(exercise);
          setShowTemplateExercisePicker(false);
        }}
      />

      <div className="mx-auto w-full max-w-3xl space-y-3 px-4 pt-4 sm:px-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
              <p className="text-sm text-muted-foreground">Start workouts, track progress, and launch templates.</p>
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

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Ready to train?</CardTitle>
              <CardDescription>
                {isActive ? 'You have a workout in progress.' : 'Start a quick workout or choose a template.'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isActive ? (
                <Button className="w-full" onClick={handleResumeWorkout} data-tour-anchor="start-workout">
                  Resume Workout
                </Button>
              ) : (
                <Button className="w-full" onClick={handleStartWorkout} data-tour-anchor="start-workout">
                  Start Workout
                </Button>
              )}
            </CardContent>
          </Card>

          {stats && (
            <Card>
              <CardContent className="pt-6">
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="space-y-1">
                    <p className="text-xl font-semibold tabular-nums">{stats.weekWorkouts}</p>
                    <p className="text-xs text-muted-foreground">This Week</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xl font-semibold tabular-nums">{stats.currentStreak}</p>
                    <p className="text-xs text-muted-foreground">Current Streak</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xl font-semibold tabular-nums">{stats.totalWorkouts}</p>
                    <p className="text-xs text-muted-foreground">Sessions Logged</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <section className="space-y-2" data-tour-anchor="saved-templates">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold tracking-tight">Saved Templates</h2>
                {templates.length > 0 ? (
                  <p className="text-sm text-muted-foreground">{templates.length} saved</p>
                ) : null}
              </div>
            </div>

            {templates.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center py-6 text-center">
                  <p className="text-sm text-muted-foreground">No templates yet.</p>
                  <p className="text-sm text-muted-foreground">Build one yourself in seconds.</p>
                  <Button onClick={openManualTemplateBuilder} size="sm" className="mt-4">
                    + Build Template
                  </Button>
                  <Button variant="link" size="sm" onClick={handleCreateTemplateWithAI} className="mt-1 px-0">
                    Or chat with AI trainer to build
                  </Button>
                </CardContent>
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
                    <Card key={t.id}>
                      <CardContent className="p-0">
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-auto w-full justify-between rounded-xl px-4 py-4 text-left"
                          onClick={() => handleStartFromTemplate(t)}
                        >
                          <div className="min-w-0 space-y-1">
                            <p className="truncate text-sm font-medium">{t.name}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {exerciseNames.join(' • ')}
                              {moreCount > 0 && ` +${moreCount}`}
                            </p>
                          </div>
                          <span className="ml-3 inline-flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="9 18 15 12 9 6" />
                            </svg>
                          </span>
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
                <div className="text-center">
                  <Button variant="link" size="sm" onClick={handleCreateTemplateWithAI} className="px-0">
                    Or chat with AI trainer to build
                  </Button>
                </div>
              </div>
            )}
          </section>

          <section className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold tracking-tight">Recent Activity</h2>
              <Button variant="ghost" size="sm" onClick={() => openHistory()} className="h-8 px-2.5 text-xs">
                View all
              </Button>
            </div>
            <Card>
              {recentWorkouts.length === 0 ? (
                <CardContent className="py-6 text-center">
                  <p className="text-sm text-muted-foreground">No workouts logged yet.</p>
                  <Button onClick={handleStartWorkout} size="sm" className="mt-4">
                    Start First Workout
                  </Button>
                </CardContent>
              ) : (
                <CardContent className="space-y-4 p-4">
                  {activeRecentWorkout && (
                    <>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="break-words text-sm font-semibold">
                            {activeRecentWorkout.name || formatAutoWorkoutName(activeRecentWorkout.date)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatWorkoutDate(activeRecentWorkout.date)} · {safeRecentWorkoutIndex + 1} of {recentWorkouts.length}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={() => setRecentWorkoutIndex((idx) => Math.min(idx + 1, recentWorkouts.length - 1))}
                            disabled={!canShowOlderWorkout}
                            className="h-8 w-8"
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
                            className="h-8 w-8"
                            aria-label="Show newer workout"
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="9 18 15 12 9 6" />
                            </svg>
                          </Button>
                        </div>
                      </div>

                      {activeWorkoutExerciseSummaries.length === 0 ? (
                        <p className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                          No exercises logged.
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {activeWorkoutExerciseSummaries.map((exercise, index) => (
                            <div key={`${exercise.name}-${index}`} className="rounded-md border bg-muted/30 px-3 py-2">
                              <p className="break-words text-sm font-medium text-foreground">{exercise.name}</p>
                              <p className="break-words text-xs text-muted-foreground">
                                {exercise.setCount} set{exercise.setCount === 1 ? '' : 's'} · Reps: {exercise.repsText}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}

                      <div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => openHistory(toDateKey(activeRecentWorkout.date))}
                          className="h-8 px-2 text-xs"
                        >
                          Open in calendar
                        </Button>
                      </div>
                    </>
                  )}
                </CardContent>
              )}
            </Card>
          </section>
        </div>
    </>
  );
}
