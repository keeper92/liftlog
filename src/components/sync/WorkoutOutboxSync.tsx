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
      const {
        data: { user },
        error: userError,
      } = await withTimeout(supabase.auth.getUser(), SYNC_TIMEOUT_MS, 'Auth');
      if (userError || !user) return;

      for (const item of queue) {
        useWorkoutOutboxStore.getState().markSyncing(item.workoutId);
        try {
          await uploadWorkoutSnapshot(supabase, user.id, item.payload, SYNC_TIMEOUT_MS);
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
  const failedCount = items.filter((item) => item.lastError && !item.syncing).length;
  const statusText = syncing
    ? `Syncing ${pendingCount} saved workout${pendingCount === 1 ? '' : 's'}...`
    : offline
      ? `${pendingCount} workout${pendingCount === 1 ? '' : 's'} saved offline. Sync resumes when online.`
      : failedCount > 0
        ? `${pendingCount} workout${pendingCount === 1 ? '' : 's'} pending sync. Retrying automatically.`
        : `${pendingCount} workout${pendingCount === 1 ? '' : 's'} queued for sync.`;

  return (
    <div className="px-4 py-2 text-xs text-primary bg-primary/10 border-b border-primary/20">
      {statusText}
    </div>
  );
}

