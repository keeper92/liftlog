'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { DEMO_TOUR_PENDING_KEY } from '@/lib/constants/onboarding';
import { useActiveWorkoutStore } from '@/stores/activeWorkoutStore';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Modal from '@/components/ui/Modal';
import { Input } from '@/components/ui/input-shadcn';
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
  const [showHistory, setShowHistory] = useState(false);
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
    setShowPRFeed(false);
    handleStartWorkout();
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

      <Modal
        isOpen={showManualTemplateModal}
        onClose={closeManualTemplateBuilder}
        title="Build Template"
        actions={[
          { label: 'Cancel', variant: 'ghost', onClick: closeManualTemplateBuilder, disabled: savingManualTemplate },
          { label: savingManualTemplate ? 'Saving...' : 'Save Template', onClick: handleSaveManualTemplate, disabled: savingManualTemplate },
        ]}
      >
        <div className="space-y-4">
          {manualTemplateError && (
            <p className="text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2">{manualTemplateError}</p>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Template Name</label>
            <Input
              value={manualTemplateName}
              onChange={(e) => setManualTemplateName(e.target.value)}
              placeholder="e.g., Push Day"
              className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm focus:border-primary outline-none"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Exercises</p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowTemplateExercisePicker(true)}
                className="h-auto px-0 py-0 text-xs font-semibold text-primary hover:bg-transparent hover:text-primary/80"
              >
                + Add Exercise
              </Button>
            </div>

            <div className="max-h-64 overflow-y-auto rounded-2xl border border-border bg-background px-3 py-2 space-y-2">
              {manualTemplateExercises.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2">No exercises yet. Add one to start building your template.</p>
              ) : (
                manualTemplateExercises.map((exercise, index) => (
                  <div key={`${exercise.exerciseId}-${index}`} className="grid grid-cols-[1fr_72px_84px] gap-2 items-center">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{exercise.name}</p>
                      <p className="text-[11px] text-muted-foreground capitalize">{exercise.category.replace('_', ' ')}</p>
                    </div>
                    <Input
                      type="number"
                      min={1}
                      max={12}
                      value={exercise.defaultSets}
                      onChange={(e) => updateManualTemplateSets(index, e.target.value)}
                      className="w-full bg-card border border-border rounded-lg px-2 py-1.5 text-sm text-center"
                    />
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => moveManualTemplateExercise(index, 'up')}
                        className="h-7 w-7 rounded-md p-0 text-muted-foreground hover:text-foreground"
                        aria-label="Move exercise up"
                      >
                        ↑
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => moveManualTemplateExercise(index, 'down')}
                        className="h-7 w-7 rounded-md p-0 text-muted-foreground hover:text-foreground"
                        aria-label="Move exercise down"
                      >
                        ↓
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => removeManualTemplateExercise(index)}
                        className="h-7 w-7 rounded-md p-0 text-muted-foreground hover:text-destructive"
                        aria-label="Remove exercise"
                      >
                        ×
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">Default sets per exercise.</p>
          </div>
        </div>
      </Modal>

      <ExercisePickerOverlay
        isOpen={showTemplateExercisePicker}
        onClose={() => setShowTemplateExercisePicker(false)}
        onSelect={(exercise) => {
          addExerciseToManualTemplate(exercise);
          setShowTemplateExercisePicker(false);
        }}
      />

      <div className="pb-24">
        {/* Header and utility actions */}
        <div className="px-5 pt-4 flex items-center justify-between gap-3">
          <div>
            <p className="ui-kicker">Dashboard</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
          {/* Records button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowPRFeed(true)}
            data-tour-anchor="pr-feed"
            aria-label="Open personal records"
            className="ui-icon-pill relative h-10 w-10 rounded-full p-0 text-muted-foreground"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-foreground">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 bg-primary text-primary-foreground text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </Button>
          {/* Consistency button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowHistory(true)}
            data-tour-anchor="history"
            aria-label="Open consistency calendar"
            className="ui-icon-pill h-10 w-10 rounded-full p-0 text-muted-foreground"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-foreground">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </Button>
          </div>
        </div>

        {/* Start Workout Card */}
        <div className="px-5 pt-5">
          <Card className="!p-6">
            <p className="ui-kicker mb-2">Quick Start</p>
            <h2 className="text-lg font-bold mb-1">Ready to train?</h2>
            <p className="text-sm text-muted-foreground mb-4">
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
                  <p className="text-base font-semibold text-foreground">{stats.weekWorkouts}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">This Week</p>
                </div>
                <div>
                  <p className="text-base font-semibold text-foreground">{stats.currentStreak}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Current Streak</p>
                </div>
                <div>
                  <p className="text-base font-semibold text-foreground">{stats.totalWorkouts}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Sessions Logged</p>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* Saved Templates */}
        <div className="px-5 mt-6" data-tour-anchor="saved-templates">
          <div className="flex items-center justify-between mb-3">
            <h2 className="ui-kicker">Saved Templates</h2>
            <div className="flex items-center gap-2">
              {templates.length > 0 && (
                <span className="text-xs text-muted-foreground">{templates.length} saved</span>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={openManualTemplateBuilder}
                aria-label="Build template manually"
                className="ui-icon-pill h-8 w-8 rounded-full p-0 text-muted-foreground"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </Button>
            </div>
          </div>

          {templates.length === 0 ? (
            <Card>
              <div className="text-center py-4">
                <div className="w-12 h-12 rounded-full border border-border/80 bg-muted flex items-center justify-center mx-auto mb-3">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted-foreground">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="12" y1="18" x2="12" y2="12" />
                    <line x1="9" y1="15" x2="15" y2="15" />
                  </svg>
                </div>
                <p className="text-sm text-muted-foreground">No templates yet</p>
                <p className="text-xs text-muted-foreground mt-1">Build one yourself in seconds.</p>
                <Button onClick={openManualTemplateBuilder} size="sm" className="mt-4">
                  + Build Template
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCreateTemplateWithAI}
                  className="mt-3 h-auto px-0 py-0 text-xs font-medium text-muted-foreground hover:bg-transparent hover:text-foreground"
                >
                  Or chat with AI trainer to build
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
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {exerciseNames.join(' • ')}
                          {moreCount > 0 && ` +${moreCount}`}
                        </p>
                      </div>
                      <div className="ml-3 w-8 h-8 rounded-full bg-muted text-muted-foreground flex items-center justify-center">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                      </div>
                    </div>
                  </Card>
                );
              })}
              <div className="text-center pt-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCreateTemplateWithAI}
                  className="h-auto px-0 py-0 text-xs font-medium text-muted-foreground hover:bg-transparent hover:text-foreground"
                >
                  Or chat with AI trainer to build
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
