import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

interface ChatState {
  messages: ChatMessage[];
  addMessage: (role: 'user' | 'assistant', content: string) => string;
  updateMessage: (id: string, content: string) => void;
  clearChat: () => void;
}

export const useChatStore = create<ChatState>()(
  persist(
    (set) => ({
      messages: [],
      addMessage: (role, content) => {
        const id = crypto.randomUUID();
        set((state) => ({
          messages: [
            ...state.messages,
            { id, role, content, timestamp: new Date().toISOString() },
          ],
        }));
        return id;
      },
      updateMessage: (id, content) => {
        set((state) => ({
          messages: state.messages.map((m) =>
            m.id === id ? { ...m, content } : m
          ),
        }));
      },
      clearChat: () => set({ messages: [] }),
    }),
    { name: 'rep-chat' }
  )
);
