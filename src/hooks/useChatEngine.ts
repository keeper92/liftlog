'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useSettingsStore } from '@/stores/settingsStore';
import { useChatStore, type ImportData, type TemplateData } from '@/stores/chatStore';
import { useTrainerProfileStore } from '@/stores/trainerProfileStore';
import { useChatBarStore } from '@/stores/chatBarStore';
import { toDisplayWeight } from '@/lib/utils/units';
import type { TrainerProfile } from '@/lib/types/user';

const MAIN_SUGGESTIONS = [
  'Create a workout template',
  'Analyze my progress',
];

const TEMPLATE_REVIEW_SUGGESTIONS = 'suggestions:Swap exercise|Try new move|Adjust focus|Looks good';

function ensureSuggestionsLine(content: string, suggestionsLine: string): string {
  const trimmed = content.trim();
  if (!trimmed) return `Here is a draft template. Want any changes?\n${suggestionsLine}`;
  const lines = trimmed.split('\n');
  const lastLine = lines[lines.length - 1]?.trim() || '';
  if (lastLine.startsWith('suggestions:')) return trimmed;
  return `${trimmed}\n${suggestionsLine}`;
}

interface ExerciseHistory {
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

export function parseSuggestions(content: string): { text: string; suggestions: string[] } {
  const lines = content.split('\n');
  const lastLine = lines[lines.length - 1]?.trim() || '';
  if (lastLine.startsWith('suggestions:')) {
    const suggestionsStr = lastLine.slice('suggestions:'.length);
    const parsed = suggestionsStr.split('|').map((s) => s.trim()).filter(Boolean);
    if (parsed.length > 0) {
      return {
        text: lines.slice(0, -1).join('\n').trimEnd(),
        suggestions: parsed,
      };
    }
  }
  return { text: content, suggestions: [] };
}

export function useChatEngine() {
  const supabase = useMemo(() => createClient(), []);
  const unitSystem = useSettingsStore((s) => s.unitSystem);
  const { messages, addMessage, updateMessage, updateImportStatus, updateTemplateStatus, createConversation } = useChatStore();
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const { profile: trainerProfile, setProfile } = useTrainerProfileStore();
  const exerciseContext = useChatBarStore((s) => s.exerciseContext);
  const pendingMessage = useChatBarStore((s) => s.pendingMessage);
  const setPendingMessage = useChatBarStore((s) => s.setPendingMessage);

  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [context, setContext] = useState<WorkoutContext | null>(null);
  const [importingMessageId, setImportingMessageId] = useState<string | null>(null);
  const [savingTemplateId, setSavingTemplateId] = useState<string | null>(null);
  const [profileMode, setProfileMode] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const handleSendRef = useRef<(text?: string) => Promise<void>>(async () => {});

  // Exercise suggestions when in exercise context
  const exerciseSuggestions = exerciseContext?.exerciseName ? [
    'Tips for perfect form',
    'Weight and rep advice',
    'Similar exercises',
  ] : null;

  // Initialize exercise context conversation
  const initializedExercise = useRef<string | null>(null);
  useEffect(() => {
    if (exerciseContext?.exerciseName && initializedExercise.current !== exerciseContext.exerciseName) {
      initializedExercise.current = exerciseContext.exerciseName;
      createConversation();
      setTimeout(() => {
        addMessage('assistant', `Let's talk about **${exerciseContext.exerciseName}**! I can help you with:\n\n• **Perfect form** — Tips to perform this exercise safely and effectively\n• **Weight & rep advice** — Personalized recommendations based on your training log\n• **Similar exercises** — Alternatives that target the same muscles\n\nWhat would you like to know?`);
      }, 0);
    }
  }, [exerciseContext, createConversation, addMessage]);

  // Load context from Supabase
  useEffect(() => {
    async function loadContext() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const ctx: WorkoutContext = {
        unitSystem,
        recentWorkouts: [],
        personalRecords: [],
        weeklyStats: null,
      };

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
        ctx.personalRecords = (prData as { exercise_name: string; max_weight: number; max_reps: number; estimated_1rm: number }[])
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
        ctx.recentWorkouts = (workouts as unknown as {
          name: string | null;
          date: string;
          sets: { exercise_id: string; weight: number | null; reps: number | null; exercises: { name: string } }[];
        }[]).map((w) => {
          const exerciseNames = [...new Set(w.sets.map((s) => s.exercises.name))];
          const totalVolume = w.sets.reduce(
            (sum, s) => sum + Math.round(toDisplayWeight((s.weight || 0) * (s.reps || 0), unitSystem)),
            0,
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

      // Load exercise-specific data if exercise context is set
      if (exerciseContext?.exerciseId && exerciseContext?.exerciseName) {
        const { data: historyData } = await supabase
          .from('sets')
          .select('weight, reps, set_number, is_warmup, workouts!inner(id, date, user_id)')
          .eq('exercise_id', exerciseContext.exerciseId)
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
            .forEach((w) => exerciseHistory.push({
              date: new Date(w.date).toLocaleDateString(),
              sets: w.sets,
            }));
        }

        const { data: exerciseInfo } = await supabase
          .from('exercises')
          .select('primary_muscles')
          .eq('id', exerciseContext.exerciseId)
          .single();

        let similarExercises: string[] = [];
        if (exerciseInfo && exerciseInfo.primary_muscles && exerciseInfo.primary_muscles.length > 0) {
          const { data: similar } = await supabase
            .from('exercises')
            .select('name')
            .contains('primary_muscles', [exerciseInfo.primary_muscles[0]])
            .neq('id', exerciseContext.exerciseId)
            .limit(5);
          if (similar) {
            similarExercises = similar.map((e) => e.name);
          }
        }

        ctx.currentExercise = {
          id: exerciseContext.exerciseId,
          name: exerciseContext.exerciseName,
          history: exerciseHistory,
          similarExercises,
        };
      }

      setContext(ctx);
    }
    loadContext();
  }, [unitSystem, exerciseContext, trainerProfile, supabase]);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Reset local state when switching conversations
  useEffect(() => {
    setProfileMode(false);
    setInput('');
  }, [activeConversationId]);

  function startProfileSetup() {
    setProfileMode(true);
    createConversation();
    setTimeout(() => {
      addMessage('assistant', "Let's get to know your training style so I can personalize things for you! How would you describe your experience level?\nsuggestions:Beginner|Intermediate|Advanced");
    }, 0);
    inputRef.current?.focus();
  }

  function handleFileUpload(content: string, filename: string) {
    handleSend(`[file: ${filename}]\n\n${content}`);
  }

  async function handleSend(text?: string) {
    const messageText = text || input.trim();
    if (!messageText || isLoading || !context) return;

    // Auto-detect profile update requests
    if (!profileMode && /update.*profile|edit.*profile|change.*profile|modify.*profile|redo.*profile|set up.*profile|setup.*profile/i.test(messageText)) {
      startProfileSetup();
      return;
    }

    setInput('');
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
          setProfileMode(false);

          setContext((prev) => prev ? {
            ...prev,
            trainerProfile: {
              experienceLevel: newProfile.experienceLevel,
              trainingFrequency: newProfile.trainingFrequency || undefined,
              sessionDuration: newProfile.sessionDuration || undefined,
              goals: newProfile.goals,
              gymAccess: newProfile.gymAccess || undefined,
              availableEquipment: newProfile.availableEquipment.length > 0 ? newProfile.availableEquipment : undefined,
              favoriteExercises: newProfile.favoriteExercises.length > 0 ? newProfile.favoriteExercises : undefined,
              dislikedOrAvoidedExercises: newProfile.dislikedOrAvoidedExercises.length > 0 ? newProfile.dislikedOrAvoidedExercises : undefined,
              additionalNotes: newProfile.additionalNotes || undefined,
            },
          } : prev);

          const { data: { user } } = await supabase.auth.getUser();
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
        } else if (data.type === 'template') {
          const templateResponse = data as TemplateApiResponse;
          const templateData: TemplateData = {
            name: templateResponse.templateData.name,
            exercises: templateResponse.templateData.exercises,
            status: 'pending',
          };
          updateMessage(
            assistantId,
            ensureSuggestionsLine(templateResponse.text, TEMPLATE_REVIEW_SUGGESTIONS),
            undefined,
            templateData,
          );
        } else {
          const importData: ImportData = {
            workouts: (data as ImportApiResponse).importData.workouts,
            needsConfirmation: (data as ImportApiResponse).importData.needsConfirmation,
            questions: (data as ImportApiResponse).importData.questions,
            status: 'pending',
          };
          updateMessage(assistantId, (data as ImportApiResponse).text, importData);
        }
      } else {
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
      updateMessage(
        assistantId,
        err instanceof Error ? err.message : 'Something went wrong. Please try again.'
      );
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  }
  handleSendRef.current = handleSend;

  // Handle pending message (from openWithMessage)
  useEffect(() => {
    if (!pendingMessage || !context || isLoading) return;
    if (messages.length > 0) {
      // Create fresh conversation for pending messages
      createConversation();
    }
    const msg = pendingMessage;
    setPendingMessage(null);
    void handleSendRef.current(msg);
  }, [pendingMessage, context, isLoading, messages.length, createConversation, setPendingMessage]);

  async function handleConfirmImport(messageId: string, importData: ImportData) {
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

      if (!response.ok) {
        throw new Error('Import failed');
      }

      const result = await response.json();
      updateImportStatus(messageId, 'imported');
      addMessage('assistant', `Imported ${result.imported} workout${result.imported !== 1 ? 's' : ''} with ${result.summary.totalSets} sets. Check your training log to see them!`);
    } catch {
      updateImportStatus(messageId, 'pending');
      addMessage('assistant', 'Sorry, the import failed. Please try again.');
    } finally {
      setImportingMessageId(null);
    }
  }

