import { create } from 'zustand';

interface ChatUIState {
  isOpen: boolean;
  intent: string | null;
  openChat: (intent?: string) => void;
  closeChat: () => void;
}

export const useChatUIStore = create<ChatUIState>()((set) => ({
  isOpen: false,
  intent: null,
  openChat: (intent?: string) => set({ isOpen: true, intent: intent || null }),
  closeChat: () => set({ isOpen: false, intent: null }),
}));
