'use client';

import { usePathname } from 'next/navigation';
import { useChatBarStore } from '@/stores/chatBarStore';
import { useChatEngine, parseSuggestions } from '@/hooks/useChatEngine';
import { FileUploadButton, ChatSidebar } from '@/components/chat';
import { Button } from '@/components/ui/button-shadcn';
import { Input } from '@/components/ui/input-shadcn';
import ChatPanel from './ChatPanel';

export default function ChatBar() {
  const pathname = usePathname();
  const { isExpanded, expand, collapse } = useChatBarStore();
  const engine = useChatEngine();

  // Hide during active workout sessions (same as BottomNav)
  const isWorkoutSession = pathname.startsWith('/workout/') && !pathname.startsWith('/workout/summary/');
  if (isWorkoutSession) return null;

  // Get last assistant message for mini-preview
  const lastAssistantMessage = [...engine.messages].reverse().find((m) => m.role === 'assistant' && m.content);
  const miniPreviewText = lastAssistantMessage
    ? parseSuggestions(lastAssistantMessage.content).text
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/\n/g, ' ')
    : null;
  const showMiniPreview = !isExpanded && miniPreviewText && engine.messages.length > 0;

  return (
    <>
      <ChatPanel engine={engine} />

      <div
        className="fixed bottom-[calc(86px+env(safe-area-inset-bottom,0px))] left-0 right-0 z-50"
        data-tour-anchor="chat-bar"
      >
        <div className="mx-auto max-w-[430px]">
          {/* Mini response preview */}
          {showMiniPreview && (
            <button
              type="button"
              onClick={expand}
              className="mx-3 mb-1 block w-[calc(100%-1.5rem)] rounded-lg border border-border/70 bg-card px-4 py-2.5 text-left shadow-sm"
            >
              <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                {miniPreviewText}
              </p>
              <p className="mt-1 text-[10px] font-medium text-primary">
                Tap to expand
              </p>
            </button>
          )}

          {/* Input bar */}
          <div className="mx-3 rounded-lg border border-border/70 bg-background/95 px-3 py-2 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/90">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                engine.handleSend();
              }}
              className="flex items-center gap-2"
            >
              {/* Expand/sidebar button */}
              <button
                type="button"
                onClick={isExpanded ? collapse : expand}
                className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
              >
                {isExpanded ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                )}
              </button>

              {!engine.profileMode && (
                <FileUploadButton
                  onFileContent={engine.handleFileUpload}
                  disabled={engine.isLoading || !engine.context}
                />
              )}

              <Input
                ref={engine.inputRef}
                type="text"
                value={engine.input}
                onChange={(e) => engine.setInput(e.target.value)}
                onFocus={() => {
                  if (!isExpanded && engine.messages.length > 0) {
                    expand();
                  }
                }}
                placeholder={engine.profileMode ? 'Tell me about your training...' : 'Ask your trainer...'}
                disabled={engine.isLoading || !engine.context}
                className="h-9 flex-1 rounded-full text-sm"
              />

              <Button
                type="submit"
                size="icon"
                disabled={!engine.input.trim() || engine.isLoading || !engine.context}
                className="h-9 w-9 rounded-full"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="19" x2="12" y2="5" />
                  <polyline points="5 12 12 5 19 12" />
                </svg>
              </Button>
            </form>
          </div>
        </div>
      </div>

      {/* Chat Sidebar */}
      <ChatSidebar isOpen={engine.sidebarOpen} onClose={() => engine.setSidebarOpen(false)} />
    </>
  );
}
