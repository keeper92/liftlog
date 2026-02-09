import type { UnitSystem } from '@/lib/types/user';

const LB_TO_KG = 0.453592;

// Weights are stored in lbs internally
export function toDisplayWeight(lbs: number, unit: UnitSystem): number {
  if (unit === 'metric') {
    return Math.round(lbs * LB_TO_KG * 10) / 10;
  }
  return Math.round(lbs);
}

export function toStorageWeight(value: number, unit: UnitSystem): number {
  if (unit === 'metric') {
    // Convert kg input to lbs for storage
    return Math.round(value / LB_TO_KG);
  }
  return value;
}

export function weightUnit(unit: UnitSystem): string {
  return unit === 'imperial' ? 'lb' : 'kg';
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;

  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;

  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// Cardio time utilities
export function formatTimeInput(seconds: number | null): string {
  if (seconds === null || seconds === 0) return '';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function parseTimeInput(input: string): number | null {
  if (!input || input.trim() === '') return null;
  const trimmed = input.trim();

  // Handle mm:ss format
  if (trimmed.includes(':')) {
    const parts = trimmed.split(':');
    const minutes = parseInt(parts[0]) || 0;
    const seconds = parseInt(parts[1]) || 0;
    return minutes * 60 + seconds;
  }

  // Treat single number as minutes
  const minutes = parseInt(trimmed);
  return isNaN(minutes) ? null : minutes * 60;
}

// Cardio distance utilities
const MI_TO_KM = 1.60934;

export function distanceUnit(unit: UnitSystem): string {
  return unit === 'imperial' ? 'mi' : 'km';
}

export function toDisplayDistance(miles: number | null, unit: UnitSystem): number | null {
  if (miles === null) return null;
  if (unit === 'metric') {
    return Math.round(miles * MI_TO_KM * 100) / 100;
  }
  return Math.round(miles * 100) / 100;
}

export function toStorageDistance(value: number, unit: UnitSystem): number {
  if (unit === 'metric') {
    // Convert km input to miles for storage
    return value / MI_TO_KM;
  }
  return value;
}

// Calculate pace from time (seconds) and distance (miles)
export function calculatePace(timeSeconds: number | null, distanceMiles: number | null, unit: UnitSystem): string | null {
  if (!timeSeconds || !distanceMiles || distanceMiles === 0) return null;

  // Convert distance to display unit for pace calculation
  const displayDistance = unit === 'metric' ? distanceMiles * MI_TO_KM : distanceMiles;

  // Pace in seconds per unit (mile or km)
  const paceSeconds = timeSeconds / displayDistance;
  const paceMinutes = Math.floor(paceSeconds / 60);
  const paceRemainingSeconds = Math.round(paceSeconds % 60);

  return `${paceMinutes}:${paceRemainingSeconds.toString().padStart(2, '0')}/${unit === 'metric' ? 'km' : 'mi'}`;
}
