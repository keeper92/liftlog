import { create } from 'zustand';

interface ChatBarState {
  isExpanded: boolean;
  exerciseContext: { exerciseId: string; exerciseName: string } | null;
  pendingMessage: string | null;

  expand: () => void;
  collapse: () => void;
  toggleExpanded: () => void;
  setExerciseContext: (ctx: { exerciseId: string; exerciseName: string } | null) => void;
  setPendingMessage: (msg: string | null) => void;
  openWithMessage: (message: string) => void;
  openForExercise: (exerciseId: string, exerciseName: string) => void;
}

export const useChatBarStore = create<ChatBarState>((set) => ({
  isExpanded: false,
  exerciseContext: null,
  pendingMessage: null,

  expand: () => set({ isExpanded: true }),
  collapse: () => set({ isExpanded: false }),
  toggleExpanded: () => set((s) => ({ isExpanded: !s.isExpanded })),
  setExerciseContext: (ctx) => set({ exerciseContext: ctx }),
  setPendingMessage: (msg) => set({ pendingMessage: msg }),
  openWithMessage: (message) => set({ isExpanded: true, pendingMessage: message }),
  openForExercise: (exerciseId, exerciseName) =>
    set({ isExpanded: true, exerciseContext: { exerciseId, exerciseName } }),
}));
