'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useSettingsStore } from '@/stores/settingsStore';
import { useChatStore, type ImportData, type TemplateData } from '@/stores/chatStore';
import { useTrainerProfileStore } from '@/stores/trainerProfileStore';
import { toDisplayWeight } from '@/lib/utils/units';
import type { TrainerProfile } from '@/lib/types/user';

// ─── Types ──────────────────────────────────────────────────

export interface ExerciseHistory {
  date: string;
  sets: { weight: number; reps: number }[];
}

export interface WorkoutContext {
  unitSystem: string;
  recentWorkouts: {
    name: string;
    date: string;
    exercises: string[];
    totalSets: number;
    totalVolume: number;
  }[];
  personalRecords: {
    exerciseName: string;
    maxWeight: number;
    maxReps: number;
    estimated1RM: number;
  }[];
  weeklyStats: {
    workouts: number;
    volume: number;
    streak: number;
  } | null;
  currentExercise?: {
    id: string;
    name: string;
    history: ExerciseHistory[];
    similarExercises: string[];
  };
  trainerProfile?: {
    experienceLevel: string;
    trainingFrequency?: string;
    sessionDuration?: string;
    goals: string[];
    gymAccess?: string;
    availableEquipment?: string[];
    favoriteExercises?: string[];
    dislikedOrAvoidedExercises?: string[];
    additionalNotes?: string;
  };
}

interface ImportApiResponse {
  type: 'import';
  text: string;
  importData: {
    workouts: ImportData['workouts'];
    needsConfirmation: boolean;
    questions?: string[];
  };
}

interface ProfileApiResponse {
  type: 'profile';
  text: string;
  profileData: {
    experienceLevel: string;
    trainingFrequency?: string;
    sessionDuration?: string;
    goals: string[];
    gymAccess?: string;
    availableEquipment?: string[];
    favoriteExercises?: string[];
    dislikedOrAvoidedExercises?: string[];
    additionalNotes?: string;
  };
}

interface TemplateApiResponse {
  type: 'template';
  text: string;
  templateData: {
    name: string;
    exercises: { name: string; defaultSets: number }[];
  };
}

const TEMPLATE_REVIEW_SUGGESTIONS = 'suggestions:Swap exercise|Try new move|Adjust focus|Looks good';

function ensureSuggestionsLine(content: string, suggestionsLine: string): string {
  const trimmed = content.trim();
  if (!trimmed) return `Here is a draft template. Want any changes?\n${suggestionsLine}`;
  const lines = trimmed.split('\n');
  const lastLine = lines[lines.length - 1]?.trim() || '';
  if (lastLine.startsWith('suggestions:')) return trimmed;
  return `${trimmed}\n${suggestionsLine}`;
}

// ─── Hook Options ───────────────────────────────────────────

export interface AddExerciseResult {
  id: string;
  name: string;
  category: string;
}

interface UseChatOptions {
  /** Enable profile-setup mode for the API */
  profileMode?: boolean;
  /** Exercise context passed via query params (trainer page only) */
  exerciseId?: string | null;
  exerciseName?: string | null;
  /** Enable workout mode — includes add_exercise tool and workout context */
  workoutMode?: boolean;
  /** Current workout exercises (for workout mode context) */
  workoutExercises?: string[];
  /** Callback when AI adds an exercise via tool */
  onAddExercise?: (exercise: AddExerciseResult) => void;
}

// ─── Hook ───────────────────────────────────────────────────

