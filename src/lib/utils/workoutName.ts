const WEEKDAY_ABBREVIATIONS = ['Sun.', 'Mon.', 'Tue.', 'Wed.', 'Thu.', 'Fri.', 'Sat.'] as const;

export function formatAutoWorkoutName(dateInput: Date | string): string {
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(date.getTime())) {
    return 'Workout';
  }

  const weekday = WEEKDAY_ABBREVIATIONS[date.getDay()];
  const monthDayYear = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(date);

  return `${weekday} ${monthDayYear}`;
}
