'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useChatStore } from '@/stores/chatStore';
import { useTrainerProfileStore } from '@/stores/trainerProfileStore';
import { ChatMessages, ChatInput, ChatSidebar, type ChatInputHandle } from '@/components/chat';
import { Button } from '@/components/ui/button-shadcn';
import { useChat } from '@/hooks/useChat';

export const dynamic = 'force-dynamic';

const MAIN_SUGGESTIONS = [
  'Create a workout template',
  'Analyze my progress',
];

export default function TrainerPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-dvh text-muted-foreground">Loading...</div>}>
      <TrainerContent />
    </Suspense>
  );
}

function TrainerContent() {
  const searchParams = useSearchParams();
  const exerciseId = searchParams.get('exerciseId');
  const exerciseName = searchParams.get('exerciseName');
  const intent = searchParams.get('intent');

  const { createConversation, addMessage } = useChatStore();
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const { profile: trainerProfile } = useTrainerProfileStore();

  const [profileMode, setProfileMode] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const inputRef = useRef<ChatInputHandle>(null);
  const initializedIntent = useRef<string | null>(null);
  const shouldAutoSendTemplateIntent = useRef(false);
  const initializedExercise = useRef<string | null>(null);

  const {
    messages,
    isLoading,
    context,
    importingMessageId,
    savingTemplateId,
    send,
    sendRef,
    confirmImport,
    cancelImport,
    confirmTemplate,
    cancelTemplate,
  } = useChat({ profileMode, exerciseId, exerciseName });

  // Exercise-specific initialization
  useEffect(() => {
    if (exerciseName && initializedExercise.current !== exerciseName) {
      initializedExercise.current = exerciseName;
      createConversation();
      setTimeout(() => {
        addMessage('assistant', `Let's talk about **${exerciseName}**! I can help you with:\n\n• **Perfect form** — Tips to perform this exercise safely and effectively\n• **Weight & rep advice** — Personalized recommendations based on your training log\n• **Similar exercises** — Alternatives that target the same muscles\n\nWhat would you like to know?`);
      }, 0);
    }
  }, [exerciseName, createConversation, addMessage]);

  // Template intent initialization
  useEffect(() => {
    if (intent !== 'create-template') return;
    if (initializedIntent.current === intent) return;

    initializedIntent.current = intent;
    shouldAutoSendTemplateIntent.current = true;
    createConversation();
    const frameId = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [intent, createConversation]);

  // Auto-send template intent when context is ready
  useEffect(() => {
    if (intent !== 'create-template') return;
    if (!shouldAutoSendTemplateIntent.current) return;
    if (!context || isLoading) return;
    if (messages.length > 0) return;

    shouldAutoSendTemplateIntent.current = false;
    void sendRef.current('Create a workout template');
  }, [intent, context, isLoading, messages.length, sendRef]);

  // Reset local state when switching conversations
  useEffect(() => {
    setProfileMode(false);
  }, [activeConversationId]);

  function startProfileSetup() {
    setProfileMode(true);
    createConversation();
    setTimeout(() => {
      addMessage('assistant', "Let's get to know your training style so I can personalize things for you! How would you describe your experience level?\nsuggestions:Beginner|Intermediate|Advanced");
    }, 0);
    inputRef.current?.focus();
  }

  function handleSend(text: string) {
    // Auto-detect profile update requests
    if (!profileMode && /update.*profile|edit.*profile|change.*profile|modify.*profile|redo.*profile|set up.*profile|setup.*profile/i.test(text)) {
      startProfileSetup();
      return;
    }
    send(text);
  }

  function handleFileUpload(content: string, filename: string) {
    send(`[file: ${filename}]\n\n${content}`);
  }

  const exerciseSuggestions = exerciseName ? [
    'Tips for perfect form',
    'Weight and rep advice',
    'Similar exercises',
  ] : null;

  const hasUserMessage = messages.some((m) => m.role === 'user');
  const showExerciseSuggestions = exerciseName && !hasUserMessage && messages.length > 0;
  const showDefaultSuggestions = messages.length === 0 && !profileMode;
  const profileSuggestion = trainerProfile ? ['Modify your training profile'] : [];
  const contextualMainSuggestions = [...profileSuggestion, ...MAIN_SUGGESTIONS];
  const suggestions = exerciseSuggestions || contextualMainSuggestions;

  return (
    <div className="flex flex-col h-[calc(100dvh-64px)] relative">
      {/* Header icons */}
      <div className="px-5 pt-4 pb-1 flex items-center justify-between">
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => setSidebarOpen(true)}
          className="h-10 w-10 rounded-full"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-foreground">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </Button>
        <div className="text-right">
          {exerciseName && (
            <p className="text-xs text-muted-foreground">Helping with: {exerciseName}</p>
          )}
          {profileMode && (
            <p className="text-xs text-primary">Setting up your profile...</p>
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
            <p className="text-foreground font-semibold mb-1">Your AI Trainer</p>
            <p className="text-muted-foreground text-sm mb-6">
              Ask me anything about your training
            </p>

            {/* Profile setup banner */}
            {!trainerProfile && (
              <Button
                type="button"
                variant="outline"
                onClick={startProfileSetup}
                className="mb-6 h-auto w-full max-w-sm justify-start rounded-xl border-primary/20 bg-primary/5 p-4 text-left hover:bg-primary/10"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">Set up your training profile</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Quick chat so I can personalize your experience</p>
                  </div>
                </div>
              </Button>
            )}

            <div className="flex flex-wrap justify-center gap-2">
              {suggestions.map((s) => (
                <Button
                  type="button"
                  key={s}
                  onClick={() => handleSend(s)}
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                >
                  {s}
                </Button>
              ))}
            </div>
          </div>
        ) : (
          <>
            <ChatMessages
              messages={messages}
              isLoading={isLoading}
              onSend={handleSend}
              onConfirmImport={confirmImport}
              onCancelImport={cancelImport}
              onConfirmTemplate={confirmTemplate}
              onCancelTemplate={cancelTemplate}
              importingMessageId={importingMessageId}
              savingTemplateId={savingTemplateId}
              quickActions={contextualMainSuggestions}
              showQuickActions={!profileMode && !showExerciseSuggestions}
            />
            {showExerciseSuggestions && exerciseSuggestions && (
              <div className="flex flex-wrap gap-2 mt-4">
                {exerciseSuggestions.map((s) => (
                  <Button
                    type="button"
                    key={s}
                    onClick={() => handleSend(s)}
                    variant="outline"
                    size="sm"
                    className="rounded-full"
                  >
                    {s}
                  </Button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-border/80 bg-background/95 backdrop-blur px-4 py-3">
        <ChatInput
          ref={inputRef}
          onSend={handleSend}
          isLoading={isLoading}
          disabled={!context}
          placeholder={profileMode ? 'Tell me about your training...' : 'Ask your trainer or paste workout data...'}
          showFileUpload={!profileMode}
          onFileContent={handleFileUpload}
        />
      </div>

      {/* Chat Sidebar */}
      <ChatSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
    </div>
  );
}
