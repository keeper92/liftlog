'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { formatRelativeDate, formatDuration } from '@/lib/utils/units';

interface WorkoutSet {
  exercise_id: string;
  set_number: number;
  reps: number | null;
  exercises: {
    name: string;
  };
}

interface HistoryWorkout {
  id: string;
  name: string | null;
  date: string;
  start_time: string;
  end_time: string | null;
  sets: WorkoutSet[];
}

interface GroupedExercise {
  name: string;
  sets: number[];
}

interface HistoryOverlayProps {
  onClose: () => void;
  longestStreak: number;
  currentStreak: number;
  totalWorkouts: number;
}

export default function HistoryOverlay({ onClose, longestStreak, currentStreak, totalWorkouts }: HistoryOverlayProps) {
  const supabase = useMemo(() => createClient(), []);
  const [workouts, setWorkouts] = useState<HistoryWorkout[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('workouts')
        .select('id, name, date, start_time, end_time, sets(exercise_id, set_number, reps, exercises(name))')
        .order('date', { ascending: false })
        .limit(200);
      if (data) setWorkouts(data as unknown as HistoryWorkout[]);
      setLoading(false);
    }
    load();
  }, [supabase]);

  function groupByExercise(sets: WorkoutSet[]): GroupedExercise[] {
    const exerciseMap = new Map<string, { name: string; sets: { num: number; reps: number }[] }>();
    for (const set of sets) {
      const key = set.exercise_id;
      if (!exerciseMap.has(key)) {
        exerciseMap.set(key, { name: set.exercises.name, sets: [] });
      }
      exerciseMap.get(key)!.sets.push({ num: set.set_number, reps: set.reps || 0 });
    }
    return Array.from(exerciseMap.values()).map((ex) => ({
      name: ex.name,
      sets: ex.sets.sort((a, b) => a.num - b.num).map((s) => s.reps),
    }));
  }

  function getWorkoutsForDate(dateStr: string): HistoryWorkout[] {
    return workouts.filter((w) => w.date.split('T')[0] === dateStr);
  }

  const workoutDates = new Set(workouts.map((w) => w.date.split('T')[0]));

  // Calendar helpers
  function getDaysInMonth(date: Date): number {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  }

  function getFirstDayOfMonth(date: Date): number {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  }

  function formatDateKey(year: number, month: number, day: number): string {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  function prevMonth() {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
    setSelectedDate(null);
  }

  function nextMonth() {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
    setSelectedDate(null);
  }

  const daysInMonth = getDaysInMonth(currentMonth);
  const firstDay = getFirstDayOfMonth(currentMonth);
  const monthName = currentMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const selectedWorkouts = selectedDate ? getWorkoutsForDate(selectedDate) : [];

  return (
    <div data-tour-anchor="history-overlay" className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Close button */}
      <div className="px-5 pt-4 flex justify-end">
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

      {/* Streak Stats */}
      <div className="px-5 py-5 bg-surface border-b border-border">
        <div className="flex items-center justify-around">
          <div className="text-center">
            <p className="text-2xl font-bold text-text">{longestStreak}</p>
            <p className="text-xs text-text-muted mt-0.5">Longest Streak</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-text">{currentStreak}</p>
            <p className="text-xs text-text-muted mt-0.5">Current Streak</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-text">{totalWorkouts}</p>
            <p className="text-xs text-text-muted mt-0.5">Total Workouts</p>
          </div>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-5 pt-4 pb-8">
        {loading ? (
          <p className="text-text-muted text-sm text-center py-8">Loading...</p>
        ) : workouts.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-text-muted">No workouts yet.</p>
            <p className="text-text-muted text-sm mt-1">Start your first workout!</p>
          </div>
        ) : (
          <div>
            {/* Calendar Card */}
            <div className="bg-surface rounded-2xl p-4 card-shadow">
              {/* Calendar Header */}
              <div className="flex items-center justify-between mb-4">
                <button onClick={prevMonth} className="p-2 -ml-2 text-text-muted hover:text-text transition-colors rounded-full hover:bg-surface-light">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                </button>
                <h2 className="text-sm font-semibold">{monthName}</h2>
                <button onClick={nextMonth} className="p-2 -mr-2 text-text-muted hover:text-text transition-colors rounded-full hover:bg-surface-light">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              </div>

              {/* Day headers */}
              <div className="grid grid-cols-7 gap-1 mb-2">
                {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((day, i) => (
                  <div key={i} className="text-center text-xs text-text-muted font-medium py-1">
                    {day}
                  </div>
                ))}
              </div>

              {/* Calendar grid */}
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: firstDay }).map((_, i) => (
                  <div key={`empty-${i}`} className="aspect-square" />
                ))}

                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const day = i + 1;
                  const dateKey = formatDateKey(currentMonth.getFullYear(), currentMonth.getMonth(), day);
                  const hasWorkout = workoutDates.has(dateKey);
                  const isSelected = selectedDate === dateKey;
                  const isToday = dateKey === new Date().toISOString().split('T')[0];

                  return (
                    <button
                      key={day}
                      onClick={() => hasWorkout && setSelectedDate(isSelected ? null : dateKey)}
                      disabled={!hasWorkout}
                      className={`aspect-square rounded-xl flex flex-col items-center justify-center text-xs font-semibold transition-all relative ${
                        isSelected
                          ? 'bg-primary text-white shadow-sm'
                          : isToday
                            ? 'bg-text text-white'
                            : hasWorkout
                              ? 'text-text hover:bg-surface-light'
                              : 'text-text-muted'
                      } ${hasWorkout ? 'cursor-pointer' : 'cursor-default'}`}
                    >
                      {day}
                      {hasWorkout && !isSelected && !isToday && (
                        <span className="absolute bottom-1 w-1 h-1 rounded-full bg-primary" />
                      )}
                      {hasWorkout && isToday && !isSelected && (
                        <span className="absolute bottom-1 w-1 h-1 rounded-full bg-white" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Selected date details */}
            {selectedDate && selectedWorkouts.length > 0 && (
              <div className="mt-4">
                <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
                  {new Date(selectedDate + 'T12:00:00').toLocaleDateString(undefined, {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                  })}
                </h3>
                <div className="space-y-3">
                  {selectedWorkouts.map((w) => {
                    const exercises = groupByExercise(w.sets);
                    const duration = w.end_time
                      ? Math.floor((new Date(w.end_time).getTime() - new Date(w.start_time).getTime()) / 1000)
                      : 0;

                    return (
                      <div key={w.id} className="bg-surface rounded-2xl p-4 card-shadow">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <p className="font-semibold text-sm">{w.name || 'Workout'}</p>
                            <p className="text-xs text-text-muted mt-0.5">{formatRelativeDate(w.date)}</p>
                          </div>
                          {duration > 0 && (
                            <span className="text-xs text-text-muted bg-surface-light px-2 py-1 rounded-full">{formatDuration(duration)}</span>
                          )}
                        </div>
                        <div className="space-y-1.5">
                          {exercises.map((ex, i) => (
                            <div key={i} className="text-xs flex items-baseline">
                              <span className="text-text font-medium">{ex.name}</span>
                              <span className="text-text-muted ml-2">
                                {ex.sets.length} × ({ex.sets.join(', ')})
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* No date selected hint */}
            {!selectedDate && (
              <p className="text-xs text-text-muted text-center mt-4">Tap a date with a workout to see details</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
