'use client';

import { usePathname } from 'next/navigation';
import { useActiveWorkoutStore } from '@/stores/activeWorkoutStore';
import { useChatUIStore } from '@/stores/chatUIStore';
import { useContextualNudges } from '@/hooks/useContextualNudges';
import ChatBottomSheet from './ChatBottomSheet';

export default function ChatBar() {
  const pathname = usePathname();
  const isWorkoutSession =
    pathname.startsWith('/workout/') && !pathname.startsWith('/workout/summary/');
  const isActive = useActiveWorkoutStore((s) => s.isActive);
  const isOnWorkoutPage = pathname.startsWith('/workout');
  const showRibbon = isActive && !isOnWorkoutPage && pathname !== '/dashboard';

  const { isOpen, openChat, closeChat } = useChatUIStore();
  const actionChips = useChatUIStore((s) => s.actionChips);
  const nudges = useContextualNudges();

  // Hide the bar UI during workout sessions
  const hideBar = isWorkoutSession;

  const hasChips = actionChips.length > 0 || nudges.length > 0;

  return (
    <>
      {/* Compact chat bar - hidden during workouts and on trainer page */}
      {!hideBar && (
        <div
          className={`fixed left-0 right-0 z-50 ${
            showRibbon
              ? 'bottom-[calc(134px+env(safe-area-inset-bottom))]'
              : 'bottom-[calc(82px+env(safe-area-inset-bottom))]'
          }`}
        >
          <div className="mx-auto max-w-[430px] px-3">
            {/* Action chips + nudge chips */}
            {hasChips && !isOpen && (
              <div className="flex gap-1.5 overflow-x-auto pb-2 scrollbar-hide">
                {/* Action chips — direct actions, primary-tinted */}
                {actionChips.map((chip) => (
                  <button
                    key={chip.id}
                    type="button"
                    onClick={chip.onAction}
                    data-tour-anchor={chip.id === 'quick-start' ? 'start-workout' : undefined}
                    className="flex-shrink-0 rounded-full border border-primary/40 bg-background/95 px-3 py-1.5 text-xs font-medium text-foreground backdrop-blur transition-colors hover:bg-primary/10"
                  >
                    {chip.label}
                  </button>
                ))}
                {/* Chat nudges — open chat */}
                {nudges.map((nudge) => (
                  <button
                    key={nudge.label}
                    type="button"
                    onClick={() => openChat()}
                    className="flex-shrink-0 rounded-full border border-border/60 bg-background/95 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur transition-colors hover:bg-muted hover:text-foreground"
                  >
                    {nudge.label}
                  </button>
                ))}
              </div>
            )}

            {/* Input bar */}
            <button
              type="button"
              onClick={() => openChat()}
              className="flex w-full items-center gap-2 rounded-full border border-border/60 bg-background/95 px-4 py-2.5 shadow-sm backdrop-blur transition-colors hover:bg-muted"
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
              <span className="text-sm text-muted-foreground">Ask your trainer...</span>
            </button>
          </div>
        </div>
      )}

      {/* Bottom Sheet - always rendered so it can be opened from any page */}
      <ChatBottomSheet isOpen={isOpen} onClose={closeChat} />
    </>
  );
}