export function useChat(options: UseChatOptions = {}) {
  const {
    profileMode = false,
    exerciseId = null,
    exerciseName = null,
    workoutMode = false,
    workoutExercises = [],
    onAddExercise,
  } = options;

  const supabase = useMemo(() => createClient(), []);
  const unitSystem = useSettingsStore((s) => s.unitSystem);
  const { messages, addMessage, updateMessage, updateImportStatus, updateTemplateStatus } = useChatStore();
  const { profile: trainerProfile, setProfile } = useTrainerProfileStore();

  const [isLoading, setIsLoading] = useState(false);
  const [context, setContext] = useState<WorkoutContext | null>(null);
  const [importingMessageId, setImportingMessageId] = useState<string | null>(null);
  const [savingTemplateId, setSavingTemplateId] = useState<string | null>(null);

  // Keep a stable ref to the latest send function for effects
  const sendRef = useRef<(text?: string) => Promise<void>>(async () => {});

  // ─── Load Context ─────────────────────────────────────────

  useEffect(() => {
    async function loadContext() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const ctx: WorkoutContext = {
        unitSystem,
        recentWorkouts: [],
        personalRecords: [],
        weeklyStats: null,
      };

      // Include trainer profile in context if available
      if (trainerProfile) {
        ctx.trainerProfile = {
          experienceLevel: trainerProfile.experienceLevel,
          trainingFrequency: trainerProfile.trainingFrequency || undefined,
          sessionDuration: trainerProfile.sessionDuration || undefined,
          goals: trainerProfile.goals,
          gymAccess: trainerProfile.gymAccess || undefined,
          availableEquipment: trainerProfile.availableEquipment.length > 0 ? trainerProfile.availableEquipment : undefined,
          favoriteExercises: trainerProfile.favoriteExercises.length > 0 ? trainerProfile.favoriteExercises : undefined,
          dislikedOrAvoidedExercises: trainerProfile.dislikedOrAvoidedExercises.length > 0 ? trainerProfile.dislikedOrAvoidedExercises : undefined,
          additionalNotes: trainerProfile.additionalNotes || undefined,
        };
      }

      const { data: summary } = await supabase.rpc('get_progress_summary', {
        user_uuid: user.id,
      });
      if (summary) {
        ctx.weeklyStats = {
          workouts: (summary as { weekWorkouts: number }).weekWorkouts,
          volume: Math.round(toDisplayWeight((summary as { weekVolume: number }).weekVolume, unitSystem)),
          streak: (summary as { currentStreak: number }).currentStreak,
        };
      }

      const { data: prData } = await supabase.rpc('get_personal_records', { user_uuid: user.id });
      if (prData) {
        ctx.personalRecords = (
          prData as { exercise_name: string; max_weight: number; max_reps: number; estimated_1rm: number }[]
        )
          .slice(0, 10)
          .map((pr) => ({
            exerciseName: pr.exercise_name,
            maxWeight: Math.round(toDisplayWeight(pr.max_weight, unitSystem)),
            maxReps: pr.max_reps,
            estimated1RM: Math.round(toDisplayWeight(pr.estimated_1rm, unitSystem)),
          }));
      }

      const { data: workouts } = await supabase
        .from('workouts')
        .select('name, date, sets(exercise_id, weight, reps, exercises(name))')
        .eq('user_id', user.id)
        .order('date', { ascending: false })
        .limit(10);
      if (workouts) {
        ctx.recentWorkouts = (
          workouts as unknown as {
            name: string | null;
            date: string;
            sets: { exercise_id: string; weight: number | null; reps: number | null; exercises: { name: string } }[];
          }[]
        ).map((w) => {
          const exerciseNames = [...new Set(w.sets.map((s) => s.exercises.name))];
          const totalVolume = w.sets.reduce(
            (sum, s) => sum + Math.round(toDisplayWeight((s.weight || 0) * (s.reps || 0), unitSystem)),
            0
          );
          return {
            name: w.name || 'Workout',
            date: new Date(w.date).toLocaleDateString(),
            exercises: exerciseNames,
            totalSets: w.sets.length,
            totalVolume,
          };
        });
      }

      // Exercise-specific context (when navigating from exercise list)
      if (exerciseId && exerciseName) {
        const { data: historyData } = await supabase
          .from('sets')
          .select('weight, reps, set_number, is_warmup, workouts!inner(id, date, user_id)')
          .eq('exercise_id', exerciseId)
          .eq('workouts.user_id', user.id)
          .eq('is_completed', true)
          .order('workouts(date)', { ascending: false });

        const exerciseHistory: ExerciseHistory[] = [];
        if (historyData) {
          const workoutMap = new Map<string, { date: string; sets: { weight: number; reps: number }[] }>();
          for (const row of historyData) {
            const workout = row.workouts as unknown as { id: string; date: string };
            if (!row.is_warmup) {
              if (!workoutMap.has(workout.id)) {
                workoutMap.set(workout.id, { date: workout.date, sets: [] });
              }
              workoutMap.get(workout.id)!.sets.push({
                weight: Math.round(toDisplayWeight(row.weight || 0, unitSystem)),
                reps: row.reps || 0,
              });
            }
          }
          Array.from(workoutMap.values())
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            .slice(0, 5)
            .forEach((w) => exerciseHistory.push({ date: new Date(w.date).toLocaleDateString(), sets: w.sets }));
        }

        const { data: exerciseInfo } = await supabase
          .from('exercises')
          .select('primary_muscles')
          .eq('id', exerciseId)
          .single();

        let similarExercises: string[] = [];
        if (exerciseInfo && exerciseInfo.primary_muscles && exerciseInfo.primary_muscles.length > 0) {
          const { data: similar } = await supabase
            .from('exercises')
            .select('name')
            .contains('primary_muscles', [exerciseInfo.primary_muscles[0]])
            .neq('id', exerciseId)
            .limit(5);
          if (similar) {
            similarExercises = similar.map((e) => e.name);
          }
        }

        ctx.currentExercise = {
          id: exerciseId,
          name: exerciseName,
          history: exerciseHistory,
          similarExercises,
        };
      }

      setContext(ctx);
    }
    loadContext();
  }, [unitSystem, exerciseId, exerciseName, trainerProfile, supabase]);

  // ─── Send Message ─────────────────────────────────────────

  const send = useCallback(
    async (text?: string) => {
      const messageText = text?.trim();
      if (!messageText || isLoading || !context) return;

      addMessage('user', messageText);
      setIsLoading(true);

      const assistantId = addMessage('assistant', '');

      try {
        const chatMessages = [
          ...messages.map((m) => ({ role: m.role, content: m.content })),
          { role: 'user' as const, content: messageText },
        ];

        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: chatMessages,
            context,
            ...(profileMode && { mode: 'profile-setup' }),
            ...(workoutMode && { mode: 'workout', workoutExercises }),
          }),
        });

        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          throw new Error((err as { error?: string }).error || 'Failed to get response');
        }

        const contentType = response.headers.get('content-type') || '';

        if (contentType.includes('application/json')) {
          const data = await response.json();

          if (data.type === 'profile') {
            const profileResponse = data as ProfileApiResponse;
            const now = new Date().toISOString();
            const newProfile: TrainerProfile = {
              experienceLevel: profileResponse.profileData.experienceLevel,
              trainingFrequency: profileResponse.profileData.trainingFrequency || '',
              sessionDuration: profileResponse.profileData.sessionDuration || '',
              goals: profileResponse.profileData.goals || [],
              gymAccess: profileResponse.profileData.gymAccess || '',
              availableEquipment: profileResponse.profileData.availableEquipment || [],
              favoriteExercises: profileResponse.profileData.favoriteExercises || [],
              dislikedOrAvoidedExercises: profileResponse.profileData.dislikedOrAvoidedExercises || [],
              additionalNotes: profileResponse.profileData.additionalNotes || '',
              createdAt: trainerProfile?.createdAt || now,
              updatedAt: now,
            };
            setProfile(newProfile);

            // Update context with new profile
            setContext((prev) =>
              prev
                ? {
                    ...prev,
                    trainerProfile: {
                      experienceLevel: newProfile.experienceLevel,
                      trainingFrequency: newProfile.trainingFrequency || undefined,
                      sessionDuration: newProfile.sessionDuration || undefined,
                      goals: newProfile.goals,
                      gymAccess: newProfile.gymAccess || undefined,
                      availableEquipment: newProfile.availableEquipment.length > 0 ? newProfile.availableEquipment : undefined,
                      favoriteExercises: newProfile.favoriteExercises.length > 0 ? newProfile.favoriteExercises : undefined,
                      dislikedOrAvoidedExercises:
                        newProfile.dislikedOrAvoidedExercises.length > 0 ? newProfile.dislikedOrAvoidedExercises : undefined,
                      additionalNotes: newProfile.additionalNotes || undefined,
                    },
                  }
                : prev
            );

            // Sync to Supabase
            const {
              data: { user },
            } = await supabase.auth.getUser();
            if (user) {
              const { data: currentProfile } = await supabase
                .from('profiles')
                .select('preferences')
                .eq('id', user.id)
                .single();
              const currentPrefs = (currentProfile?.preferences as Record<string, unknown>) || {};
              await supabase
                .from('profiles')
                .update({ preferences: { ...currentPrefs, trainerProfile: newProfile } })
                .eq('id', user.id);
            }

            updateMessage(assistantId, profileResponse.text);
          } else if (data.type === 'add_exercise') {
            // Workout mode: AI added an exercise
            const exerciseData = data.exerciseData as AddExerciseResult;
            if (exerciseData && onAddExercise) {
              onAddExercise(exerciseData);
            }
            updateMessage(assistantId, data.text || `Added ${exerciseData?.name || 'exercise'}!`);
          } else if (data.type === 'template') {
            const templateResponse = data as TemplateApiResponse;
            const templateData: TemplateData = {
              name: templateResponse.templateData.name,
              exercises: templateResponse.templateData.exercises,
              status: 'pending',
            };
            updateMessage(assistantId, ensureSuggestionsLine(templateResponse.text, TEMPLATE_REVIEW_SUGGESTIONS), undefined, templateData);
          } else {
            // Import response
            const importData: ImportData = {
              workouts: (data as ImportApiResponse).importData.workouts,
              needsConfirmation: (data as ImportApiResponse).importData.needsConfirmation,
              questions: (data as ImportApiResponse).importData.questions,
              status: 'pending',
            };
            updateMessage(assistantId, (data as ImportApiResponse).text, importData);
          }
        } else {
          // Regular streaming response
          const reader = response.body?.getReader();
          const decoder = new TextDecoder();
          let fullText = '';

          if (reader) {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              fullText += decoder.decode(value, { stream: true });
              updateMessage(assistantId, fullText);
            }
          }
        }
      } catch (err) {
        updateMessage(assistantId, err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      } finally {
        setIsLoading(false);
      }
    },
    [isLoading, context, messages, profileMode, workoutMode, workoutExercises, onAddExercise, addMessage, updateMessage, trainerProfile, setProfile, supabase]
  );

  // Keep sendRef up to date
  sendRef.current = send;

  // ─── Import / Template Actions ────────────────────────────

  const confirmImport = useCallback(
    async (messageId: string, importData: ImportData) => {
      setImportingMessageId(messageId);
      try {
        const response = await fetch('/api/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'import',
            workouts: importData.workouts,
            unitSystem: context?.unitSystem || 'imperial',
          }),
        });

        if (!response.ok) throw new Error('Import failed');

        const result = await response.json();
        updateImportStatus(messageId, 'imported');
        addMessage(
          'assistant',
          `Imported ${result.imported} workout${result.imported !== 1 ? 's' : ''} with ${result.summary.totalSets} sets. Check your training log to see them!`
        );
      } catch {
        updateImportStatus(messageId, 'pending');
        addMessage('assistant', 'Sorry, the import failed. Please try again.');
      } finally {
        setImportingMessageId(null);
      }
    },
    [context, addMessage, updateImportStatus]
  );

  const cancelImport = useCallback(
    (messageId: string) => {
      updateImportStatus(messageId, 'cancelled');
      addMessage('assistant', 'Import cancelled. Let me know if you want to try again with different data.');
    },
    [addMessage, updateImportStatus]
  );

  const confirmTemplate = useCallback(
    async (messageId: string, templateData: TemplateData) => {
      setSavingTemplateId(messageId);
      try {
        const response = await fetch('/api/templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: templateData.name,
            exercises: templateData.exercises,
          }),
        });

        if (!response.ok) throw new Error('Failed to save template');

        const result = await response.json();
        updateTemplateStatus(messageId, 'saved');
        const unmatchedMsg =
          result.unmatched && result.unmatched.length > 0
            ? ` (${result.unmatched.length} exercise${result.unmatched.length !== 1 ? 's' : ''} couldn't be matched: ${result.unmatched.join(', ')})`
            : '';
        addMessage(
          'assistant',
          `Saved "${result.name}" with ${result.exerciseCount} exercises! You can find it in your Saved Templates on the home screen.${unmatchedMsg}`
        );
      } catch {
        updateTemplateStatus(messageId, 'pending');
        addMessage('assistant', "Sorry, I couldn't save that template. Please try again.");
      } finally {
        setSavingTemplateId(null);
      }
    },
    [addMessage, updateTemplateStatus]
  );

  const cancelTemplate = useCallback(
    (messageId: string) => {
      updateTemplateStatus(messageId, 'cancelled');
      addMessage('assistant', 'No problem! Let me know if you want me to create a different template.');
    },
    [addMessage, updateTemplateStatus]
  );

  return {
    // State
    messages,
    isLoading,
    context,
    importingMessageId,
    savingTemplateId,

    // Actions
    send,
    sendRef,
    confirmImport,
    cancelImport,
    confirmTemplate,
    cancelTemplate,
  };
}
