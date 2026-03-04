'use client';

import { useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button-shadcn';
import type { ChatMessage, ImportData, TemplateData } from '@/stores/chatStore';

/** Parse "suggestions:A|B|C" from the last line of assistant content */
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

interface ChatMessagesProps {
  messages: ChatMessage[];
  isLoading: boolean;
  onSend: (text: string) => void;
  onConfirmImport: (messageId: string, importData: ImportData) => void;
  onCancelImport: (messageId: string) => void;
  onConfirmTemplate: (messageId: string, templateData: TemplateData) => void;
  onCancelTemplate: (messageId: string) => void;
  importingMessageId: string | null;
  savingTemplateId: string | null;
  /** Quick-action chips shown below messages (e.g., "Create a workout template") */
  quickActions?: string[];
  /** Whether to show quick actions section */
  showQuickActions?: boolean;
}

export default function ChatMessages({
  messages,
  isLoading,
  onSend,
  onConfirmImport,
  onCancelImport,
  onConfirmTemplate,
  onCancelTemplate,
  importingMessageId,
  savingTemplateId,
  quickActions = [],
  showQuickActions = false,
}: ChatMessagesProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Inline suggestions from the last assistant message
  const lastMessage = messages[messages.length - 1];
  const lastMessageSuggestions =
    !isLoading && lastMessage?.role === 'assistant' && lastMessage.content
      ? parseSuggestions(lastMessage.content).suggestions
      : [];

  return (
    <div className="space-y-3 pt-2">
      {messages.map((msg) => (
        <div key={msg.id}>
          {/* Message bubble */}
          <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] px-4 py-2.5 text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'rounded-lg rounded-br-sm bg-primary text-primary-foreground shadow-sm'
                  : 'rounded-lg rounded-bl-sm border border-border/70 bg-card text-foreground'
              }`}
            >
              {msg.content ? (
                <span
                  dangerouslySetInnerHTML={{
                    __html: parseSuggestions(msg.content)
                      .text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                      .replace(/\n/g, '<br />'),
                  }}
                />
              ) : (
                <span className="inline-flex gap-1">
                  <span
                    className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce"
                    style={{ animationDelay: '0ms' }}
                  />
                  <span
                    className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce"
                    style={{ animationDelay: '150ms' }}
                  />
                  <span
                    className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce"
                    style={{ animationDelay: '300ms' }}
                  />
                </span>
              )}
            </div>
          </div>

          {/* Import Preview Card */}
          {msg.importData && msg.importData.status === 'pending' && (
            <div className="mt-3 ml-0 max-w-[90%]">
              <div className="bg-card border border-border/70 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-primary">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  <span className="text-sm font-medium">Import Preview</span>
                </div>
                <div className="text-xs text-muted-foreground mb-3">
                  {msg.importData.workouts.length} workout{msg.importData.workouts.length !== 1 ? 's' : ''} to import
                </div>
                <div className="space-y-2 mb-4">
                  {msg.importData.workouts.slice(0, 3).map((workout, i) => (
                    <div key={i} className="text-xs bg-card rounded-lg p-2">
                      <div className="font-medium text-foreground">
                        {workout.name || new Date(workout.date).toLocaleDateString()}
                      </div>
                      <div className="text-muted-foreground mt-1">
                        {workout.exercises.map((ex) => ex.name).join(', ')}
                      </div>
                    </div>
                  ))}
                  {msg.importData.workouts.length > 3 && (
                    <div className="text-xs text-muted-foreground">
                      +{msg.importData.workouts.length - 3} more...
                    </div>
                  )}
                </div>
                {msg.importData.questions && msg.importData.questions.length > 0 && (
                  <div className="mb-4 rounded-lg border border-border bg-muted/40 p-2">
                    <div className="mb-1 text-xs font-medium text-foreground">Questions:</div>
                    {msg.importData.questions.map((q, i) => (
                      <div key={i} className="text-xs text-muted-foreground">
                        &bull; {q}
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <Button
                    type="button"
                    onClick={() => onConfirmImport(msg.id, msg.importData!)}
                    disabled={importingMessageId === msg.id}
                    className="flex-1"
                  >
                    {importingMessageId === msg.id ? 'Importing...' : 'Confirm Import'}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => onCancelImport(msg.id)}
                    disabled={importingMessageId === msg.id}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Import Status Badges */}
          {msg.importData && msg.importData.status === 'imported' && (
            <div className="mt-2 ml-0">
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-xs text-primary">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Imported
              </span>
            </div>
          )}
          {msg.importData && msg.importData.status === 'cancelled' && (
            <div className="mt-2 ml-0">
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-card px-2 py-1 rounded-full">
                Cancelled
              </span>
            </div>
          )}

          {/* Template Preview Card */}
          {msg.templateData && msg.templateData.status === 'pending' && (
            <div className="mt-3 ml-0 max-w-[90%]">
              <div className="bg-card border border-border/70 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-primary">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="12" y1="18" x2="12" y2="12" />
                    <line x1="9" y1="15" x2="15" y2="15" />
                  </svg>
                  <span className="text-sm font-medium">{msg.templateData.name}</span>
                </div>
                <div className="text-xs text-muted-foreground mb-3">
                  {msg.templateData.exercises.length} exercise{msg.templateData.exercises.length !== 1 ? 's' : ''}
                </div>
                <div className="space-y-1.5 mb-4">
                  {msg.templateData.exercises.map((exercise, i) => (
                    <div key={i} className="text-xs bg-card rounded-lg px-3 py-2 flex items-center justify-between">
                      <span className="font-medium text-foreground">{exercise.name}</span>
                      <span className="text-muted-foreground">{exercise.defaultSets} sets</span>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    onClick={() => onConfirmTemplate(msg.id, msg.templateData!)}
                    disabled={savingTemplateId === msg.id}
                    className="flex-1"
                  >
                    {savingTemplateId === msg.id ? 'Saving...' : 'Save Template'}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => onCancelTemplate(msg.id)}
                    disabled={savingTemplateId === msg.id}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Template Status Badges */}
          {msg.templateData && msg.templateData.status === 'saved' && (
            <div className="mt-2 ml-0">
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-xs text-primary">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Template Saved
              </span>
            </div>
          )}
          {msg.templateData && msg.templateData.status === 'cancelled' && (
            <div className="mt-2 ml-0">
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-card px-2 py-1 rounded-full">
                Cancelled
              </span>
            </div>
          )}
        </div>
      ))}

      {/* Inline suggestions from last assistant message */}
      {lastMessageSuggestions.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3">
          {lastMessageSuggestions.map((s) => (
            <Button
              type="button"
              key={s}
              onClick={() => onSend(s)}
              variant="outline"
              size="sm"
              className="rounded-full"
            >
              {s}
            </Button>
          ))}
        </div>
      )}

      {/* Quick actions (always shown below messages when applicable) */}
      {showQuickActions && quickActions.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-sm font-medium text-muted-foreground">Quick actions</p>
          <div className="flex flex-wrap gap-2">
            {quickActions.map((s) => (
              <Button
                type="button"
                key={s}
                onClick={() => onSend(s)}
                variant="outline"
                size="sm"
                className="rounded-full"
              >
                {s}
              </Button>
            ))}
          </div>
        </div>
      )}

      <div ref={messagesEndRef} />
    </div>
  );
}
