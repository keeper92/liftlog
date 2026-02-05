'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useSettingsStore } from '@/stores/settingsStore';
import { useChatStore } from '@/stores/chatStore';
import { toDisplayWeight, weightUnit } from '@/lib/utils/units';

export const dynamic = 'force-dynamic';

const SUGGESTIONS = [
  'Suggest a workout for today',
  'Analyze my progress',
  'Help me break a plateau',
  'What should I focus on?',
];

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
}

export default function TrainerPage() {
  const supabase = createClient();
  const unitSystem = useSettingsStore((s) => s.unitSystem);
  const { messages, addMessage, updateMessage, clearChat } = useChatStore();
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [context, setContext] = useState<WorkoutContext | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load workout context
  useEffect(() => {
    async function loadContext() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const unit = weightUnit(unitSystem);
      const ctx: WorkoutContext = {
        unitSystem,
        recentWorkouts: [],
        personalRecords: [],
        weeklyStats: null,
      };

      // Weekly stats
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

      // Personal records
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

      // Recent workouts
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

      setContext(ctx);
    }
    loadContext();
  }, [unitSystem]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleSend(text?: string) {
    const messageText = text || input.trim();
    if (!messageText || isLoading || !context) return;

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
        body: JSON.stringify({ messages: chatMessages, context }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error || 'Failed to get response');
      }

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

  const showSuggestions = messages.length === 0;

  return (
    <div className="flex flex-col h-[calc(100dvh-64px)]">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-8 pb-4">
        <div>
          <p className="text-sm font-black text-text tracking-tight">rep</p>
          <h1 className="text-3xl font-bold mt-1">Trainer</h1>
        </div>
        {messages.length > 0 && (
          <button
            onClick={clearChat}
            className="text-xs text-text-muted hover:text-text-secondary transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 pb-4">
        {showSuggestions ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
            </div>
            <p className="text-text font-medium mb-1">Your AI trainer</p>
            <p className="text-text-muted text-sm mb-6">
              Ask me anything about your training
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => handleSend(s)}
                  className="px-3.5 py-2 rounded-full bg-surface text-text-secondary text-xs font-medium hover:bg-surface-light transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3 pt-2">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] px-4 py-2.5 text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-primary text-white rounded-2xl rounded-br-md'
                      : 'bg-surface text-text rounded-2xl rounded-bl-md'
                  }`}
                >
                  {msg.content || (
                    <span className="inline-flex gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-text-muted animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-text-muted animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-text-muted animate-bounce" style={{ animationDelay: '300ms' }} />
                    </span>
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-border bg-background px-4 py-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex items-center gap-2"
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask your trainer..."
            disabled={isLoading || !context}
            className="flex-1 min-h-[44px] rounded-full bg-surface px-4 text-sm text-text placeholder:text-text-muted outline-none disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading || !context}
            className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center disabled:opacity-30 transition-opacity"
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
