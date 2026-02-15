'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useSettingsStore } from '@/stores/settingsStore';
import { useChatStore, type ImportData, type TemplateData } from '@/stores/chatStore';
import { useTrainerProfileStore } from '@/stores/trainerProfileStore';
import { toDisplayWeight } from '@/lib/utils/units';
import { FileUploadButton } from '@/components/chat';
import type { TrainerProfile } from '@/lib/types/user';

export const dynamic = 'force-dynamic';

const DEFAULT_SUGGESTIONS = [
  'Create a workout template',
  'Suggest a workout for today',
  'Analyze my progress',
  'Import workout data',
];

interface ExerciseHistory {
  date: string;
  sets: { weight: number; reps: number }[];
}

interface WorkoutContext {
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

export default function TrainerPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-dvh text-text-muted">Loading...</div>}>
      <TrainerContent />
    </Suspense>
  );
}

function TrainerContent() {
  const searchParams = useSearchParams();
  const exerciseId = searchParams.get('exerciseId');
  const exerciseName = searchParams.get('exerciseName');

  const supabase = createClient();
  const unitSystem = useSettingsStore((s) => s.unitSystem);
  const { messages, addMessage, updateMessage, updateImportStatus, updateTemplateStatus, clearChat } = useChatStore();
  const { profile: trainerProfile, setProfile } = useTrainerProfileStore();
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [context, setContext] = useState<WorkoutContext | null>(null);
  const [importingMessageId, setImportingMessageId] = useState<string | null>(null);
  const [savingTemplateId, setSavingTemplateId] = useState<string | null>(null);
  const [profileMode, setProfileMode] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const exerciseSuggestions = exerciseName ? [
    'Tips for perfect form',
    'Weight and rep advice',
    'Similar exercises',
  ] : null;

  const initializedExercise = useRef<string | null>(null);
  useEffect(() => {
    if (exerciseName && initializedExercise.current !== exerciseName) {
      initializedExercise.current = exerciseName;
      clearChat();
      setTimeout(() => {
        addMessage('assistant', `Let's talk about **${exerciseName}**! I can help you with:\n\n• **Perfect form** — Tips to perform this exercise safely and effectively\n• **Weight & rep advice** — Personalized recommendations based on your history\n• **Similar exercises** — Alternatives that target the same muscles\n\nWhat would you like to know?`);
      }, 0);
    }
  }, [exerciseName, clearChat, addMessage]);

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
            .forEach((w) => exerciseHistory.push({
              date: new Date(w.date).toLocaleDateString(),
              sets: w.sets,
            }));
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
  }, [unitSystem, exerciseId, exerciseName, trainerProfile]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function startProfileSetup() {
    setProfileMode(true);
    clearChat();
    setTimeout(() => {
      addMessage('assistant', "Let's get to know your training style! I'll ask you a few quick questions so I can give you better, more personalized advice.\n\nFirst off — how long have you been lifting? Would you consider yourself a beginner, intermediate, or advanced lifter?");
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
    if (!profileMode && /update.*profile|edit.*profile|change.*profile|redo.*profile|set up.*profile|setup.*profile/i.test(messageText)) {
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
          // Profile setup complete — save the profile
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

          // Update context with new profile
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

          // Sync to Supabase
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
          // Template response
          const templateResponse = data as TemplateApiResponse;
          const templateData: TemplateData = {
            name: templateResponse.templateData.name,
            exercises: templateResponse.templateData.exercises,
            status: 'pending',
          };
          updateMessage(assistantId, templateResponse.text, undefined, templateData);
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
      updateMessage(
        assistantId,
        err instanceof Error ? err.message : 'Something went wrong. Please try again.'
      );
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  }

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
      addMessage('assistant', `Imported ${result.imported} workout${result.imported !== 1 ? 's' : ''} with ${result.summary.totalSets} sets. Check your history to see them!`);
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

  const hasUserMessage = messages.some((m) => m.role === 'user');
  const showExerciseSuggestions = exerciseName && !hasUserMessage && messages.length > 0;
  const showDefaultSuggestions = messages.length === 0 && !profileMode;
  const suggestions = exerciseSuggestions || DEFAULT_SUGGESTIONS;

  return (
    <div className="flex flex-col h-[calc(100dvh-64px)] relative">
      {/* Header */}
      <div className="bg-surface px-5 pt-4 pb-3 border-b border-border">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Trainer</h1>
            {exerciseName && (
              <p className="text-xs text-text-muted mt-0.5">Helping with: {exerciseName}</p>
            )}
            {profileMode && (
              <p className="text-xs text-primary mt-0.5">Setting up your profile...</p>
            )}
          </div>
          {messages.length > 0 && (
            <button
              onClick={() => {
                clearChat();
                setProfileMode(false);
              }}
              className="text-xs text-text-muted hover:text-text-secondary transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 pb-4">
        {showDefaultSuggestions ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <p className="text-text font-semibold mb-1">Your AI Trainer</p>
            <p className="text-text-muted text-sm mb-6">
              Ask me anything about your training
            </p>

            {/* Profile setup banner — shown when no profile exists */}
            {!trainerProfile && (
              <button
                onClick={startProfileSetup}
                className="w-full max-w-sm mb-6 p-4 rounded-2xl bg-primary/5 border border-primary/20 text-left hover:bg-primary/10 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-text">Set up your training profile</p>
                    <p className="text-xs text-text-muted mt-0.5">Quick chat so I can personalize your experience</p>
                  </div>
                </div>
              </button>
            )}

            <div className="flex flex-wrap justify-center gap-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => handleSend(s)}
                  className="px-4 py-2.5 rounded-full bg-surface text-text-secondary text-xs font-medium card-shadow hover:card-shadow-md transition-all"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3 pt-2">
            {messages.map((msg) => (
              <div key={msg.id}>
                <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[85%] px-4 py-2.5 text-sm leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-primary text-white rounded-2xl rounded-br-md shadow-sm'
                        : 'bg-surface text-text rounded-2xl rounded-bl-md card-shadow'
                    }`}
                  >
                    {msg.content ? (
                      <span
                        dangerouslySetInnerHTML={{
                          __html: msg.content
                            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                            .replace(/\n/g, '<br />')
                        }}
                      />
                    ) : (
                      <span className="inline-flex gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-text-muted animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-text-muted animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-text-muted animate-bounce" style={{ animationDelay: '300ms' }} />
                      </span>
                    )}
                  </div>
                </div>

                {/* Import Preview */}
                {msg.importData && msg.importData.status === 'pending' && (
                  <div className="mt-3 ml-0 max-w-[90%]">
                    <div className="bg-surface-light border border-border rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-primary">
                          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                          <polyline points="7 10 12 15 17 10" />
                          <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                        <span className="text-sm font-medium">Import Preview</span>
                      </div>

                      <div className="text-xs text-text-muted mb-3">
                        {msg.importData.workouts.length} workout{msg.importData.workouts.length !== 1 ? 's' : ''} to import
                      </div>

                      <div className="space-y-2 mb-4">
                        {msg.importData.workouts.slice(0, 3).map((workout, i) => (
                          <div key={i} className="text-xs bg-surface rounded-lg p-2">
                            <div className="font-medium text-text">
                              {workout.name || new Date(workout.date).toLocaleDateString()}
                            </div>
                            <div className="text-text-muted mt-1">
                              {workout.exercises.map((ex) => ex.name).join(', ')}
                            </div>
                          </div>
                        ))}
                        {msg.importData.workouts.length > 3 && (
                          <div className="text-xs text-text-muted">
                            +{msg.importData.workouts.length - 3} more...
                          </div>
                        )}
                      </div>

                      {msg.importData.questions && msg.importData.questions.length > 0 && (
                        <div className="bg-warning/10 border border-warning/30 rounded-lg p-2 mb-4">
                          <div className="text-xs text-warning font-medium mb-1">Questions:</div>
                          {msg.importData.questions.map((q, i) => (
                            <div key={i} className="text-xs text-text-secondary">• {q}</div>
                          ))}
                        </div>
                      )}

                      <div className="flex gap-2">
                        <button
                          onClick={() => handleConfirmImport(msg.id, msg.importData!)}
                          disabled={importingMessageId === msg.id}
                          className="flex-1 bg-primary text-white text-xs font-medium py-2 rounded-lg hover:bg-primary-light disabled:opacity-50 transition-colors"
                        >
                          {importingMessageId === msg.id ? 'Importing...' : 'Confirm Import'}
                        </button>
                        <button
                          onClick={() => handleCancelImport(msg.id)}
                          disabled={importingMessageId === msg.id}
                          className="flex-1 bg-surface text-text-secondary text-xs font-medium py-2 rounded-lg hover:bg-surface-light disabled:opacity-50 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Import Status */}
                {msg.importData && msg.importData.status === 'imported' && (
                  <div className="mt-2 ml-0">
                    <span className="inline-flex items-center gap-1 text-xs text-success bg-success/10 px-2 py-1 rounded-full">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      Imported
                    </span>
                  </div>
                )}

                {msg.importData && msg.importData.status === 'cancelled' && (
                  <div className="mt-2 ml-0">
                    <span className="inline-flex items-center gap-1 text-xs text-text-muted bg-surface px-2 py-1 rounded-full">
                      Cancelled
                    </span>
                  </div>
                )}

                {/* Template Preview */}
                {msg.templateData && msg.templateData.status === 'pending' && (
                  <div className="mt-3 ml-0 max-w-[90%]">
                    <div className="bg-surface-light border border-border rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-primary">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                          <line x1="12" y1="18" x2="12" y2="12" />
                          <line x1="9" y1="15" x2="15" y2="15" />
                        </svg>
                        <span className="text-sm font-medium">{msg.templateData.name}</span>
                      </div>

                      <div className="text-xs text-text-muted mb-3">
                        {msg.templateData.exercises.length} exercise{msg.templateData.exercises.length !== 1 ? 's' : ''}
                      </div>

                      <div className="space-y-1.5 mb-4">
                        {msg.templateData.exercises.map((exercise, i) => (
                          <div key={i} className="text-xs bg-surface rounded-lg px-3 py-2 flex items-center justify-between">
                            <span className="font-medium text-text">{exercise.name}</span>
                            <span className="text-text-muted">{exercise.defaultSets} sets</span>
                          </div>
                        ))}
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={() => handleConfirmTemplate(msg.id, msg.templateData!)}
                          disabled={savingTemplateId === msg.id}
                          className="flex-1 bg-primary text-white text-xs font-medium py-2 rounded-lg hover:bg-primary-light disabled:opacity-50 transition-colors"
                        >
                          {savingTemplateId === msg.id ? 'Saving...' : 'Save Template'}
                        </button>
                        <button
                          onClick={() => handleCancelTemplate(msg.id)}
                          disabled={savingTemplateId === msg.id}
                          className="flex-1 bg-surface text-text-secondary text-xs font-medium py-2 rounded-lg hover:bg-surface-light disabled:opacity-50 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Template Saved Status */}
                {msg.templateData && msg.templateData.status === 'saved' && (
                  <div className="mt-2 ml-0">
                    <span className="inline-flex items-center gap-1 text-xs text-success bg-success/10 px-2 py-1 rounded-full">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      Template Saved
                    </span>
                  </div>
                )}

                {/* Template Cancelled Status */}
                {msg.templateData && msg.templateData.status === 'cancelled' && (
                  <div className="mt-2 ml-0">
                    <span className="inline-flex items-center gap-1 text-xs text-text-muted bg-surface px-2 py-1 rounded-full">
                      Cancelled
                    </span>
                  </div>
                )}
              </div>
            ))}
            {showExerciseSuggestions && exerciseSuggestions && (
              <div className="flex flex-wrap gap-2 mt-4">
                {exerciseSuggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => handleSend(s)}
                    className="px-4 py-2.5 rounded-full bg-surface text-text-secondary text-xs font-medium card-shadow hover:card-shadow-md transition-all"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-border bg-surface px-4 py-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex items-center gap-2"
        >
          {!profileMode && (
            <FileUploadButton
              onFileContent={handleFileUpload}
              disabled={isLoading || !context}
            />
          )}
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={profileMode ? 'Tell me about your training...' : 'Ask your trainer or paste workout data...'}
            disabled={isLoading || !context}
            className="flex-1 min-h-[44px] rounded-full bg-surface-light px-4 text-sm text-text placeholder:text-text-muted outline-none disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading || !context}
            className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center disabled:opacity-30 transition-opacity shadow-sm"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="19" x2="12" y2="5" />
              <polyline points="5 12 12 5 19 12" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
}