  function handleCancelImport(messageId: string) {
    updateImportStatus(messageId, 'cancelled');
    addMessage('assistant', 'Import cancelled. Let me know if you want to try again with different data.');
  }

  async function handleConfirmTemplate(messageId: string, templateData: TemplateData) {
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

      if (!response.ok) {
        throw new Error('Failed to save template');
      }

      const result = await response.json();
      updateTemplateStatus(messageId, 'saved');
      const unmatchedMsg = result.unmatched && result.unmatched.length > 0
        ? ` (${result.unmatched.length} exercise${result.unmatched.length !== 1 ? 's' : ''} couldn't be matched: ${result.unmatched.join(', ')})`
        : '';
      addMessage('assistant', `Saved "${result.name}" with ${result.exerciseCount} exercises! You can find it in your Saved Templates on the home screen.${unmatchedMsg}`);
    } catch {
      updateTemplateStatus(messageId, 'pending');
      addMessage('assistant', 'Sorry, I couldn\'t save that template. Please try again.');
    } finally {
      setSavingTemplateId(null);
    }
  }

  function handleCancelTemplate(messageId: string) {
    updateTemplateStatus(messageId, 'cancelled');
    addMessage('assistant', 'No problem! Let me know if you want me to create a different template.');
  }

  // Derived state
  const hasUserMessage = messages.some((m) => m.role === 'user');
  const showExerciseSuggestions = !!exerciseContext?.exerciseName && !hasUserMessage && messages.length > 0;
  const showDefaultSuggestions = messages.length === 0 && !profileMode;
  const profileSuggestion = trainerProfile ? ['Modify your training profile'] : [];
  const contextualMainSuggestions = [...profileSuggestion, ...MAIN_SUGGESTIONS];
  const suggestions = exerciseSuggestions || contextualMainSuggestions;

  const lastMessage = messages[messages.length - 1];
  const lastMessageSuggestions = !isLoading && lastMessage?.role === 'assistant' && lastMessage.content
    ? parseSuggestions(lastMessage.content).suggestions
    : [];

  return {
    // State
    input,
    setInput,
    isLoading,
    context,
    profileMode,
    sidebarOpen,
    setSidebarOpen,
    messages,
    importingMessageId,
    savingTemplateId,

    // Refs
    inputRef,
    messagesEndRef,

    // Derived
    exerciseSuggestions,
    showExerciseSuggestions,
    showDefaultSuggestions,
    contextualMainSuggestions,
    suggestions,
    lastMessageSuggestions,
    exerciseContext,
    trainerProfile,

    // Actions
    handleSend,
    handleFileUpload,
    handleConfirmImport,
    handleCancelImport,
    handleConfirmTemplate,
    handleCancelTemplate,
    startProfileSetup,
    parseSuggestions,
  };
}
