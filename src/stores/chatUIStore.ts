import { create } from 'zustand';

export interface ActionChip {
  id: string;
  label: string;
  onAction: () => void;
}

interface ChatUIState {
  isOpen: boolean;
  intent: string | null;
  actionChips: ActionChip[];
  openChat: (intent?: string) => void;
  closeChat: () => void;
  setActionChips: (chips: ActionChip[]) => void;
  clearActionChips: () => void;
}

export const useChatUIStore = create<ChatUIState>()((set) => ({
  isOpen: false,
  intent: null,
  actionChips: [],
  openChat: (intent?: string) => set({ isOpen: true, intent: intent || null }),
  closeChat: () => set({ isOpen: false, intent: null }),
  setActionChips: (chips) => set({ actionChips: chips }),
  clearActionChips: () => set({ actionChips: [] }),
}));
