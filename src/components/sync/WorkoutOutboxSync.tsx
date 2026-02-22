'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { uploadWorkoutSnapshot, withTimeout } from '@/lib/sync/workoutUpload';
import { useWorkoutOutboxStore } from '@/stores/workoutOutboxStore';

const SYNC_TIMEOUT_MS = 15000;
const SYNC_POLL_MS = 30000;

export default function WorkoutOutboxSync() {
  const supabase = useMemo(() => createClient(), []);
  const items = useWorkoutOutboxStore((s) => s.items);
  const pendingCount = items.length;
  const [syncing, setSyncing] = useState(false);
  const syncLockRef = useRef(false);

  const runSync = useCallback(async () => {
    if (syncLockRef.current) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;

    const queue = useWorkoutOutboxStore.getState().items;
    if (queue.length === 0) return;

    syncLockRef.current = true;
    setSyncing(true);

    try {
      let userId: string | null = null;
      let authErrorMessage: string | null = null;

      try {
        const {
          data: { user },
          error: userError,
        } = await withTimeout(supabase.auth.getUser(), SYNC_TIMEOUT_MS, 'Auth');
        if (userError) {
          authErrorMessage = userError.message || 'Unable to verify session';
        } else if (user) {
          userId = user.id;
        }
      } catch (error) {
        authErrorMessage = error instanceof Error ? error.message : 'Unable to verify session';
      }

      if (!userId) {
        try {
          const {
            data: { session },
            error: sessionError,
          } = await withTimeout(supabase.auth.getSession(), SYNC_TIMEOUT_MS, 'Session');
          if (sessionError) {
            authErrorMessage = authErrorMessage ?? sessionError.message ?? 'Unable to load session';
          } else if (session?.user?.id) {
            userId = session.user.id;
          }
        } catch (error) {
          if (!authErrorMessage) {
            authErrorMessage = error instanceof Error ? error.message : 'Unable to load session';
          }
        }
      }

      if (!userId) {
        const message = authErrorMessage
          ? `Sync paused: ${authErrorMessage}`
          : 'Sync paused. Sign in again to upload saved workouts.';
        for (const item of queue) {
          useWorkoutOutboxStore.getState().markFailed(item.workoutId, message);
        }
        return;
      }

      for (const item of queue) {
        if (item.ownerUserId && item.ownerUserId !== userId) {
          useWorkoutOutboxStore
            .getState()
            .markFailed(item.workoutId, 'Saved under a different account. Sign in to that account to sync this workout.');
          continue;
        }

        useWorkoutOutboxStore.getState().markSyncing(item.workoutId);
        try {
          await uploadWorkoutSnapshot(supabase, userId, item.payload, SYNC_TIMEOUT_MS);
          useWorkoutOutboxStore.getState().markSynced(item.workoutId);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Sync failed';
          useWorkoutOutboxStore.getState().markFailed(item.workoutId, message);
        }
      }
    } finally {
      syncLockRef.current = false;
      setSyncing(false);
    }
  }, [supabase]);

  useEffect(() => {
    if (pendingCount > 0) {
      runSync();
    }
  }, [pendingCount, runSync]);

  useEffect(() => {
    const handleReconnect = () => {
      runSync();
    };
    window.addEventListener('online', handleReconnect);
    window.addEventListener('focus', handleReconnect);
    return () => {
      window.removeEventListener('online', handleReconnect);
      window.removeEventListener('focus', handleReconnect);
    };
  }, [runSync]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      runSync();
    }, SYNC_POLL_MS);
    return () => window.clearInterval(intervalId);
  }, [runSync]);

  if (pendingCount === 0) return null;

  const offline = typeof navigator !== 'undefined' && !navigator.onLine;
  const failedItems = items.filter((item) => item.lastError && !item.syncing);
  const failedCount = failedItems.length;
  const latestFailure = failedItems.at(-1)?.lastError;
  const statusText = syncing
    ? `Syncing ${pendingCount} saved workout${pendingCount === 1 ? '' : 's'}...`
    : offline
      ? `${pendingCount} workout${pendingCount === 1 ? '' : 's'} saved offline. Sync resumes when online.`
      : failedCount > 0
        ? `${pendingCount} workout${pendingCount === 1 ? '' : 's'} pending sync. Retrying automatically.`
        : `${pendingCount} workout${pendingCount === 1 ? '' : 's'} queued for sync.`;

  return (
    <div className="px-4 py-2 text-xs text-primary bg-primary/10 border-b border-primary/20 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p>{statusText}</p>
        {latestFailure && (
          <p className="text-[11px] text-text-secondary truncate">{latestFailure}</p>
        )}
      </div>
      <button
        onClick={() => { runSync(); }}
        className="shrink-0 text-[11px] font-semibold text-primary hover:text-primary-light"
      >
        Retry
      </button>
    </div>
  );
}
