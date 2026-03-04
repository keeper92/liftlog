'use client';

import { useRef, useState } from 'react';
import { useChat, type AddExerciseResult } from '@/hooks/useChat';
import { useChatStore } from '@/stores/chatStore';
import { Button } from '@/components/ui/button-shadcn';
import ChatMessages from '@/components/chat/ChatMessages';
import ChatInput, { type ChatInputHandle } from '@/components/chat/ChatInput';

interface WorkoutChatPanelProps {
  /** Called when the AI adds an exercise via the add_exercise tool */
  onAddExercise: (exercise: AddExerciseResult) => void;
  /** Current exercise names in the workout (for context) */
  workoutExercises: string[];
}

export default function WorkoutChatPanel({ onAddExercise, workoutExercises }: WorkoutChatPanelProps) {
  const inputRef = useRef<ChatInputHandle>(null);
  const [expanded, setExpanded] = useState(false);
  const { createConversation } = useChatStore();

  const {
    messages,
    isLoading,
    context,
    importingMessageId,
    savingTemplateId,
    send,
    confirmImport,
    cancelImport,
    confirmTemplate,
    cancelTemplate,
  } = useChat({
    workoutMode: true,
    workoutExercises,
    onAddExercise,
  });

  function handleSend(text: string) {
    // Auto-expand when sending a message
    if (!expanded) setExpanded(true);

    // Create a new conversation for workout if none exists
    if (messages.length === 0) {
      createConversation();
    }

    send(text);
  }

  return (
    <div className="flex flex-col">
      {/* Expanded messages area */}
      {expanded && messages.length > 0 && (
        <div className="max-h-48 overflow-y-auto border-t border-border/50 bg-background/95 px-4 pb-2">
          <div className="flex items-center justify-between py-2">
            <span className="text-xs text-muted-foreground">AI Trainer</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded(false)}
              className="h-auto px-2 py-0.5 text-xs text-muted-foreground"
            >
              Collapse
            </Button>
          </div>
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
        </div>
      )}

      {/* Collapsed state: show last message preview */}
      {!expanded && messages.length > 0 && (
        <Button
          variant="ghost"
          onClick={() => setExpanded(true)}
          className="h-auto w-full justify-start rounded-none border-t border-border/50 bg-background/95 px-4 py-2 text-left"
        >
          <p className="truncate text-xs text-muted-foreground">
            {messages[messages.length - 1]?.content?.split('\n')[0] || 'Tap to see messages'}
          </p>
        </Button>
      )}

      {/* Input bar */}
      <div className="border-t border-border/80 bg-background/95 backdrop-blur px-4 py-2">
        <ChatInput
          ref={inputRef}
          onSend={handleSend}
          isLoading={isLoading}
          disabled={!context}
          placeholder="Add an exercise or ask for help..."
          compact
        />
      </div>
    </div>
  );
}
