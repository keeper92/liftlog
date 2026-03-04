import { create } from 'zustand';
import type { AddExerciseResult } from '@/hooks/useChat';

export interface ActionChip {
  id: string;
  label: string;
  onAction: () => void;
}

interface WorkoutContext {
  exercises: string[];
  onAddExercise: (exercise: AddExerciseResult) => void;
}

interface ChatUIState {
  isOpen: boolean;
  intent: string | null;
  actionChips: ActionChip[];
  workoutContext: WorkoutContext | null;
  openChat: (intent?: string) => void;
  closeChat: () => void;
  setActionChips: (chips: ActionChip[]) => void;
  clearActionChips: () => void;
  setWorkoutContext: (ctx: WorkoutContext) => void;
  clearWorkoutContext: () => void;
}

export const useChatUIStore = create<ChatUIState>()((set) => ({
  isOpen: false,
  intent: null,
  actionChips: [],
  workoutContext: null,
  openChat: (intent?: string) => set({ isOpen: true, intent: intent || null }),
  closeChat: () => set({ isOpen: false, intent: null }),
  setActionChips: (chips) => set({ actionChips: chips }),
  clearActionChips: () => set({ actionChips: [] }),
  setWorkoutContext: (ctx) => set({ workoutContext: ctx }),
  clearWorkoutContext: () => set({ workoutContext: null }),
}));
