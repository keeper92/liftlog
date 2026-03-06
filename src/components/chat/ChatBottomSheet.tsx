'use client';

import { useEffect, useRef } from 'react';
import { useChatStore } from '@/stores/chatStore';
import { useChatUIStore } from '@/stores/chatUIStore';
import { useTrainerProfileStore } from '@/stores/trainerProfileStore';
import { useContextualNudges } from '@/hooks/useContextualNudges';
import { useChat } from '@/hooks/useChat';
import { Button } from '@/components/ui/button-shadcn';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import ChatMessages from './ChatMessages';
import ChatInput, { type ChatInputHandle } from './ChatInput';
import ChatSidebar from './ChatSidebar';
import { useState } from 'react';

interface ChatBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ChatBottomSheet({ isOpen, onClose }: ChatBottomSheetProps) {
  const inputRef = useRef<ChatInputHandle>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const intent = useChatUIStore((s) => s.intent);
  const { createConversation, addMessage } = useChatStore();
  const { profile: trainerProfile } = useTrainerProfileStore();
  const nudges = useContextualNudges();

  const [profileMode, setProfileMode] = useState(false);
  const workoutContext = useChatUIStore((s) => s.workoutContext);

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
  } = useChat({
    profileMode,
    workoutMode: !!workoutContext,
    workoutExercises: workoutContext?.exercises,
    onAddExercise: workoutContext?.onAddExercise,
  });

  // Handle intent-based auto-send (e.g., "create-template" from dashboard button)
  const handledIntent = useRef<string | null>(null);
  useEffect(() => {
    if (!intent || !isOpen || !context || isLoading) return;
    if (handledIntent.current === intent) return;

    handledIntent.current = intent;

    if (intent === 'create-template') {
      createConversation();
      // Small delay to ensure conversation is ready
      setTimeout(() => {
        void sendRef.current('Create a workout template');
      }, 50);
    } else if (intent.startsWith('tips:')) {
      const exerciseName = intent.slice(5);
      createConversation();
      setTimeout(() => {
        void sendRef.current(`Give me form tips and coaching cues for ${exerciseName}`);
      }, 50);
    }
  }, [intent, isOpen, context, isLoading, createConversation, sendRef]);

  // Reset intent tracking when sheet closes
  useEffect(() => {
    if (!isOpen) {
      handledIntent.current = null;
    }
  }, [isOpen]);

  // Focus input when opening
  useEffect(() => {
    if (isOpen) {
      const id = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
  }, [isOpen]);

  function startProfileSetup() {
    setProfileMode(true);
    createConversation();
    setTimeout(() => {
      addMessage(
        'assistant',
        "Let's get to know your training style so I can personalize things for you! How would you describe your experience level?\nsuggestions:Beginner|Intermediate|Advanced"
      );
    }, 0);
    inputRef.current?.focus();
  }

  function handleSend(text: string) {
    // Auto-detect profile update requests
    if (
      !profileMode &&
      /update.*profile|edit.*profile|change.*profile|modify.*profile|redo.*profile|set up.*profile|setup.*profile/i.test(text)
    ) {
      startProfileSetup();
      return;
    }
    send(text);
  }

  function handleFileUpload(content: string, filename: string) {
    send(`[file: ${filename}]\n\n${content}`);
  }

  function handleNudgeTap(nudge: { label: string; message: string }) {
    handleSend(nudge.message);
  }

  const showEmptyState = messages.length === 0 && !profileMode;

  return (
    <Sheet open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent
        side="bottom"
        portal={false}
        hideCloseButton
        className="inset-x-0 bottom-0 h-[80dvh] max-h-[80dvh] flex flex-col p-0 rounded-t-2xl"
      >
          {/* Drag handle + header */}
          <div className="flex items-center justify-between border-b border-border/50 px-4 pb-2 pt-3">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setSidebarOpen(true)}
                className="h-9 w-9 rounded-full"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-foreground"
                >
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </svg>
              </Button>
              <span className="text-sm font-medium">AI Trainer</span>
              {profileMode && (
                <span className="text-xs text-primary">Setting up profile...</span>
              )}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-9 w-9 rounded-full"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-muted-foreground"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </Button>
          </div>

          {/* Messages area */}
          <div className="flex-1 overflow-y-auto px-4 pb-4">
            {showEmptyState ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-primary"
                  >
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                </div>
                <p className="text-foreground font-semibold mb-1 text-sm">Your AI Trainer</p>
                <p className="text-muted-foreground text-xs mb-5">
                  Ask me anything about your training
                </p>

                {/* Profile setup banner */}
                {!trainerProfile && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={startProfileSetup}
                    className="mb-5 h-auto w-full justify-start rounded-xl border-primary/20 bg-primary/5 p-3 text-left hover:bg-primary/10"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="text-primary"
                        >
                          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                          <circle cx="12" cy="7" r="4" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-foreground">Set up training profile</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Quick chat to personalize your experience
                        </p>
                      </div>
                    </div>
                  </Button>
                )}

                {/* Nudge chips */}
                <div className="flex flex-wrap justify-center gap-2">
                  {nudges.map((nudge) => (
                    <Button
                      type="button"
                      key={nudge.label}
                      onClick={() => handleNudgeTap(nudge)}
                      variant="outline"
                      size="sm"
                      className="rounded-full"
                    >
                      {nudge.label}
                    </Button>
                  ))}
                </div>
              </div>
            ) : (
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
              />
            )}
          </div>

          {/* Input */}
          <div className="border-t border-border/80 bg-background/95 backdrop-blur px-4 py-3 pb-[calc(12px+env(safe-area-inset-bottom))]">
            <ChatInput
              ref={inputRef}
              onSend={handleSend}
              isLoading={isLoading}
              disabled={!context}
              placeholder={
                profileMode
                  ? 'Tell me about your training...'
                  : 'Ask your trainer or paste workout data...'
              }
              showFileUpload={!profileMode}
              onFileContent={handleFileUpload}
            />
          </div>
      {/* Chat Sidebar (conversation history) */}
      <ChatSidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onConversationChange={() => setProfileMode(false)}
      />
      </SheetContent>
    </Sheet>
  );
}
