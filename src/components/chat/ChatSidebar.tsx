'use client';

import { useEffect, useCallback } from 'react';
import { useChatStore } from '@/stores/chatStore';
import Button from '@/components/ui/Button';

interface ChatSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

function getTimeGroup(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);
  const monthAgo = new Date(today);
  monthAgo.setDate(monthAgo.getDate() - 30);

  if (date >= today) return 'Today';
  if (date >= yesterday) return 'Yesterday';
  if (date >= weekAgo) return 'Last 7 Days';
  if (date >= monthAgo) return 'Last 30 Days';
  return 'Older';
}

const GROUP_ORDER = ['Today', 'Yesterday', 'Last 7 Days', 'Last 30 Days', 'Older'];

export default function ChatSidebar({ isOpen, onClose }: ChatSidebarProps) {
  const conversations = useChatStore((s) => s.conversations);
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const createConversation = useChatStore((s) => s.createConversation);
  const switchConversation = useChatStore((s) => s.switchConversation);
  const deleteConversation = useChatStore((s) => s.deleteConversation);

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Escape key to close
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (isOpen) document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleKeyDown]);

  function handleNewChat() {
    createConversation();
    onClose();
  }

  function handleSelectConversation(id: string) {
    switchConversation(id);
    onClose();
  }

  function handleDeleteConversation(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    deleteConversation(id);
  }

  // Group conversations with messages by time
  const withMessages = conversations.filter((c) => c.messages.length > 0);
  const grouped = new Map<string, typeof withMessages>();
  for (const conv of withMessages) {
    const group = getTimeGroup(conv.updatedAt);
    if (!grouped.has(group)) grouped.set(group, []);
    grouped.get(group)!.push(conv);
  }

  return (
    <div className={`fixed inset-0 z-[60] ${isOpen ? '' : 'pointer-events-none'}`}>
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/30 transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
      />
      {/* Panel */}
      <div
        className={`absolute inset-y-0 left-0 w-[72%] max-w-[320px] bg-background flex flex-col transition-transform duration-300 ease-out shadow-xl ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-5 pb-3">
          <Button unstyled
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-surface-light transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-text">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </Button>
          <Button unstyled
            onClick={handleNewChat}
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-primary text-white text-xs font-medium shadow-sm"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            New chat
          </Button>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto px-3 pb-6">
          {withMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-4">
              <p className="text-sm text-text-muted">No conversations yet</p>
              <p className="text-xs text-text-muted mt-1">Start a chat with your trainer</p>
            </div>
          ) : (
            GROUP_ORDER.map((group) => {
              const items = grouped.get(group);
              if (!items || items.length === 0) return null;
              return (
                <div key={group} className="mb-4">
                  <p className="text-[11px] font-medium text-text-muted uppercase tracking-wide px-2 mb-1.5">
                    {group}
                  </p>
                  <div className="space-y-0.5">
                    {items.map((conv) => (
                      <div
                        key={conv.id}
                        onClick={() => handleSelectConversation(conv.id)}
                        className={`group flex items-center justify-between rounded-xl px-3 py-2.5 cursor-pointer transition-colors ${
                          conv.id === activeConversationId
                            ? 'bg-primary/10'
                            : 'hover:bg-surface-light'
                        }`}
                      >
                        <p className="text-sm text-text truncate flex-1 min-w-0 pr-2">
                          {conv.title}
                        </p>
                        <Button unstyled
                          onClick={(e) => handleDeleteConversation(e, conv.id)}
                          className="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-full opacity-0 group-hover:opacity-100 hover:bg-border/50 transition-all"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-text-muted">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                          </svg>
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
