'use client';

import { useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { usePRStore } from '@/stores/prStore';
import { useActiveWorkoutStore } from '@/stores/activeWorkoutStore';
import { useTrainerProfileStore } from '@/stores/trainerProfileStore';

export interface Nudge {
  label: string;
  message: string; // What gets sent to chat when tapped
}

/**
 * Rule-based contextual suggestion chips per page.
 * No API calls — instant, client-side computation.
 */
export function useContextualNudges(): Nudge[] {
  const pathname = usePathname();
  const prRecords = usePRStore((s) => s.records);
  const unreadPRs = usePRStore((s) => s.unreadCount);
  const isWorkoutActive = useActiveWorkoutStore((s) => s.isActive);
  const trainerProfile = useTrainerProfileStore((s) => s.profile);

  return useMemo(() => {
    const nudges: Nudge[] = [];

    // ─── Dashboard ────────────────────────────────────────
    if (pathname === '/dashboard') {
      // Celebrate recent PRs
      if (unreadPRs > 0 && prRecords.length > 0) {
        const latestPR = prRecords[prRecords.length - 1];
        nudges.push({
          label: `Nice PR on ${latestPR.exerciseName}!`,
          message: `Tell me about my recent PR on ${latestPR.exerciseName}`,
        });
      }

      // Suggest starting a workout
      if (!isWorkoutActive) {
        nudges.push({
          label: 'Start a workout',
          message: 'Help me plan a workout for today',
        });
      }

      // Suggest template creation
      nudges.push({
        label: 'Create a template',
        message: 'Create a workout template',
      });

      // Profile setup nudge
      if (!trainerProfile) {
        nudges.push({
          label: 'Set up your profile',
          message: 'Set up my training profile',
        });
      }
    }

    // ─── Progress ─────────────────────────────────────────
    if (pathname === '/progress') {
      nudges.push({
        label: 'Analyze my progress',
        message: 'Analyze my recent training progress',
      });
      nudges.push({
        label: 'What should I focus on?',
        message: 'Based on my training data, what should I focus on improving?',
      });
    }

    // ─── Settings ─────────────────────────────────────────
    // No nudges on settings — it's a functional page

    // Limit to 3 nudges max
    return nudges.slice(0, 3);
  }, [pathname, prRecords, unreadPRs, isWorkoutActive, trainerProfile]);
}
