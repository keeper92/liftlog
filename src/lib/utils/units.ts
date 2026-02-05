import type { UnitSystem } from '@/lib/types/user';

const KG_TO_LB = 2.20462;
const LB_TO_KG = 0.453592;

export function toDisplayWeight(kg: number, unit: UnitSystem): number {
  if (unit === 'imperial') {
    return Math.round(kg * KG_TO_LB * 10) / 10;
  }
  return Math.round(kg * 10) / 10;
}

export function toStorageWeight(value: number, unit: UnitSystem): number {
  if (unit === 'imperial') {
    return Math.round(value * LB_TO_KG * 100) / 100;
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
