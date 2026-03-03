'use client';

import { useChatBarStore } from '@/stores/chatBarStore';
import ChatMessages from './ChatMessages';
import ChatEmptyState from './ChatEmptyState';
import type { useChatEngine } from '@/hooks/useChatEngine';

type ChatEngineReturn = ReturnType<typeof useChatEngine>;

interface ChatPanelProps {
  engine: ChatEngineReturn;
}

export default function ChatPanel({ engine }: ChatPanelProps) {
  const { isExpanded, collapse } = useChatBarStore();

  return (
    <div
      className={`fixed inset-x-0 bottom-[calc(60px+86px+env(safe-area-inset-bottom,0px))] top-0 z-[55] transition-transform duration-300 ease-out ${
        isExpanded ? 'translate-y-0' : 'translate-y-full pointer-events-none'
      }`}
    >
      <div className="mx-auto flex h-full max-w-[430px] flex-col bg-background">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/80 px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => engine.setSidebarOpen(true)}
              className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
            <span className="text-sm font-medium text-foreground">AI Trainer</span>
          </div>
          <div className="flex items-center gap-2">
            {engine.exerciseContext?.exerciseName && (
              <span className="text-xs text-muted-foreground">
                {engine.exerciseContext.exerciseName}
              </span>
            )}
            {engine.profileMode && (
              <span className="text-xs text-primary">Profile setup</span>
            )}
            <button
              type="button"
              onClick={collapse}
              className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
          </div>
        </div>

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto px-5 pb-4">
          {engine.showDefaultSuggestions ? (
            <ChatEmptyState
              suggestions={engine.suggestions}
              onSuggestionSelect={(s) => engine.handleSend(s)}
              onStartProfileSetup={engine.startProfileSetup}
              trainerProfile={engine.trainerProfile}
            />
          ) : (
            <ChatMessages
              messages={engine.messages}
              isLoading={engine.isLoading}
              importingMessageId={engine.importingMessageId}
              savingTemplateId={engine.savingTemplateId}
              showExerciseSuggestions={engine.showExerciseSuggestions}
              exerciseSuggestions={engine.exerciseSuggestions}
              lastMessageSuggestions={engine.lastMessageSuggestions}
              contextualMainSuggestions={engine.contextualMainSuggestions}
              profileMode={engine.profileMode}
              onSend={(s) => engine.handleSend(s)}
              onConfirmImport={engine.handleConfirmImport}
              onCancelImport={engine.handleCancelImport}
              onConfirmTemplate={engine.handleConfirmTemplate}
              onCancelTemplate={engine.handleCancelTemplate}
              messagesEndRef={engine.messagesEndRef}
            />
          )}
        </div>
      </div>
    </div>
  );
}
