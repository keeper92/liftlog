'use client';

import { useEffect } from 'react';
import { usePRStore, type PRRecord } from '@/stores/prStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { toDisplayWeight, weightUnit } from '@/lib/utils/units';

interface PRFeedOverlayProps {
  onClose: () => void;
}

function formatPRImprovement(pr: PRRecord, unitSystem: 'imperial' | 'metric'): string {
  const unit = weightUnit(unitSystem);
  if (pr.metric === 'weight') {
    const diff = toDisplayWeight(pr.newValue - pr.previousValue, unitSystem);
    const prev = toDisplayWeight(pr.previousValue, unitSystem);
    const curr = toDisplayWeight(pr.newValue, unitSystem);
    return `+${diff} ${unit} (${prev} → ${curr} ${unit})`;
  }
  const diff = pr.newValue - pr.previousValue;
  return `+${diff} reps (${pr.previousValue} → ${pr.newValue})`;
}

function groupByDate(records: PRRecord[]): { dateLabel: string; items: PRRecord[] }[] {
  const groups = new Map<string, PRRecord[]>();
  for (const record of records) {
    const dateKey = new Date(record.date).toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
    if (!groups.has(dateKey)) {
      groups.set(dateKey, []);
    }
    groups.get(dateKey)!.push(record);
  }
  return Array.from(groups.entries()).map(([dateLabel, items]) => ({ dateLabel, items }));
}

export default function PRFeedOverlay({ onClose }: PRFeedOverlayProps) {
  const records = usePRStore((s) => s.records);
  const markAllRead = usePRStore((s) => s.markAllRead);
  const unitSystem = useSettingsStore((s) => s.unitSystem);

  useEffect(() => {
    markAllRead();
  }, [markAllRead]);

  const grouped = groupByDate(records);

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Header */}
      <div className="px-5 pt-8 pb-4 border-b border-border bg-surface flex items-center justify-between">
        <div>
          <p className="text-sm font-black text-primary tracking-tight">reps</p>
          <h1 className="text-2xl font-bold mt-1">Personal Records</h1>
        </div>
        <button
          onClick={onClose}
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-surface-light transition-colors"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-text-muted">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-5 pt-4 pb-8">
        {records.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-12 h-12 rounded-full bg-surface-light flex items-center justify-center mx-auto mb-3">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-text-muted">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
            </div>
            <p className="text-text-muted">No personal records yet</p>
            <p className="text-text-muted text-sm mt-1">Beat a previous best to see your PRs here!</p>
          </div>
        ) : (
          <div className="space-y-6">
            {grouped.map(({ dateLabel, items }) => (
              <div key={dateLabel}>
                <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
                  {dateLabel}
                </h3>
                <div className="space-y-2">
                  {items.map((pr) => (
                    <div key={pr.id} className="bg-surface rounded-2xl p-4 card-shadow flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="text-primary">
                          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-text">{pr.exerciseName}</p>
                        <p className="text-xs text-text-muted mt-0.5">
                          {formatPRImprovement(pr, unitSystem)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
