'use client';

import { useChatUIStore } from '@/stores/chatUIStore';
import ChatBottomSheet from './ChatBottomSheet';

export default function ChatBar() {
  const { isOpen, openChat, closeChat } = useChatUIStore();

  return (
    <>
      {/* Persistent floating chat trigger above bottom nav */}
      <div className="pointer-events-none fixed inset-x-0 z-50 bottom-[calc(82px+env(safe-area-inset-bottom)+10px)]">
        <div className="mx-auto flex w-full max-w-[430px] justify-end px-3">
          <button
            type="button"
            onClick={() => openChat()}
            aria-label="Open AI trainer chat"
            className="pointer-events-auto flex h-12 items-center gap-2 rounded-full border border-border/60 bg-background/95 px-4 shadow-sm backdrop-blur transition-colors hover:bg-muted"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-muted-foreground"
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <span className="text-sm font-medium text-foreground">AI Chat</span>
          </button>
        </div>
      </div>

      {/* Bottom Sheet - always rendered so it can be opened from any page */}
      <ChatBottomSheet isOpen={isOpen} onClose={closeChat} />
    </>
  );
}
